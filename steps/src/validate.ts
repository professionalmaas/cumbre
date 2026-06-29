import { setJob } from "./lib/db";
import { head } from "./lib/s3";

interface Input {
  jobId: string;
  s3Key: string;
}

// Cheap existence/size guard. Deep OOD/non-music check runs in the worker (cumbre_engine.validate_audio).
export async function handler(event: Input): Promise<{ ok: boolean; reason?: string }> {
  await setJob(event.jobId, { status: "running", stage: "validate" });
  const { exists, size } = await head(event.s3Key);
  if (!exists) return { ok: false, reason: "missing_object" };
  if (size <= 0) return { ok: false, reason: "empty_file" };
  return { ok: true };
}
