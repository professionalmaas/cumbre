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
    }
  } catch (err) {
    console.error("stripe webhook handler failed", err);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
