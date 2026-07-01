"use server";

import { randomUUID, randomBytes, createHmac } from "crypto";
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { query, one } from "@/lib/db";
import { verifyIdToken } from "@/lib/auth/cognito";
import { createSession } from "@/lib/auth/session";
import { ensureUser } from "@/lib/queries";

const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION ?? "us-east-1" });

function cfg() {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.MAGIC_LINK_CLIENT_ID;
  const clientSecret = process.env.MAGIC_LINK_CLIENT_SECRET;
  if (!userPoolId || !clientId || !clientSecret) {
    throw new Error("Magic-link Cognito env not fully configured (COGNITO_USER_POOL_ID/MAGIC_LINK_CLIENT_ID/MAGIC_LINK_CLIENT_SECRET)");
  }
  return { userPoolId, clientId, clientSecret };
}

function secretHash(username: string, clientId: string, clientSecret: string): string {
  return createHmac("sha256", clientSecret).update(username + clientId).digest("base64");
}

async function findExistingUsername(userPoolId: string, email: string): Promise<string | null> {
  const res = await client.send(
    new ListUsersCommand({ UserPoolId: userPoolId, Filter: `email = "${email.replace(/"/g, '\\"')}"`, Limit: 1 })
  );
  return res.Users?.[0]?.Username ?? null;
}

// New passwordless-only user. AdminCreateUser alone leaves the user in FORCE_CHANGE_PASSWORD,
// which blocks CUSTOM_AUTH — AdminSetUserPassword with Permanent:true is required to reach
// CONFIRMED. The password itself is a discarded random value; this user only ever
// authenticates via the magic-link CUSTOM_AUTH flow.
async function provisionUser(userPoolId: string, email: string): Promise<string> {
  const created = await client.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" },
      ],
      MessageAction: "SUPPRESS",
    })
  );
  const username = created.User?.Username;
  if (!username) throw new Error("AdminCreateUser did not return a username");

  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: username,
      Password: `${randomBytes(24).toString("base64url")}aA1!`,
      Permanent: true,
    })
  );
  return username;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function startMagicLink(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) return { ok: false, error: "Enter a valid email." };

  try {
    const { userPoolId, clientId, clientSecret } = cfg();
    const username = (await findExistingUsername(userPoolId, trimmed)) ?? (await provisionUser(userPoolId, trimmed));
    const requestId = randomUUID();

    const initiated = await client.send(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: "CUSTOM_AUTH",
        AuthParameters: { USERNAME: username, SECRET_HASH: secretHash(username, clientId, clientSecret) },
        ClientMetadata: { requestId },
      })
    );
    if (!initiated.Session) throw new Error("Cognito did not return a challenge session");

    // CreateAuthChallenge (invoked synchronously inside the AdminInitiateAuth call above)
    // already inserted this row with the token hash; this UPDATE adds the half only this
    // server action knows — the Session string needed to complete the challenge later.
    await query(`update magic_link_challenges set cognito_session = $2 where request_id = $1`, [
      requestId,
      initiated.Session,
    ]);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not start sign-in." };
  }
}

export async function confirmMagicLink(
  requestId: string,
  rawToken: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const row = await one<{ email: string; cognito_session: string | null }>(
      `select email, cognito_session from magic_link_challenges where request_id = $1`,
      [requestId]
    );
    if (!row?.cognito_session) return { ok: false, error: "This link has expired or was already used." };

    const { userPoolId, clientId, clientSecret } = cfg();
    const username = (await findExistingUsername(userPoolId, row.email)) ?? row.email;

    const result = await client.send(
      new AdminRespondToAuthChallengeCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        ChallengeName: "CUSTOM_CHALLENGE",
        Session: row.cognito_session,
        ChallengeResponses: {
          USERNAME: username,
          ANSWER: rawToken,
          SECRET_HASH: secretHash(username, clientId, clientSecret),
        },
      })
    );

    const idToken = result.AuthenticationResult?.IdToken;
    if (!idToken) return { ok: false, error: "That link has expired or was already used." };

    const { sub, email } = await verifyIdToken(idToken, clientId);
    await ensureUser(sub, email);
    await createSession({ sub, email });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not confirm sign-in." };
  }
}
