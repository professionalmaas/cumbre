# Local dev (DEV_MODE) — run the whole loop with no AWS

The full run path lives in **[`dev/README.md`](../dev/README.md)**. This file is the
one-screen summary + the list of what was added.

## TL;DR

```bash
# one-time
python -m venv .venv && .venv/Scripts/activate && pip install -r worker/requirements.txt
cd web && npm install

# each session (from web/)
npm run dev:db        # Docker Postgres on localhost:55432
npm run dev:setup     # apply db/001 -> 002 -> 003
npm run dev           # Next on :3000   (or: npm run dev:all)
```

`web/.env.local` (the only required lines):
```
DEV_MODE=1
DATABASE_URL=postgres://cumbre:cumbre@localhost:55432/cumbre
NEXT_PUBLIC_APP_URL=http://localhost:3000
ANTHROPIC_API_KEY=     # OPTIONAL — heuristic fallback renders a full report without it
```

Then: open `:3000` → **Continue as dev user** → **upload** `ml/t_clean.wav` (tick rights)
→ the Analyzing screen flips to a **real report**.

**What the owner must provide:** nothing is required; optionally an `ANTHROPIC_API_KEY` for
LLM-written A&R copy (without it, the deterministic heuristic in `worker/cumbre_report.py`
produces the full report). Docker Postgres, the dev user, local storage, and the inline
worker are all provided by the harness.

## The principle

Everything is gated behind `DEV_MODE=1` (`web/lib/devMode.ts`). When the flag is unset, the
production AWS paths (Cognito, RDS+TLS, S3 presigned URLs, Step Functions, Stripe gate) are
**100% untouched**. `cd web && npm run build` and `cd steps && npm run build` stay green.

## What changed (all additive + env-gated)

New files:
- `web/lib/devMode.ts` — the `DEV_MODE` flag + stub `DEV_USER`.
- `web/lib/devStorage.ts` — local file storage under `web/.dev-uploads/` (S3 replacement).
- `web/lib/dev/runInline.ts` — inline orchestration: spawn `worker/run_local.py`, parse its
  stdout JSON, reuse the charge + deliver SQL, mark the job done (or `needs_review` on error).
- `web/app/api/dev/upload/route.ts` — `PUT /api/dev/upload?key=…` writes the upload to disk.
- `docker-compose.dev.yml` — `postgres:16` on host port `55432`.
- `dev/init-db.sh` — applies `db/001 → 002 → 003` into the container (no local psql needed).
- `.env.dev.example`, `dev/README.md`, this file.

Edited (DEV_MODE branch only; prod path unchanged):
- `web/lib/auth/session.ts` (`getUser`/dev session), `web/lib/actions/auth.ts` (`devSignIn`),
  `web/app/login/page.tsx` (dev sign-in button; no Cognito call in dev).
- `web/lib/db.ts` (`ssl: undefined` in dev), `web/lib/aws/s3.ts` (local storage variants),
  `web/lib/actions/upload.ts` (inline analyze), `web/lib/entitlement.ts` (auto-grant).
- `web/package.json` (`dev:db` / `dev:setup` / `dev:all` scripts), `.gitignore` + `web/.gitignore`
  (`web/.dev-uploads/`, `.env.dev`), `web/.env.local.example` (DEV_MODE block).

Also wired (independent of DEV_MODE — works in prod too): hosted **Stripe Payment Links** as
the preferred `/plans` checkout path (`NEXT_PUBLIC_STRIPE_SUMMIT_URL` /
`NEXT_PUBLIC_STRIPE_SEASON_URL`), with the existing `/api/stripe/checkout` Checkout-Sessions
route kept as a fallback. The webhook now also grants Season entitlement from a Payment-Link
`checkout.session.completed` (which only carries `client_reference_id`).

Untouched, as required: `ml/*.py`, `infra/terraform/*`, `worker/cumbre_report.py`,
`worker/aws_entry.py`, the secret contract, `docs/BRAIN_ENHANCEMENTS.md` / `ENHANCEMENTS_LOG.md`.
