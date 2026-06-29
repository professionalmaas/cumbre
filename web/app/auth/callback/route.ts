import { NextResponse } from "next/server";
import { exchangeCode, verifyIdToken } from "@/lib/auth/cognito";
import { createSession } from "@/lib/auth/session";
import { ensureUser } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Cognito hosted-UI redirect: exchange the code, verify the ID token (fail closed),
// provision the user row + free credit on first login, then set the session cookie.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);

  try {
    const tokens = await exchangeCode(code);
    const { sub, email } = await verifyIdToken(tokens.id_token);
    await ensureUser(sub, email);
    await createSession({ sub, email });
    return NextResponse.redirect(`${origin}/`);
  } catch (err) {
    console.error("auth callback failed", err);
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }
}
