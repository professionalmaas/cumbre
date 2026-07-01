import { createHash } from "crypto";
import { query } from "./lib/db";
import { log } from "./lib/log";

interface VerifyAuthChallengeEvent {
  request: {
    privateChallengeParameters: { tokenHash: string };
    challengeAnswer: string;
  };
  response: { answerCorrect?: boolean };
}

// Hashes the submitted answer (the raw token from the magic-link URL) and checks it against
// the hash CreateAuthChallenge stored. One-time-use is enforced atomically in Postgres: the
// UPDATE only succeeds once, so replaying a captured link (e.g. via link-forwarding or an
// email scanner that fetched the confirm PAGE but never clicked "Confirm sign-in") fails.
export async function handler(event: VerifyAuthChallengeEvent): Promise<VerifyAuthChallengeEvent> {
  const { tokenHash } = event.request.privateChallengeParameters;
  const answer = event.request.challengeAnswer || "";
  const answerHash = createHash("sha256").update(answer, "utf8").digest("hex");

  if (!tokenHash || tokenHash === "unreachable" || answerHash !== tokenHash) {
    event.response.answerCorrect = false;
    return event;
  }

  const { rowCount } = await query(
    `update magic_link_challenges
     set consumed_at = now()
     where token_hash = $1 and consumed_at is null and expires_at > now()`,
    [tokenHash]
  );

  event.response.answerCorrect = rowCount === 1;
  if (!event.response.answerCorrect) {
    log("info", "magic_link.verify_failed", { reason: "expired_or_consumed" });
  }
  return event;
}
