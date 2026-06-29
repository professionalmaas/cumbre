import { setJob } from "./lib/db";
import { fingerprint, type AcrPolicy } from "./lib/acr";

interface Input {
  jobId: string;
  s3Key: string;
}

// ACRCloud copyright gate. BlockAccess => human review (see ASL FingerprintChoice).
export async function handler(event: Input): Promise<{ policy: AcrPolicy; note?: string }> {
  await setJob(event.jobId, { stage: "fingerprint" });
  return fingerprint(event.s3Key);
}
