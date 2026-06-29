import { randomBytes } from "crypto";
import { query, setJob } from "./lib/db";
import { deleteObject } from "./lib/s3";

// URL-safe, non-guessable public share token (independent of the internal job id).
function shareToken(): string {
  return randomBytes(18).toString("base64url"); // 24 chars, ~144 bits
}

// The worker returns the full analysis-contract.json `response` object as event.worker.report.
interface Report {
  scores?: { overall?: number; music?: number; lyrics?: number };
}
interface Input {
  jobId: string;
  s3Key: string;
  worker: { report: Report; confidence?: number; model_version?: string | null };
}

// Write the report, mark the job done, and DELETE the uploaded audio (store features, not audio).
export async function handler(event: Input): Promise<{ ok: boolean }> {
  const report = event.worker.report ?? {};
  const s = (report as Report).scores ?? {};

  // Assign a share token on first insert; keep the existing one on replay (coalesce) so a
  // re-deliver doesn't invalidate an already-shared link.
  await query(
    `insert into results (job_id, report, music_score, lyrics_score, overall_score, share_token)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (job_id) do update set
       report = excluded.report, music_score = excluded.music_score,
       lyrics_score = excluded.lyrics_score, overall_score = excluded.overall_score,
       share_token = coalesce(results.share_token, excluded.share_token)`,
    [event.jobId, JSON.stringify(report), s.music ?? null, s.lyrics ?? null, s.overall ?? null, shareToken()]
  );

  await setJob(event.jobId, {
    status: "done",
    stage: "deliver",
    confidence: event.worker.confidence,
    model_version: event.worker.model_version ?? null,
  });

  try {
    await deleteObject(event.s3Key);
  } catch {
    // best-effort; the bucket lifecycle expires objects within a day as a backstop
  }
  return { ok: true };
}
