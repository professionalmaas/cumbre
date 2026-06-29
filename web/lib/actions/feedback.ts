"use server";

import { getUser } from "@/lib/auth/session";
import { recordFeedback, type FeedbackTarget, type FeedbackVote } from "@/lib/queries";

// Capture-half of the quality loop (docs/QUALITY_LOOP.md). A signed-in user votes thumbs
// up/down on a Top-3 fix or the overall report, with an optional one-line note. Persisted to
// the `feedback` table; authorization (own-job-only) is enforced in recordFeedback().
export async function submitFeedback(input: {
  jobId: string;
  target: FeedbackTarget;
  rank: number | null;
  vote: FeedbackVote;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  if (input.target !== "fix" && input.target !== "report") return { ok: false, error: "bad_target" };
  if (input.vote !== "up" && input.vote !== "down") return { ok: false, error: "bad_vote" };
  const rank = input.target === "fix" ? input.rank : null;
  if (input.target === "fix" && !(typeof rank === "number" && rank >= 1 && rank <= 3))
    return { ok: false, error: "bad_rank" };

  // Trim + clamp the optional note to keep it a one-liner and bound storage.
  const note = input.note ? input.note.trim().slice(0, 280) || null : null;

  const res = await recordFeedback({
    jobId: input.jobId,
    userId: user.sub,
    target: input.target,
    rank,
    vote: input.vote,
    note,
  });
  return res.ok ? { ok: true } : { ok: false, error: "forbidden" };
}
