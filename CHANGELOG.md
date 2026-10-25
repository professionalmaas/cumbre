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
- `web/scripts/verify-local-loop.mjs` and `npm run verify:local`: 19 browser checks over the whole loop, with screenshots.
- `docs/walkthrough/`: the verified loop as real screens, plus a self-contained `index.html`.
- Engine tests (`ml/test_cumbre.py`) run in CI next to the TypeScript typecheck.

### Security and portability
- No keys, account IDs or environment files are in the tree or in any branch's history (checked 2026-10-24). CI now has a `secret-scan` job that fails on a tracked `.env`/`.tfvars`/`.tfstate` file, a key-shaped token, or a non-placeholder AWS account ID.
- The pre-commit secret scan blocks by default (`STRICT_SECRETS=0` to relax).
- Remaining account-specific names (team tag, shared-state bucket, cluster, Cognito hosted-UI prefix) replaced with the neutral `hub` prefix or placeholders in docs, Terraform tags and the example tfvars, so a fork can be deployed without editing hidden defaults.
- The pre-push Terraform guard no longer hard-codes one domain. It requires a real `host_header` and accepts an exact-match target via `CUMBRE_HOST_HEADER`.

### Changed
- The Supabase-era root `.env.example` moved to `archive/pre-aws/`. The live templates are `web/.env.local.example`, `.env.dev.example` and `worker/.env.example`.
- Pre-AWS leftovers moved to `archive/pre-aws/` (Supabase schema, Inngest loop, Modal worker, the zip-era `SETUP.md`). The live stack is described in `README.md`, `docs/AWS_ARCHITECTURE.md` and `dev/README.md`.
- `README.md` rewritten around what the app does, how to run it, and what is verified.
