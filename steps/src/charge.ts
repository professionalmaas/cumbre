import { setJob } from "./lib/db";
import { log } from "./lib/log";

interface Input {
  jobId: string;
  userId: string;
  chargeable?: boolean;
}

// Running an analysis no longer charges anything — payment gates VIEWING the full report
// (web/lib/actions/unlock.ts:unlockFullReport, called on-demand from the report page), not
// starting a job. This step stays in the pipeline (same ASL topology, same SFN state name)
// purely so the state machine definition doesn't need rewiring.
//
// IMPORTANT: `charged` here means "cleared this stage, proceed to Deliver" — it is the ASL's
// ChargeChoice branch variable ($.charge.charged == false -> ReviewKillSwitch, anything else
// -> Deliver; see infra/sfn/analyze.asl.json), NOT a literal "money was charged" flag anymore.
// Only the kill switch may still return false here.
export async function handler(event: Input): Promise<{ charged: boolean; reason: string }> {
  log("info", "charge.start", { jobId: event.jobId });
  if (process.env.KILL_SWITCH_SCORING === "on") {
    log("warn", "charge.kill_switch", { jobId: event.jobId });
    return { charged: false, reason: "kill_switch" };
  }
  await setJob(event.jobId, { stage: "charge" });
  log("info", "charge.done", { jobId: event.jobId, reason: "deferred_to_unlock" });
  return { charged: true, reason: "deferred_to_unlock" };
}
