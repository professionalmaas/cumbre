import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { query } from "@/lib/db";

// Raw body required for signature verification; excluded from auth middleware.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sig = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return NextResponse.json({ error: "Missing signature/secret" }, { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "bad signature";
    return NextResponse.json({ error: `Webhook signature failed: ${msg}` }, { status: 400 });
  }

  // Event-level idempotency. Stripe delivers at-least-once and can reorder events; the first
  // time we see an id we claim it, and any redelivery short-circuits here with a 200 so we
  // never run a handler twice. A claim failure (DB down) falls through to a 500 below so
  // Stripe retries rather than silently dropping the event.
  try {
    const claimed = await query(
      `insert into processed_stripe_events (event_id, type) values ($1, $2)
       on conflict (event_id) do nothing`,
      [event.id, event.type]
    );
    if (claimed.length === 0) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        service: "cumbre-web",
        event: "stripe.webhook.idempotency_claim_failed",
        eventType: event.type,
        message: err instanceof Error ? err.message : String(err),
      })
    );
    return NextResponse.json({ error: "idempotency claim failed" }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.metadata?.user_id ?? s.client_reference_id ?? undefined;
        if (s.mode === "payment" && s.payment_status === "paid" && userId) {
          // Summit Pass -> grant 1 analysis credit, idempotent on the event id.
          await query(
            `insert into credit_ledger (user_id, delta, reason, stripe_event_id)
             values ($1, 1, 'purchase', $2) on conflict (stripe_event_id) do nothing`,
            [userId, event.id]
          );
        } else if (s.mode === "subscription" && userId && s.subscription) {
          // Season Pass via a hosted Payment Link: the session only carries
          // client_reference_id (no subscription.metadata.user_id), so set entitlement
          // here from the session's subscription + customer ids. The customer.subscription.*
          // events below keep status fresh thereafter. Upsert is idempotent per user.
          await query(
            `insert into subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, updated_at)
             values ($1, $2, $3, 'active', now())
             on conflict (user_id) do update set
               stripe_customer_id = excluded.stripe_customer_id,
               stripe_subscription_id = excluded.stripe_subscription_id,
               status = 'active',
               updated_at = now()`,
            [userId, s.customer ? String(s.customer) : null, String(s.subscription)]
          );
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;
        const userId = sub.metadata?.user_id;
        if (userId) {
          // Checkout-Sessions path: the subscription carries user_id in metadata.
          await query(
            `insert into subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, updated_at)
             values ($1, $2, $3, $4, $5, now())
             on conflict (user_id) do update set
               stripe_customer_id = excluded.stripe_customer_id,
               stripe_subscription_id = excluded.stripe_subscription_id,
               status = excluded.status,
               current_period_end = excluded.current_period_end,
               updated_at = now()`,
            [userId, String(sub.customer), sub.id, status, periodEnd]
          );
        } else {
          // Payment-Link path: no metadata.user_id — update by the subscription id the
          // checkout.session.completed handler already stored. No-op if we never saw it.
          await query(
            `update subscriptions set status = $2, current_period_end = $3, updated_at = now()
             where stripe_subscription_id = $1`,
            [sub.id, status, periodEnd]
          );
        }
        break;
      }
      case "invoice.payment_failed": {
        // A recurring (or first) charge failed -> mark past_due so entitlement drops until
        // recovered. Match by the invoice's subscription id, then fall back to the customer.
        const inv = event.data.object as Stripe.Invoice;
        const subId = inv.subscription ? String(inv.subscription) : null;
        const customer = inv.customer ? String(inv.customer) : null;
        if (subId) {
          await query(
            `update subscriptions set status = 'past_due', updated_at = now()
             where stripe_subscription_id = $1`,
            [subId]
          );
        } else if (customer) {
          await query(
            `update subscriptions set status = 'past_due', updated_at = now()
             where stripe_customer_id = $1`,
            [customer]
          );
        }
        break;
      }
      case "invoice.payment_succeeded": {
        // A charge cleared -> restore the subscription to active (recovers a past_due row,
        // and is a harmless no-op when it was already active).
        const inv = event.data.object as Stripe.Invoice;
        const subId = inv.subscription ? String(inv.subscription) : null;
        const customer = inv.customer ? String(inv.customer) : null;
        if (subId) {
          await query(
            `update subscriptions set status = 'active', updated_at = now()
             where stripe_subscription_id = $1`,
            [subId]
          );
        } else if (customer) {
          await query(
            `update subscriptions set status = 'active', updated_at = now()
             where stripe_customer_id = $1`,
            [customer]
          );
        }
        break;
      }
      case "charge.dispute.created": {
        // A customer disputed a charge (chargeback). Pull access immediately and queue a
        // human review. Fail-safe: if we can't resolve the user we still 200 + log so Stripe
        // doesn't retry forever — the review_queue line (when we have a job/customer) and the
        // structured error are the audit trail.
        const dispute = event.data.object as Stripe.Dispute;
        const charge = dispute.charge ? String(dispute.charge) : null;
        const customer = dispute.payment_intent || charge ? await resolveDisputeCustomer(dispute) : null;

        let userId: string | null = null;
        if (customer) {
          const row = await query<{ user_id: string }>(
            `select user_id from subscriptions where stripe_customer_id = $1 limit 1`,
            [customer]
          );
          userId = row[0]?.user_id ?? null;
        }

        if (userId) {
          // Revoke a Season subscription if they hold one...
          await query(
            `update subscriptions set status = 'canceled', updated_at = now() where user_id = $1`,
            [userId]
          );
          // ...and zero out any granted Summit credit with a compensating ledger entry so a
          // disputed one-time purchase can't still be spent. Idempotent on the event id.
          await query(
            `insert into credit_ledger (user_id, delta, reason, stripe_event_id)
             values ($1, -1, 'dispute', $2) on conflict (stripe_event_id) do nothing`,
            [userId, event.id]
          );
        }

        await query(
          `insert into review_queue (job_id, category, payload)
           select id, 'dispute', $2::jsonb from jobs where user_id = $1 order by created_at desc limit 1`,
          [
            userId,
            JSON.stringify({
              dispute_id: dispute.id,
              charge,
              customer,
              reason: dispute.reason,
              amount: dispute.amount,
              user_id: userId,
            }),
          ]
        );

        console.error(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: "error",
            service: "cumbre-web",
            event: "stripe.charge.dispute.created",
            eventType: event.type,
            jobId: userId,
            dispute_id: dispute.id,
            charge,
            customer,
            user_id: userId,
            user_resolved: !!userId,
            reason: dispute.reason,
            amount: dispute.amount,
          })
        );
        break;
      }
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        service: "cumbre-web",
        event: "stripe.webhook.handler_failed",
        eventType: event.type,
        message: err instanceof Error ? err.message : String(err),
      })
    );
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// A dispute may carry the customer id only indirectly (via charge/payment_intent). Prefer the
// charge object's customer; fall back to the payment intent. Returns null on any lookup error
// so the dispute handler can still fail-safe to a 200 + structured log.
async function resolveDisputeCustomer(dispute: Stripe.Dispute): Promise<string | null> {
  try {
    if (dispute.charge) {
      const charge = await stripe().charges.retrieve(String(dispute.charge));
      if (charge.customer) return String(charge.customer);
    }
    if (dispute.payment_intent) {
      const pi = await stripe().paymentIntents.retrieve(String(dispute.payment_intent));
      if (pi.customer) return String(pi.customer);
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        service: "cumbre-web",
        event: "stripe.dispute.customer_resolution_failed",
        message: err instanceof Error ? err.message : String(err),
      })
    );
  }
  return null;
}
