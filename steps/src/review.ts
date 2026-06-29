import { query, setJob } from "./lib/db";
import { log } from "./lib/log";

interface Input {
  jobId: string;
  category: string;
  payload?: unknown;
}

// Escalate to the human review queue and park the job. No charge happens for review paths.
export async function handler(event: Input): Promise<{ ok: boolean }> {
  log("info", "review.start", { jobId: event.jobId, category: event.category });
  await query(
    `insert into review_queue (job_id, category, payload) values ($1, $2, $3)`,
    [event.jobId, event.category, JSON.stringify(event.payload ?? {})]
  );
  await setJob(event.jobId, { status: "needs_review", flagged_reason: event.category });
  log("info", "review.done", { jobId: event.jobId, category: event.category });
  return { ok: true };
}
