import { getBalance } from "@/lib/queries";
import { one } from "@/lib/db";
import { DEV_MODE } from "@/lib/devMode";

export interface Entitlement {
  hasAccess: boolean;
  subscriptionActive: boolean;
  credits: number;
  isAdmin: boolean;
}

const ACTIVE = new Set(["active", "trialing"]);

function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

// Access = admin OR active Season subscription OR at least one Summit credit on the ledger.
export async function getEntitlement(userId: string, email?: string): Promise<Entitlement> {
  const adminUser = isAdminEmail(email);
  if (adminUser) {
    // Admins bypass ledger checks entirely — unlimited access.
    return { hasAccess: true, subscriptionActive: true, credits: Infinity, isAdmin: true };
  }

  const [sub, credits] = await Promise.all([
    one<{ status: string }>(`select status from subscriptions where user_id = $1`, [userId]),
    getBalance(userId),
  ]);
  const subscriptionActive = !!sub && ACTIVE.has(sub.status);
  // DEV_MODE auto-grants access so the owner can reach upload without Stripe. The real
  // ledger/subscription is still read above, so Stripe test-mode keeps working too.
  const hasAccess = DEV_MODE || subscriptionActive || credits >= 1;
  return { subscriptionActive, credits, hasAccess, isAdmin: false };
}
