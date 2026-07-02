import { NextResponse } from "next/server";
import { exchangeCode, verifyIdToken } from "@/lib/auth/cognito";
import { createSession } from "@/lib/auth/session";
import { ensureUser } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Cognito hosted-UI redirect: exchange the code, verify the ID token (fail closed),
// provision the user row + free credit on first login, then set the session cookie.
// Use NEXT_PUBLIC_APP_URL for redirects — request.url reflects the container's
// internal address (http://0.0.0.0:3000) behind the ALB, not the public domain.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const origin = appUrl || new URL(request.url).origin;
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);

  // The public /plans page starts sign-in with state="plan:<id>" so the user lands back on
  // the right checkout after auth. Allowlist-mapped to fixed paths only (never a raw
  // redirect from state — that would be an open redirect).
  const state = searchParams.get("state") ?? "";
  const planDest =
    state === "plan:summit" ? "/plans?plan=summit" : state === "plan:season" ? "/plans?plan=season" : null;

  try {
    const tokens = await exchangeCode(code);
    const { sub, email } = await verifyIdToken(tokens.id_token);
    await ensureUser(sub, email);
    await createSession({ sub, email });
    return NextResponse.redirect(`${origin}${planDest ?? "/"}`);
  } catch (err) {
    console.error("auth callback failed", err);
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }
}
