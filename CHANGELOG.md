# Changelog

Notable changes to Cumbre. Dates are when the change landed on `PRD`.

## 2026-10-24 — Verified local loop

Found by driving the local build through a real browser (`cd web && npm run verify:local`), fixed in the same pass.

### Fixed
- **Highlight playback.** The Content Security Policy had no `media-src`, so the browser refused the in-memory `blob:` audio and "Play highlight" on an uploaded track did nothing. Affected production too. Added `media-src 'self' blob:` (`web/middleware.ts`).
- **Free credit spent before the unlock.** The local runner debited one credit when analysis finished, so a new user's only credit was gone before the report asked for it. Production already charges at unlock; the local path now matches (`web/lib/dev/runInline.ts`). The unlock also accepts a job that already carries an analysis charge (`web/lib/queries.ts`).
- **Local pay and profile gates.** `DEV_MODE` documents an auto-granted entitlement, but the unlock still demanded a credit and a profile name. Locally the report now opens in full; production keeps both gates (`web/lib/actions/unlock.ts`).
- **Local rate limit.** The 5-analyses-per-day cap stopped local testing after five uploads. Waived in `DEV_MODE` only (`web/lib/actions/upload.ts`).

### Added
- `web/scripts/verify-local-loop.mjs` and `npm run verify:local`: 18 browser checks over the whole loop, with screenshots.
- `docs/walkthrough/`: the verified loop as real screens, plus a self-contained `index.html`.
- Engine tests (`ml/test_cumbre.py`) run in CI next to the TypeScript typecheck.

### Changed
- Pre-AWS leftovers moved to `archive/pre-aws/` (Supabase schema, Inngest loop, Modal worker, the zip-era `SETUP.md`). The live stack is described in `README.md`, `docs/AWS_ARCHITECTURE.md` and `dev/README.md`.
- `README.md` rewritten around what the app does, how to run it, and what is verified.
