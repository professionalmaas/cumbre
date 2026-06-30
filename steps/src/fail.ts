import { setJob } from "./lib/db";
import { log } from "./lib/log";

interface Input {
  jobId: string;
  error?: unknown;
}

// Terminal: mark the job failed (unhandled worker error). No credit was charged.
export async function handler(event: Input): Promise<{ ok: boolean }> {
  log("error", "fail.start", { jobId: event.jobId });
  await setJob(event.jobId, { status: "failed" });
  log("error", "fail.done", { jobId: event.jobId });
  return { ok: true };
}
