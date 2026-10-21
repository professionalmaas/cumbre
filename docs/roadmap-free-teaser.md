# Roadmap — Free-score teaser funnel (phase-next; do NOT build yet)

**Status: PLANNED — this doc only.** Captures the free-score acquisition funnel for a later
slice. Written 2026-07-01.

## Where we already are (shipped 2026-07-01 — don't rebuild this)

The teaser/paywall flip is LIVE and covers more of this roadmap than the original brief assumed:

- **Running an analysis is already free** for any signed-in user (rate-limited: 5/user/24h,
  admin-exempt — `web/lib/actions/upload.ts`). `charge.ts` no longer auto-debits.
- **Every completed job already shows a teaser** (score gauge + band + one-line verdict —
  `TeaserGate.tsx`), with the full report gated per-job on `jobs.unlocked_full`.
- **Unlock is already the paid action** (`unlockFullReport`): subscription or 1 credit, plus a
  completed profile (display name). Unlocks never re-lock if a subscription lapses.
- **Email capture at upload is effectively done**: sign-in (Cognito; magic-link built, gated
  behind `MAGIC_LINK_ENABLED` until SES production access) precedes any upload.
- New signups get **1 free credit** (`ensureUser`), so today's funnel is: free grade → teaser →
  first unlock free → later unlocks paid.

## What's actually left to build (the delta)

1. **Blurred Top-3 in the teaser** — the current teaser shows score/band/verdict only. Add the
   Top 3 fix *titles* blurred/locked (reuse the sample-page lock pattern from
   `app/sample/[id]/page.tsx` — the 🔒 card + "unlocks with your report" line) so the tease is
   concrete, not abstract. Component: extend `TeaserGate.tsx`; never put full fix notes in the
   client payload (same anti-copy rule as `SAMPLE_TEASERS`).
2. **Stripe-linked unlock CTA from the teaser** — TeaserGate's "no credits" state already links
   to /plans; wire the $9 payment link with `client_reference_id` so post-payment webhook →
   credit → auto-unlock → return to the report (today the user comes back and taps unlock).
3. **Decide the free-first-score policy** — today it's "1 free credit at signup" (a free
   *unlock*). The roadmap alternative is "overall score free for every song, unlock per song."
   If adopted: stop granting the signup credit and make the score-only teaser the permanent
   free tier. Revenue math changes; decide with real funnel data (see metrics below).
4. **Abuse limits, tightened** — rate limit exists (5/day/user). Add: per-IP signup throttling
   (magic-link makes throwaway accounts cheap once SES is live), and consider 1 free unlock per
   *verified email* rather than per account. The analysis pipeline costs real money per run
   (Fargate + OpenAI + ACRCloud + A&R) even when unpaid.
5. **Funnel instrumentation to tune it** — the RUM events shipped in P2-3 (`sample_play`,
   `sample_report_view`, `plans_view`, `login_start`, `checkout_start`, `report_delivered`)
   give the baseline. Add `teaser_view` and `unlock_start`/`unlock_done` when building this
   slice, then set the free-tier policy from conversion data, not guesswork.

## Dependencies / blockers

- **SES production access** (denied once; resubmission drafted) — magic-link stays dark behind
  `MAGIC_LINK_ENABLED` until then, which caps how cheap signup friction can get.
- Credit-ledger model needs no schema change for #1–#2; #3 touches `ensureUser` + entitlement.

## Non-negotiables that still bind this feature

Fame-blind (never show hit-probability), analyze-never-display lyrics, audio deleted after
analysis, moderation + fingerprint BEFORE any charge, idempotent charges behind the kill switch.
