import { query, setJob } from "./lib/db";

interface Input {
  jobId: string;
  category: string;
  payload?: unknown;
}

// Escalate to the human review queue and park the job. No charge happens for review paths.
export async function handler(event: Input): Promise<{ ok: boolean }> {
  await query(
    `insert into review_queue (job_id, category, payload) values ($1, $2, $3)`,
    [event.jobId, event.category, JSON.stringify(event.payload ?? {})]
  );
  await setJob(event.jobId, { status: "needs_review", flagged_reason: event.category });
  return { ok: true };
}
