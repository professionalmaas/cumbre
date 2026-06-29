import { setJob } from "./lib/db";

interface Input {
  jobId: string;
}

// Phase 1 is audio-only and we never transcribe/store lyrics here, so there is no text
// to moderate yet. Pass through. Real text moderation (OpenAI) arrives with Phase 2 lyrics.
export async function handler(event: Input): Promise<{ block: boolean; review: boolean }> {
  await setJob(event.jobId, { stage: "moderate" });
  return { block: false, review: false };
}
