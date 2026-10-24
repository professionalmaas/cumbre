"use server";

import { getUser } from "@/lib/auth/session";
import { getEntitlement } from "@/lib/entitlement";
import { getDisplayName, setDisplayName, unlockJobReport } from "@/lib/queries";
import { DEV_MODE } from "@/lib/devMode";

export async function completeProfile(displayName: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const trimmed = displayName.trim();
  if (trimmed.length < 2 || trimmed.length > 60) {
    return { ok: false, error: "Enter a name between 2 and 60 characters." };
  }

  await setDisplayName(user.sub, trimmed);
  return { ok: true };
}

// Unlocking a specific job's full report requires BOTH payment (subscription or 1 credit)
// AND a completed profile — running the analysis itself is free (see upload.ts).
export async function unlockFullReport(
  jobId: string
): Promise<{ ok: true } | { ok: false; error: "no_credits" | "needs_profile" | "not_found" | "not_signed_in" }> {
  const user = await getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const [ent, displayName] = await Promise.all([
    getEntitlement(user.sub, user.email ?? undefined),
    getDisplayName(user.sub),
  ]);

  // DEV_MODE auto-grants the entitlement (see lib/entitlement.ts and dev/README.md), so the
  // local loop has no pay or profile gate. Both gates stay exactly as they are in production.
  const waived = DEV_MODE || ent.isAdmin;
  if (!waived && !ent.subscriptionActive && ent.credits < 1) {
    return { ok: false, error: "no_credits" };
  }
  if (!waived && (!displayName || displayName.trim().length < 2)) {
    return { ok: false, error: "needs_profile" };
  }

  const result = await unlockJobReport({
    jobId,
    userId: user.sub,
    subscriptionActive: waived || ent.subscriptionActive,
  });
  if (!result.unlocked) return { ok: false, error: "not_found" };
  return { ok: true };
}
