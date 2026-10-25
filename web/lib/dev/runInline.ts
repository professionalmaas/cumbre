// DEV_MODE inline orchestration — the no-AWS replacement for the Step Functions
// `analyze` state machine. Instead of StartExecution + Lambda steps + a Fargate worker,
// we run the loop inline in the Next.js process:
//
//   job running → (skip/stub moderate + fingerprint) → invoke the Python worker
//   (worker/run_local.py) → parse its stdout JSON → charge (same idempotent SQL as the
//   charge Lambda) → write results.report + mark job done (same SQL as the deliver
//   Lambda) → delete the local upload.
//
// Resilience: any failure (worker error, bad JSON, OOD validate=false) routes the job to
// `needs_review` so the Analyzing screen shows the manual-review state, never a hard hang.
//
// The Analyzing screen already polls `jobs` via router.refresh(), so it flips to the
// report on its own once this writes status='done'.
import { spawn } from "child_process";
import { randomBytes } from "crypto";
import path from "path";
import { query, tx } from "@/lib/db";
import { devKeyToPath, devDelete } from "@/lib/devStorage";
import type { Depth, Lens } from "@/lib/report";

const REPO_ROOT = path.resolve(process.cwd(), ".."); // web/ -> repo root
const RUN_LOCAL = path.join(REPO_ROOT, "worker", "run_local.py");
const PYTHON = process.env.DEV_PYTHON || (process.platform === "win32" ? "python" : "python3");

export interface InlineInput {
  jobId: string;
  userId: string;
  storageKey: string;
  genre: string;
  year: number;
  depth: Depth;
  lens: Lens;
  chargeable: boolean;
}

function shareToken(): string {
  return randomBytes(18).toString("base64url");
}

async function setJob(
  jobId: string,
  patch: { status?: string; stage?: string; flagged_reason?: string; confidence?: number }
): Promise<void> {
  const cols: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    cols.push(`${k} = $${i++}`);
    vals.push(v);
  }
  if (!cols.length) return;
  vals.push(jobId);
  await query(`update jobs set ${cols.join(", ")} where id = $${i}`, vals);
}

// Run the worker and capture stdout (the report JSON) — stderr is just progress logging.
function runWorker(audioPath: string, genre: string, depth: Depth, lens: Lens): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [RUN_LOCAL, audioPath, genre, depth, lens], {
      cwd: REPO_ROOT,
      env: process.env, // ANTHROPIC_API_KEY (optional — heuristic fallback if absent)
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => reject(new Error(`spawn ${PYTHON} failed: ${e.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`worker exited ${code}: ${err.slice(-2000)}`));
    });
  });
}

// Fire-and-forget from the enqueue action. Never throws to the caller — failures are
// recorded on the job row so the UI can render them.
export async function runAnalysisInline(input: InlineInput): Promise<void> {
  try {
    // Stub the moderate + fingerprint gates (no OpenAI / ACRCloud locally) and go straight
    // to scoring. validate is implicit: run_local errors if the file is missing/invalid.
    await setJob(input.jobId, { status: "running", stage: "extract" });

    const audioPath = devKeyToPath(input.storageKey);
    const raw = await runWorker(audioPath, input.genre, input.depth, input.lens);

    // run_local.py prints the report object (the contract `response`) as the last JSON blob.
    const report = JSON.parse(raw.trim());
    const s = (report?.scores ?? {}) as { overall?: number; music?: number; lyrics?: number };

    await setJob(input.jobId, { stage: "charge", confidence: (s.overall ?? 0) / 100 });

    // Charge: mirrors steps/src/charge.ts, which no longer debits anything — payment gates
    // VIEWING the full report (unlockFullReport), not running the analysis. Debiting here
    // spent a new user's only free credit before they could unlock. The kill switch still
    // parks the job for review instead of delivering, as the ChargeChoice branch does.
    if (process.env.KILL_SWITCH_SCORING === "on") {
      await setJob(input.jobId, { status: "needs_review", flagged_reason: "kill_switch" });
      return;
    }

    // Deliver: same SQL as steps/src/deliver.ts (results upsert + share token, job done).
    await tx(async (c) => {
      await c.query(
        `insert into results (job_id, report, music_score, lyrics_score, overall_score, share_token)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (job_id) do update set
           report = excluded.report, music_score = excluded.music_score,
           lyrics_score = excluded.lyrics_score, overall_score = excluded.overall_score,
           share_token = coalesce(results.share_token, excluded.share_token)`,
        [input.jobId, JSON.stringify(report), s.music ?? null, s.lyrics ?? null, s.overall ?? null, shareToken()]
      );
      // DEV_MODE auto-grants the entitlement, so the local report opens in full with no
      // teaser, credit or profile step. Production unlocks on demand (unlockFullReport).
      await c.query(`update jobs set status = 'done', stage = 'deliver', unlocked_full = true where id = $1`, [input.jobId]);
    });

    // Store features, not audio — delete the local upload (mirrors the deliver Lambda).
    await devDelete(input.storageKey);
  } catch (e) {
    // Resilient: any failure parks the job in manual review rather than hanging the UI.
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await setJob(input.jobId, { status: "needs_review", stage: "extract", flagged_reason: `dev_inline: ${msg.slice(0, 240)}` });
    } catch {
      /* swallow — best effort */
    }
    // Keep the file for debugging on failure (it's gitignored and lifecycle-free locally).
    console.error("[dev inline analyze] failed:", msg);
  }
}
