# web/

The Cumbre product UI: Next.js 14 (App Router), TypeScript, Tailwind. Built as a standalone bundle for the Docker image in `Dockerfile`.

```
app/            routes: /, /login, /upload, /report/[jobId], /report/sample, /sample/[id],
                /share/[token], /plans, /profile, /admin, /legal/*, /api/*
components/     report view, upload form, teaser gate, sample cards, plans, admin review
lib/            auth (Cognito, or the DEV_MODE stub), db, entitlement, queries, report contract,
                server actions, aws/ (S3, Step Functions), dev/ (the inline local runner)
middleware.ts   nonce-based Content Security Policy
scripts/        verify-local-loop.mjs — the browser verification (npm run verify:local)
public/samples  the two original demo clips
```

## Run

```bash
npm install
npm run dev          # http://localhost:3000, needs web/.env.local (see ../dev/README.md)
npm run typecheck
npm run verify:local # the whole loop in a real browser, app must be running
npm run build        # standalone production build
```

`DEV_MODE=1` in `.env.local` swaps Cognito, S3, Step Functions and Stripe for local stand-ins. It is forced off under `NODE_ENV=production` or on ECS (`lib/devMode.ts`).

## Where things are decided

- Who may upload and view: `lib/entitlement.ts`, `lib/actions/upload.ts`, `lib/actions/unlock.ts`.
- The report shape: `lib/report.ts`, mirrored by `../docs/analysis-contract.json`.
- The local loop: `lib/dev/runInline.ts` runs `../worker/run_local.py` in place of the state machine.
- Database access: `lib/db.ts` and `lib/queries.ts`; migrations live in `../db/`.
