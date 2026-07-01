import { jwtVerify, createRemoteJWKSet } from "jose";

// Cumbre's own Cognito user pool (self-signup). Authorization Code flow with a
// confidential client (client secret). All values come from env (see AWS_ARCHITECTURE.md).

const region = process.env.AWS_REGION ?? "us-east-1";

function cfg() {
  const domain = process.env.COGNITO_DOMAIN; // hosted-UI domain prefix
  const clientId = process.env.COGNITO_CLIENT_ID;
  const clientSecret = process.env.COGNITO_CLIENT_SECRET;
  const poolId = process.env.COGNITO_USER_POOL_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const issuer =
    process.env.COGNITO_ISSUER ??
    (poolId ? `https://cognito-idp.${region}.amazonaws.com/${poolId}` : undefined);
  if (!domain || !clientId || !clientSecret || !issuer) {
    throw new Error("Cognito env not fully configured (COGNITO_DOMAIN/CLIENT_ID/CLIENT_SECRET/ISSUER)");
  }
  const hostedUi = `https://${domain}.auth.${region}.amazoncognito.com`;
  return { domain, clientId, clientSecret, issuer, appUrl, hostedUi };
}

export function redirectUri(): string {
  return `${cfg().appUrl}/auth/callback`;
}

// Hosted-UI URL. The sign-up link lives on this page (self-service registration).
export function authorizeUrl(state: string, identityProvider?: string): string {
  const c = cfg();
  const p = new URLSearchParams({
    client_id: c.clientId,
    response_type: "code",
    scope: "openid email",
    redirect_uri: redirectUri(),
    state,
  });
  // identity_provider=Google sends the user straight to Google, bypassing the hosted-UI chooser.
  if (identityProvider) p.set("identity_provider", identityProvider);
  return `${c.hostedUi}/oauth2/authorize?${p.toString()}`;
}

export function logoutUrl(): string {
  const c = cfg();
  const p = new URLSearchParams({
    client_id: c.clientId,
    logout_uri: `${c.appUrl}/login`,
  });
  return `${c.hostedUi}/logout?${p.toString()}`;
}

export interface Tokens {
  id_token: string;
  access_token: string;
}

export async function exchangeCode(code: string): Promise<Tokens> {
  const c = cfg();
  const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: c.clientId,
    code,
    redirect_uri: redirectUri(),
  });
  const res = await fetch(`${c.hostedUi}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${basic}`,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  return (await res.json()) as Tokens;
}

// Cached remote JWKS per issuer.
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function jwks(issuer: string) {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return _jwks;
}

// Verify the Cognito ID token: signature (JWKS), issuer, audience, expiry. Fail closed.
// `audience` defaults to the OAuth hosted-UI client; pass the magic-link client id when
// verifying a token issued via the CUSTOM_AUTH flow (a different app client, different `aud`).
export async function verifyIdToken(
  idToken: string,
  audience?: string
): Promise<{ sub: string; email: string | null }> {
  const c = cfg();
  const { payload } = await jwtVerify(idToken, jwks(c.issuer), {
    issuer: c.issuer,
    audience: audience ?? c.clientId,
  });
  if (!payload.sub) throw new Error("id token missing sub");
  return { sub: payload.sub, email: (payload.email as string) ?? null };
}
