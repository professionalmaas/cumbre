import { randomBytes, createHash } from "crypto";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { query } from "./lib/db";
import { log } from "./lib/log";

interface CreateAuthChallengeEvent {
  userName: string;
  request: {
    userAttributes: Record<string, string>;
    session: Array<{ challengeName: string; challengeResult: boolean }>;
    clientMetadata?: Record<string, string>;
  };
  response: {
    publicChallengeParameters?: Record<string, string>;
    privateChallengeParameters?: Record<string, string>;
    challengeMetadata?: string;
  };
}

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ses = new SESv2Client({});
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://getcumbre.com";
const FROM_ADDRESS = process.env.MAGIC_LINK_FROM_EMAIL || "no-reply@getcumbre.com";

// Generates the magic-link token, persists it (hashed, one-time-use, 10-min expiry), and
// emails the link directly via SES — Cognito's CustomMessage trigger does NOT fire for
// CUSTOM_CHALLENGE (only for its own built-in MFA delivery), so this Lambda owns delivery.
export async function handler(event: CreateAuthChallengeEvent): Promise<CreateAuthChallengeEvent> {
  const email = event.request.userAttributes.email;
  const requestId = event.request.clientMetadata?.requestId;

  if (!email || !requestId) {
    // Malformed request — issue a challenge that can never be answered rather than erroring
    // (an error here surfaces as an opaque 5xx to the user; this fails the same way but safely).
    event.response.privateChallengeParameters = { tokenHash: "unreachable" };
    event.response.publicChallengeParameters = { email: email || "" };
    return event;
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await query(
    `insert into magic_link_challenges (request_id, email, token_hash, expires_at)
     values ($1, $2, $3, $4)
     on conflict (request_id) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at, consumed_at = null`,
    [requestId, email, tokenHash, expiresAt.toISOString()]
  );

  // Only send a fresh email on the FIRST attempt of this session — retries (e.g. DefineAuthChallenge
  // re-issuing CUSTOM_CHALLENGE after a wrong answer) reuse the same still-valid link rather than
  // spamming a new email per keystroke/retry.
  if (event.request.session.length === 0) {
    const confirmUrl = `${APP_URL}/auth/magic/confirm?rid=${encodeURIComponent(requestId)}&token=${encodeURIComponent(rawToken)}`;
    try {
      await ses.send(
        new SendEmailCommand({
          FromEmailAddress: FROM_ADDRESS,
          Destination: { ToAddresses: [email] },
          Content: {
            Simple: {
              Subject: { Data: "Sign in to Cumbre" },
              Body: {
                Text: {
                  Data: `Click below to sign in to Cumbre. This link expires in 10 minutes and works once.\n\n${confirmUrl}\n\nIf you didn't request this, you can ignore this email.`,
                },
                Html: {
                  Data: `<p>Click below to sign in to Cumbre. This link expires in 10 minutes and works once.</p><p><a href="${confirmUrl}">Confirm sign-in</a></p><p>If you didn't request this, you can ignore this email.</p>`,
                },
              },
            },
          },
        })
      );
      log("info", "magic_link.email_sent", { requestId });
    } catch (err) {
      log("error", "magic_link.email_failed", { requestId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  event.response.privateChallengeParameters = { tokenHash };
  event.response.publicChallengeParameters = { email };
  return event;
}
