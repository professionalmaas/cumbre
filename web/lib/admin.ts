import { getUser, type SessionUser } from "@/lib/auth/session";

// Admin allowlist via ADMIN_EMAILS (comma-separated). Returns the user if admin, else null.
export async function requireAdmin(): Promise<SessionUser | null> {
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const user = await getUser();
  if (!user?.email) return null;
  if (!allow.includes(user.email.toLowerCase())) return null;
  return user;
}
