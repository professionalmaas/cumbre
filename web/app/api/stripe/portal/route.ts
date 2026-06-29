import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { one } from "@/lib/db";
import { stripe } from "@/lib/stripe";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Opens the Stripe Billing Portal so a subscriber can update their card, view invoices, or
// cancel. We resolve the customer id from the subscriptions row written by the webhook —
// a user with no Stripe customer (never paid) gets a 403.
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const row = await one<{ stripe_customer_id: string | null }>(
    `select stripe_customer_id from subscriptions where user_id = $1`,
    [user.sub]
  );
  if (!row?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account on file" }, { status: 403 });
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${appUrl}/profile`,
  });

  return NextResponse.json({ url: session.url });
}
