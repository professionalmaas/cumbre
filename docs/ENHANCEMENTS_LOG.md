# Cumbre — enhancement & hardening pass (autonomous)

Date: 2026-06-28. Additive polish + resilience only — no rewrites, no design-language changes.
Both builds green at the end: `cd web && npm run build` and `cd steps && npm run build`.

---

## 1. Error / breakpoint resilience

**New branded boundaries (web/app):**
- `error.tsx` — route-level error boundary ("loose rock"), with a `reset()` retry + back-to-home.
  Logs `error` (incl. `digest`) to server logs without leaking details.
- `not-found.tsx` — branded 404 ("off the map").
- `global-error.tsx` — last-resort boundary (catches root-layout failures). Renders its own
  `<html>/<body>` with inlined brand tokens since globals.css isn't guaranteed in that path.
- `report/[jobId]/loading.tsx`, `profile/loading.tsx` — branded loading states.

**Upload flow (web/components/UploadForm.tsx):**
- `putWithRetry()` — transient S3 PUT/network retry with backoff (3 tries; retries 5xx + network
  errors, NOT 4xx like an expired URL).
- Friendly, specific failure copy with a retry path ("Tap Begin ascent to try again — no credit
  was used."); 403 → "your upload link expired."
- Client-side 50 MB size guard before requesting a presigned URL.
- Error text is now a `role="alert"` `aria-live` region.

**Degrade-don't-crash:** env-missing failures (e.g. `DATABASE_URL`/`SESSION_SECRET` unset) now
surface through the new `error.tsx` instead of an unhandled crash. The health route stays shallow
(unchanged) so a DB blip can't cycle tasks.

**Latent bug fixed:** the highlight waveform in `ReportView.tsx` emitted raw float heights
(`51.7363…%`), causing a server/client hydration mismatch on the report screen. Heights are now
formatted to a fixed `NN.NN%` string. Verified the served HTML has zero long-float heights.

## 2. Active-learning feedback loop (capture half)

- **SQL:** `db/003_feedback.sql` — `feedback` table (`id, job_id, user_id, target('fix'|'report'),
  rank, vote('up'|'down'), note, created_at`) with check constraints + an upsert unique index on
  `(user_id, job_id, target, coalesce(rank,0))`. Also adds `results.share_token` (see §4).
- **UI:** `web/components/report/FeedbackControl.tsx` — thumbs up/down + optional one-line note,
  on each Top-3 fix and on the overall report. Wired into `ReportView.tsx`; renders only when a
  `jobId` is present (so the public sample report is unaffected).
- **Action:** `web/lib/actions/feedback.ts` → `submitFeedback` (validates, clamps note to 280 chars).
- **Queries:** `recordFeedback` / `getFeedbackForUser` in `web/lib/queries.ts` (own-job-only authz).
- **Doc:** `docs/QUALITY_LOOP.md` — the four-stage loop (capture → golden-set eval →
  active-learning queue → scheduled re-eval) and where each plugs in (worker A&R prompt, future
  eval job). Stage 1 ships here; 2–4 are scaffolded with plug points, not yet automated.

## 3. Admin reporting

- **New `web/app/admin/page.tsx`** — operations dashboard (guarded by existing `requireAdmin`):
  funnel (signups → paid → delivered + conversion %), jobs-by-status, feedback summary
  (fix up/down + satisfaction %, report ▲/▼), recent activity (last 12 jobs), and a link to the
  existing review queue (with open count). Review page now links back to the dashboard.
- **Query:** `getAdminStats()` in `web/lib/queries.ts` — a single batch of aggregate reads.
  "Paid" = distinct Summit purchasers + active/trialing subscribers.

## 4. Social / virality — shareable result (no methodology leak)

- **Public page `web/app/share/[token]/page.tsx`** — shows ONLY summit score, band, song title,
  one-line verdict + a "grade your own song" CTA. No fixes/mix/comparables/features. Unknown
  tokens 404 via the new branded not-found.
- **OG/Twitter meta** via `generateMetadata` + a dynamic **`opengraph-image.tsx`** (Node runtime,
  since it reads via pg) — link previews show the score card on-brand.
- **Token generation:** `steps/src/deliver.ts` assigns a non-guessable `share_token`
  (`randomBytes(18).base64url`, ~144 bits) on first deliver; `coalesce` keeps it stable on replay.
- **Report affordance:** `web/components/report/ShareButton.tsx` — "Share my summit ↗" uses the
  native share sheet when available, else copies the `/share/<token>` link (with a "copied"
  confirmation). Wired into `ReportView` footer; only renders when a token exists.
- **Queries:** `getSharePublic` (methodology-free slice) + `getShareToken` in `web/lib/queries.ts`.

## 5. Usability polish

- `loading.tsx` for report + profile (see §1).
- Focus styles: `:focus-visible` gold ring in `globals.css` (keyboard-only; suppressed for mouse).
- `aria-label`s on icon-only back buttons (report, profile, sample) and on the share/feedback
  controls; `role="img"` + descriptive `aria-label` on the summit gauge, energy chart, share gauge,
  and analyzing ridge SVGs.
- **Reduced motion:** the analyzing climber's SMIL `<animate>` (not covered by the global CSS
  `prefers-reduced-motion` rule) is now JS-gated off when the user prefers reduced motion.

---

## Owner wiring needed in the morning

**SQL (apply to RDS, after 001 + 002):**
- `db/003_feedback.sql` — creates `feedback`, adds `results.share_token`. Idempotent
  (`if not exists` / `add column if not exists`).

**Env vars:** none strictly required. The share OG card and links use the request origin at
runtime, so no new env var is needed for correctness. (Optional future: a `NEXT_PUBLIC_APP_URL`
to harden absolute URLs in OG meta if you ever render share links server-side off-request — not
needed today.)

**Terraform / infra:** no changes required for these features. One note for later:
- The `share/[token]/opengraph-image` route runs on the **Node** runtime and reads RDS. It's
  already covered by the existing ECS task's DB access + SG rules — no new infra. Just be aware
  social crawlers will hit it (it's a cheap single-row read; add caching headers later if traffic
  warrants).

**Re-deploy note:** `steps/` changed (`deliver.ts` now writes `share_token`) — the worker/step
images must be rebuilt (the existing `deploy.yml` does this) for share tokens to start generating.
Reports delivered before this deploy won't have a token (Share button simply won't render for
them); re-running deliver would backfill one.

## Intentionally left for later

- Quality-loop stages 2–4 (golden-set eval, active-learning queue UI, scheduled re-eval) — design
  + plug points are in `docs/QUALITY_LOOP.md`; not built.
- A dedicated `/admin/learning` view listing lowest-rated reports with their notes (the aggregate
  feedback counts are on the dashboard now).
- Caching headers on the OG image route.
- The pre-existing copyrighted sample clips swap + DMCA/legal items already tracked in `docs/DEPLOY.md`.
