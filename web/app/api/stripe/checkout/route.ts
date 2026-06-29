import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { stripe, planById } from "@/lib/stripe";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Creates a Stripe Checkout session for the Summit (one-time) or Season (subscription) plan.
// The webhook is what grants entitlement (credit or subscription) after payment.
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { planId } = (await request.json().catch(() => ({}))) as { planId?: string };
  const plan = planById(planId ?? "");
  if (!plan) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  if (!plan.priceId) {
    return NextResponse.json({ error: `No Stripe price configured for '${plan.id}'` }, { status: 500 });
  }

  const session = await stripe().checkout.sessions.create({
    mode: plan.mode,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    client_reference_id: user.sub,
    customer_email: user.email ?? undefined,
    metadata: { user_id: user.sub, plan: plan.id },
    // Summit (mode=payment) one-time charges: ask Stripe to email a receipt to the buyer.
    // (Subscriptions email invoice receipts on their own; hosted Payment Links handle their
    // own receipts via the Stripe Dashboard "Customer emails" setting.)
    payment_intent_data:
      plan.mode === "payment" && user.email ? { receipt_email: user.email } : undefined,
    // For subscriptions, propagate the user id onto the subscription too.
    subscription_data: plan.mode === "subscription" ? { metadata: { user_id: user.sub } } : undefined,
    success_url: `${appUrl}/upload?checkout=success`,
    cancel_url: `${appUrl}/plans?checkout=cancel`,
  });

  return NextResponse.json({ url: session.url });
}
