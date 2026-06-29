import { setJob } from "./lib/db";

interface Input {
  jobId: string;
  reason: string;
}

// Terminal: mark the job rejected. No credit was charged (charge runs only after a clean pass).
export async function handler(event: Input): Promise<{ ok: boolean }> {
  await setJob(event.jobId, { status: "rejected", flagged_reason: event.reason });
  return { ok: true };
}
