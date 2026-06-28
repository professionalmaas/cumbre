/**
 * Cumbre — automated loop (Inngest durable workflow)  [SKELETON]
 * =============================================================
 * The contract for the order-of-operations and human-gates. Claude Code fills in
 * the helper calls (Supabase writes, OpenAI moderation, ACRCloud, Modal, Stripe).
 *
 * Load-bearing rules (see CLAUDE.md):
 *   - moderate + fingerprint run BEFORE charge
 *   - charge is idempotent (key = jobId) and behind a kill switch
 *   - escalate to review_queue ONLY for: copyright, refund/dispute, abuse,
 *     confidence < 0.70, out-of-distribution, validated drift
 */
import { inngest } from "./client";

export const analyzeSong = inngest.createFunction(
  { id: "analyze-song", concurrency: { limit: 20 }, retries: 3 },
  { event: "song/uploaded" },
  async ({ event, step }) => {
    const { jobId, songId, userId, genre, year, signedUrl } = event.data;

    // 1) VALIDATE + OOD  (cumbre_engine.validate_audio runs inside the worker too)
    const valid = await step.run("validate", () => validateUpload(songId, signedUrl));
    if (!valid.ok) return reject(step, jobId, valid.reason); // non-music/corrupt -> reject

    // 2) MODERATION
    const mod = await step.run("moderate", () => moderate(signedUrl));
    if (mod.block) return reject(step, jobId, "moderation");
    if (mod.review) return toReview(step, jobId, "moderation", mod);

    // 3) COPYRIGHT FINGERPRINT (ACRCloud) — BlockAccess => human
    const fp = await step.run("fingerprint", () => acrFingerprint(signedUrl));
    if (fp.policy === "BlockAccess") return toReview(step, jobId, "copyright", fp);

    // 4) EXTRACT + SCORE on Modal (wraps ml/cumbre_scoring + fame-blind model)
    const res = await step.run("extract-score", () =>
      callModal("extract_and_score", { url: signedUrl, genre, year })
    );
    if (!res.ok) return reject(step, jobId, res.reason);

    // 5) LOW-CONFIDENCE / OOD gate
    if (res.confidence < 0.7) return toReview(step, jobId, "low_confidence", res);

    // 6) FEEDBACK (LLM, strict JSON; optional in Phase 1 — report already has top_fixes)
    const feedback = await step.run("feedback", () => generateFeedback(res));

    // 7) CHARGE — only after success; idempotent; behind kill switch
    if (process.env.KILL_SWITCH_SCORING === "on")
      return toReview(step, jobId, "kill_switch", {});
    await step.run("charge", () =>
      consumeCredit(userId, jobId, { idempotencyKey: jobId })
    );

    // 8) DELIVER + capture feedback for active learning
    await step.run("deliver", () => deliverResult(jobId, res, feedback));
    return { ok: true, jobId };
  }
);

/* ---- helpers for Claude Code to implement (see docs/Cumbre_Build_Spec.md) ----
   validateUpload(songId, url)   -> { ok, reason }
   moderate(url)                 -> { block, review, ... }      // OpenAI moderation
   acrFingerprint(url)           -> { policy: 'Allow'|'Monetize'|'BlockAccess', ... }
   callModal(fn, args)           -> result from worker/modal_app.py
   generateFeedback(res)         -> { top_fixes, feedback_md }  // strict JSON, self-checked
   consumeCredit(userId, jobId, {idempotencyKey})  -> writes -1 row in credit_ledger
   deliverResult(jobId, res, fb) -> writes results row, marks job done, notifies user
   toReview(step, jobId, category, payload) / reject(step, jobId, reason)
*/
