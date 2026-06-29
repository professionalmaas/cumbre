import { getBalance } from "@/lib/queries";
import { one } from "@/lib/db";
import { DEV_MODE } from "@/lib/devMode";

export interface Entitlement {
  hasAccess: boolean;
  subscriptionActive: boolean;
  credits: number;
}

const ACTIVE = new Set(["active", "trialing"]);

// Access = an active Season subscription OR at least one Summit credit on the ledger.
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const [sub, credits] = await Promise.all([
    one<{ status: string }>(`select status from subscriptions where user_id = $1`, [userId]),
    getBalance(userId),
  ]);
  const subscriptionActive = !!sub && ACTIVE.has(sub.status);
  // DEV_MODE auto-grants access so the owner can reach upload without Stripe. The real
  // ledger/subscription is still read above, so Stripe test-mode keeps working too — this
  // only widens access in dev, it never narrows it.
  const hasAccess = DEV_MODE || subscriptionActive || credits >= 1;
  return { subscriptionActive, credits, hasAccess };
}
