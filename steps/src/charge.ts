import { query, setJob } from "./lib/db";
import { log } from "./lib/log";

interface Input {
  jobId: string;
  userId: string;
  chargeable?: boolean; // false => covered by an active Season subscription
}

// Consume 1 Summit credit, idempotently, and only here (after moderation + fingerprint
// + a successful, confident score). Season subscribers aren't charged per-song.
export async function handler(event: Input): Promise<{ charged: boolean; reason?: string }> {
  log("info", "charge.start", { jobId: event.jobId });
  if (process.env.KILL_SWITCH_SCORING === "on") {
    log("warn", "charge.kill_switch", { jobId: event.jobId });
    return { charged: false, reason: "kill_switch" };
  }
  await setJob(event.jobId, { stage: "charge" });
  if (event.chargeable === false) {
    // Season subscription covers this analysis — no ledger debit.
    log("info", "charge.done", { jobId: event.jobId, reason: "subscription" });
    return { charged: true, reason: "subscription" };
  }
  // Idempotent: the unique index on credit_ledger(job_id) where reason='analysis'
  // makes a retry/replay a no-op.
  await query(
    `insert into credit_ledger (user_id, delta, reason, job_id)
     values ($1, -1, 'analysis', $2)
     on conflict (job_id) where (reason = 'analysis') do nothing`,
    [event.userId, event.jobId]
  );
  log("info", "charge.done", { jobId: event.jobId, reason: "analysis" });
  return { charged: true };
}
