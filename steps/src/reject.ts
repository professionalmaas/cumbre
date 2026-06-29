import { setJob } from "./lib/db";
import { log } from "./lib/log";

interface Input {
  jobId: string;
  reason: string;
}

// Terminal: mark the job rejected. No credit was charged (charge runs only after a clean pass).
export async function handler(event: Input): Promise<{ ok: boolean }> {
  log("info", "reject.start", { jobId: event.jobId, reason: event.reason });
  await setJob(event.jobId, { status: "rejected", flagged_reason: event.reason });
  log("info", "reject.done", { jobId: event.jobId, reason: event.reason });
  return { ok: true };
}
