import Stripe from "stripe";

// Lazy server-side Stripe client.
let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { apiVersion: "2024-06-20" });
  }
  return _stripe;
}

// Two products from the design: Summit Pass (one-time, this song) and Season Pass (monthly, unlimited).
export interface Plan {
  id: "summit" | "season";
  label: string;
  price: string;
  mode: "payment" | "subscription";
  priceId: string | undefined;
  blurb: string;
  cta: string;
}

export const PLANS: Plan[] = [
  {
    id: "summit",
    label: "Summit Pass",
    price: "$9",
    mode: "payment",
    priceId: process.env.STRIPE_PRICE_SUMMIT,
    blurb: "One full analysis of this song — every score, fix, and the highlight.",
    cta: "Continue — pay $9 once",
  },
  {
    id: "season",
    label: "Season Pass",
    price: "$19/mo",
    mode: "subscription",
    priceId: process.env.STRIPE_PRICE_SEASON,
    blurb: "Unlimited analyses. Re-climb every version. Cancel anytime.",
    cta: "Continue — subscribe $19/mo",
  },
];

export function planById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
