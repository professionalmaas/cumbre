# Cumbre — local-dev harness (DEV_MODE)

Run the **entire** user loop — sign up → entitlement → upload → analyzing → report — on
`localhost` with **no AWS**. Everything is gated behind a single `DEV_MODE=1` env flag, so
the production AWS code paths are 100% untouched when the flag is unset.

| Production (AWS) | DEV_MODE (localhost) |
|---|---|
| Cognito user pool | stub dev user (`dev-user` / `dev@cumbre.local`), one-click sign-in |
| RDS Postgres (TLS) | Docker `postgres:16` on `localhost:55432` (no TLS) |
| S3 presigned PUT/GET | local files under `web/.dev-uploads/` (gitignored) |
| Step Functions + Lambdas + Fargate worker | the Python worker run **inline** via `child_process` |
| Stripe (pay to unlock) | entitlement **auto-granted**: the report opens in full, no teaser, credit or profile step (Stripe test-mode still works if keys set) |
| 5 analyses per user per day | no limit |

The product behavior, the engine (`ml/`), the report contract, and the results UI are all
unchanged — only the plumbing differs, and only while `DEV_MODE=1`.

---

## One command

From the repo root, `node scripts/local.mjs` installs the web packages and `worker/requirements.txt`, copies `.env.dev.example` to `web/.env.local` when that file is missing, starts Postgres, applies the schema, and runs the app.

## Prerequisites
- **Docker** (for Postgres) and **Node 20+** / npm.
- **Python 3.10+** with the worker deps (`librosa`, `scikit-learn`, …). Used by the inline
  analyzer via `worker/run_local.py`.

## One-time setup

```bash
# 1. Python worker deps (a venv is recommended)
python -m venv .venv
.venv/Scripts/activate        # Windows;  source .venv/bin/activate on macOS/Linux
pip install -r worker/requirements.txt

# 2. Web deps
cd web && npm install
```

## Run it (each session)

```bash
# from web/
npm run dev:db        # start Docker Postgres (docker compose -f ../docker-compose.dev.yml up -d)
npm run dev:setup     # apply db/001 -> 002 -> 003 into the container (node ../dev/init-db.mjs)
npm run dev           # start Next on http://localhost:3000
# …or all three at once:
npm run dev:all
```

Then create `web/.env.local` with the harness on (see **Env** below), open
`http://localhost:3000`, click **Continue as dev user**, go to **upload**, drop
`ml/t_clean.wav` (tick the rights box), and watch the Analyzing screen flip to a **real
report**. The Analyzing screen polls the `jobs` row, so it advances on its own.

> If `npm run dev` is already running when you create `.env.local`, restart it — Next reads
> env at boot.

## Env — what to put in `web/.env.local`

The local loop needs **four** lines (the fifth is optional):

```
DEV_MODE=1
DATABASE_URL=postgres://cumbre:cumbre@localhost:55432/cumbre
NEXT_PUBLIC_APP_URL=http://localhost:3000
ANTHROPIC_API_KEY=                  # OPTIONAL — see below

# Optional: public Stripe Payment Links (used by /plans if you want to exercise checkout)
NEXT_PUBLIC_STRIPE_SUMMIT_URL=
NEXT_PUBLIC_STRIPE_SEASON_URL=
```

Copy-paste source: **`.env.dev.example`** (repo root) or the DEV_MODE block at the top of
**`web/.env.local.example`**.

### What the owner must provide
- **Nothing is required** — with no `ANTHROPIC_API_KEY`, the report's verdict / market-fit /
  comparables come from a deterministic **heuristic fallback** in `worker/cumbre_report.py`,
  so a full report still renders end to end.
- **`ANTHROPIC_API_KEY` (optional, recommended)** — the only thing worth providing. With it,
  the A&R copy is written by the A&R model instead of the heuristic. Set it in `web/.env.local`
  (the inline runner passes the web process env through to the Python worker).

Everything else (Docker Postgres, dev user, local storage, inline worker) is provided by the
harness with no owner input.

## Stripe in dev (optional)
`DEV_MODE` auto-grants entitlement, so you can reach upload **without paying**. To exercise
the real Stripe path in test mode:

1. `/plans` redirects the browser to the public **Payment Links** above with
   `?client_reference_id=<dev-user>&prefilled_email=dev@cumbre.local`.
2. To make the webhook grant entitlement locally, run the Stripe CLI and set the test keys:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   # then in web/.env.local:
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...      # from the `stripe listen` output
   ```
   `checkout.session.completed` grants a Summit credit (`mode=payment`) or upserts the Season
   subscription (`mode=subscription`) keyed on `client_reference_id`.

## Reset / teardown
```bash
npm run dev:db:down                                   # stop Postgres (keeps the volume)
docker compose -f ../docker-compose.dev.yml down -v   # also drop the data volume
rm -rf web/.dev-uploads                               # clear any leftover local uploads
```

## How the seam works (for maintainers)
Every AWS touchpoint checks `DEV_MODE` (`web/lib/devMode.ts`) and branches to a local
implementation; otherwise it runs the unchanged AWS code:

- `lib/auth/session.ts` — `getUser()` returns the stub dev user from a simple cookie;
  `/login` calls `createDevSession()` instead of Cognito (`lib/actions/auth.ts → devSignIn`).
- `lib/db.ts` — `ssl: undefined` in DEV_MODE (local pg has no TLS).
- `lib/aws/s3.ts` — `presignUpload` returns `/api/dev/upload?key=…`; `objectExists` / `deleteObject`
  hit `web/.dev-uploads/` via `lib/devStorage.ts`. The PUT route is `app/api/dev/upload/route.ts`.
- `lib/actions/upload.ts` — in DEV_MODE, `enqueueAnalysis` runs `lib/dev/runInline.ts`
  (spawns `python worker/run_local.py …`, parses stdout JSON, reuses the same charge +
  deliver SQL as the Lambdas, deletes the local file) instead of `startAnalyze` (Step Functions).
- `lib/entitlement.ts` — DEV_MODE auto-grants access (the real ledger/subscription still counts).

If `DEV_MODE` is unset, none of the above branches run.

## Verify the loop

With the app running, drive the whole loop in a real browser and get one line per check:

```bash
cd web
npx playwright install chromium     # once
npm run verify:local
```

It plays both demo previews and the sample highlight, uploads both demo clips back to back,
confirms each flips to a full report with no reload and no paywall, plays the own-track
highlight, checks that no credit was debited and the uploads were deleted, and opens the share
and profile pages. Screenshots land in `web/.verify/`. The script is
`web/scripts/verify-local-loop.mjs`; the screens it produced on 2026-10-24 are in
[`docs/walkthrough/`](../docs/walkthrough/README.md).
