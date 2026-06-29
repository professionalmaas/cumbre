# Cumbre — the quality loop (point-and-shoot AI improvement)

Cumbre's report quality should compound: every climb a user takes should make the next
user's notes a little sharper. This is the owner's "point-and-shoot AI improvement" vision —
the product gets better from being used, with a human only in the high-leverage decisions.

The loop has four stages. **Stage 1 (capture) ships in this pass; stages 2–4 are scaffolded
with clear plug points but not yet automated.**

```
   ┌─────────────┐    ┌────────────────┐    ┌────────────────────┐    ┌──────────────────┐
   │ 1. CAPTURE  │ →  │ 2. GOLDEN-SET  │ →  │ 3. ACTIVE-LEARNING │ →  │ 4. SCHEDULED     │
   │  user votes │    │     EVAL       │    │       QUEUE        │    │   RE-EVAL        │
   └─────────────┘    └────────────────┘    └────────────────────┘    └──────────────────┘
        │ feedback           │ score the          │ surface the           │ re-run eval after
        │ table              │ A&R layer vs       │ worst-rated reports    │ any prompt/model
        ▼                    ▼ a labelled set     ▼ for human relabel      ▼ change; gate ship
   thumbs up/down +     regression metric    training/eval data       no silent regressions
   one-line note        per release          for the A&R layer
```

## Stage 1 — Capture (LIVE)

**What:** thumbs up/down (plus an optional one-line note) on each Top-3 fix and on the overall
report.

**Where:**
- UI: `web/components/report/FeedbackControl.tsx`, wired into `web/components/report/ReportView.tsx`
  (one control per fix, one for the whole report).
- Action: `web/lib/actions/feedback.ts` → `submitFeedback`.
- Query/persistence: `recordFeedback` / `getFeedbackForUser` in `web/lib/queries.ts`.
- Schema: `db/003_feedback.sql` — the `feedback` table
  (`id, job_id, user_id, target('fix'|'report'), rank, vote('up'|'down'), note, created_at`),
  one upsertable vote per (user, job, target, rank) slot. No audio or lyric text is stored.

**Why this shape:** `target`+`rank` lets us attribute a downvote to a *specific* generated fix,
which is exactly the unit the A&R layer produces. The optional note is the cheap, high-signal
"why" that turns a vote into a labelled example.

## Stage 2 — Golden-set eval (NEXT)

**What:** a fixed, hand-labelled set of songs (or cached feature vectors + expected report
qualities) that the A&R layer is scored against on every release. Produces a single regression
number ("A&R quality") so a prompt or model change can't silently get worse.

**Plug points:**
- The A&R layer lives in `worker/cumbre_report.py` (the Claude Haiku call that produces verdict,
  market-fit, readiness, comparables, keep, and fixes-with-impact). Eval calls that same code path
  with golden inputs.
- Build an `eval/` folder with the golden inputs (derived metrics only — never audio) and an
  eval runner that calls the A&R layer and grades structure + a rubric (LLM-as-judge or rules).
- Gate it in CI (`deploy.yml`) the way the platform already gates deploys — fail the build if the
  score drops below the prior champion.

## Stage 3 — Active-learning queue (NEXT)

**What:** rank delivered reports by negative signal (downvotes, low confidence, notes) and surface
the worst for a human to relabel. Those labels feed the golden set (Stage 2) and any future
fine-tune / few-shot exemplar set for the A&R layer.

**Plug points:**
- Read side: `feedback` joined to `jobs`/`results`; the admin dashboard already shows the
  aggregate up/down counts (`getAdminStats` in `web/lib/queries.ts`). A future
  `/admin/learning` view would list the lowest-rated reports with their notes.
- The existing `review_queue` table is the precedent for a human-in-the-loop queue; the
  active-learning queue is the same pattern aimed at *quality* rather than *risk*.

## Stage 4 — Scheduled re-eval (NEXT)

**What:** re-run the golden-set eval on a schedule and after any prompt/model bump; track the
A&R quality metric over time; alert on drift. This is the "it keeps improving and we'd notice
if it regressed" guarantee.

**Plug points:**
- A scheduled job (EventBridge → the worker, mirroring the analyze Step Function) runs the
  Stage 2 eval and writes the metric to a small `eval_runs` table (to be added).
- Champion/challenger selection on the A&R prompt/model follows the same discipline the ML model
  uses for `CUMBRE_fameblind_model.pkl`.

## Privacy invariant (applies to every stage)

The loop trains on **derived signals only** — scores, votes, short notes, feature vectors.
Audio is deleted after analysis and lyrics are never stored (see `docs/DEPLOY.md` zero-storage
guarantee). Nothing in the quality loop changes that.
