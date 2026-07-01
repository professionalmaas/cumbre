"use server";

import { randomUUID } from "crypto";
import { getUser } from "@/lib/auth/session";
import { tx } from "@/lib/db";
import { getEntitlement } from "@/lib/entitlement";
import { setJobExecution, countRecentJobs } from "@/lib/queries";
import { presignUpload, objectExists } from "@/lib/aws/s3";
import { startAnalyze } from "@/lib/aws/sfn";
import { DEV_MODE } from "@/lib/devMode";
import { runAnalysisInline } from "@/lib/dev/runInline";
import type { Depth, Lens } from "@/lib/report";

const ALLOWED_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
};

export interface PreparedUpload {
  songId: string;
  storageKey: string;
  uploadUrl: string;
  contentType: string;
}

// Analysis is free to run — payment gates VIEWING the full report (see unlock.ts), not
// starting one. RATE_LIMIT_PER_DAY bounds worst-case compute/API cost from that free-to-run
// pipeline (worker Fargate + OpenAI + ACRCloud + Claude all cost real money per run).
const RATE_LIMIT_PER_DAY = 5;

// Step 1: any signed-in user gets an upload URL, subject to the daily rate limit.
export async function prepareUpload(
  filename: string
): Promise<{ ok: true; data: PreparedUpload } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const contentType = ALLOWED_EXT[ext];
  if (!contentType) return { ok: false, error: `Unsupported file type .${ext}` };

  const ent = await getEntitlement(user.sub, user.email ?? undefined);
  if (!ent.isAdmin && (await countRecentJobs(user.sub, 24)) >= RATE_LIMIT_PER_DAY) {
    return { ok: false, error: "rate_limited" };
  }

  const songId = randomUUID();
  const storageKey = `${user.sub}/${songId}.${ext}`;
  const uploadUrl = await presignUpload(storageKey, contentType);
  return { ok: true, data: { songId, storageKey, uploadUrl, contentType } };
}

export interface EnqueueInput {
  songId: string;
  storageKey: string;
  originalFilename: string;
  genre: string;
  depth: Depth;
  lens: Lens;
  year: number;
  rightsWarranty: boolean;
}

// Step 2: persist song + job and start the analyze execution. Every run produces a teaser;
// unlocking the full report is a separate action (see unlockFullReport in unlock.ts).
export async function enqueueAnalysis(
  input: EnqueueInput
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!input.rightsWarranty)
    return { ok: false, error: "You must confirm you own the rights to this song." };

  const ent = await getEntitlement(user.sub, user.email ?? undefined);
  if (!ent.isAdmin && (await countRecentJobs(user.sub, 24)) >= RATE_LIMIT_PER_DAY) {
    return { ok: false, error: "rate_limited" };
  }

  if (!(await objectExists(input.storageKey))) return { ok: false, error: "Upload not found in storage." };

  const { jobId } = await tx(async (c) => {
    await c.query(
      `insert into songs (id, user_id, storage_key, original_filename, genre, depth, lens, declared_year, rights_warranty)
       values ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
      [input.songId, user.sub, input.storageKey, input.originalFilename, input.genre, input.depth, input.lens, input.year]
    );
    const job = await c.query<{ id: string }>(
      `insert into jobs (song_id, user_id, status, stage) values ($1,$2,'queued','validate') returning id`,
      [input.songId, user.sub]
    );
    return { jobId: job.rows[0].id };
  });

  // DEV_MODE: run the loop inline (Python worker via child_process) instead of Step
  // Functions. Fire-and-forget so the action returns and the Analyzing screen polls; the
  // inline runner records progress/done/needs_review on the job row.
  if (DEV_MODE) {
    void runAnalysisInline({
      jobId,
      userId: user.sub,
      storageKey: input.storageKey,
      genre: input.genre,
      year: input.year,
      depth: input.depth,
      lens: input.lens,
      chargeable: !ent.subscriptionActive,
    });
    return { ok: true, jobId };
  }

  const executionArn = await startAnalyze({
    jobId,
    userId: user.sub,
    songId: input.songId,
    genre: input.genre,
    year: input.year,
    s3Key: input.storageKey,
    depth: input.depth,
    lens: input.lens,
    chargeable: !ent.subscriptionActive, // Season covers it; Summit consumes a credit
  });
  if (executionArn) await setJobExecution(jobId, executionArn);

  return { ok: true, jobId };
}
