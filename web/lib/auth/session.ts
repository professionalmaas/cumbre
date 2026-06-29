import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { DEV_MODE, DEV_USER } from "@/lib/devMode";

// App session is a self-contained signed JWT cookie (no DB session table). Carries the
// Cognito subject + email. Signed with SESSION_SECRET (from Secrets Manager).
const COOKIE = "cumbre_session";
const DEV_COOKIE = "cumbre_dev_session"; // set by /login in DEV_MODE (presence = signed in)
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
  sub: string;
  email: string | null;
}

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

// DEV_MODE: a trivial cookie marks the stub dev user as signed in (no Cognito, no JWT).
export function createDevSession(): void {
  cookies().set(DEV_COOKIE, "1", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());

  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSession(): void {
  cookies().set(COOKIE, "", { path: "/", maxAge: 0 });
  if (DEV_MODE) cookies().set(DEV_COOKIE, "", { path: "/", maxAge: 0 });
}

// Returns the signed-in user or null. Verifies signature + expiry; fails closed.
export async function getUser(): Promise<SessionUser | null> {
  // DEV_MODE: bypass Cognito entirely. Once /login set the dev cookie, getUser returns the
  // stable stub dev user. The Cognito JWT path below is the default whenever DEV_MODE is unset.
  if (DEV_MODE) {
    return cookies().get(DEV_COOKIE)?.value ? { ...DEV_USER } : null;
  }
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (!payload.sub) return null;
    return { sub: payload.sub, email: (payload.email as string) ?? null };
  } catch {
    return null;
  }
}
