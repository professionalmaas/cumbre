# Cumbre

Get your song to the summit. Upload a track and get a fame-blind craft grade for music and lyrics, plus the top 3 fixes. No Spotify API. No rented model weights. The score comes from an owned feature pipeline. An optional language-model layer writes the notes, and a deterministic heuristic covers the same fields when no API key is set.

This is a portfolio build. It runs on your machine. It does not call a hosted account, and it cannot spend anyone else's cloud budget.

**See it:** [`docs/walkthrough/`](docs/walkthrough/README.md) has the whole loop as real screens, verified on 2026-10-24.

## Run it

You need Docker Desktop running, Node 20+, and Python 3.10+. One command installs the web packages and the Python analyzer, writes the local env file, starts the database, and opens the app:

```bash
node scripts/local.mjs
```

Then open http://localhost:3000 and choose **Continue as dev user**.

1. Play the two demo clips on the home page.
2. Open a sample report and play the highlight.
3. Upload `web/public/samples/ridge.wav`, tick the rights box, and watch a real report come back. Locally the full report opens with no pay step.
4. Open Plans. Checkout is not connected, so nothing is charged.

Leave `ANTHROPIC_API_KEY` empty and the notes come from the heuristic in `worker/cumbre_report.py`. The full local run path, including the Stripe test-mode option, is in [`dev/README.md`](dev/README.md).

`DEV_MODE` is forced off when `NODE_ENV=production` or the process is on ECS. A deploy cannot accidentally skip auth, billing or the rate limit.

## Verify it

```bash
cd web && npx playwright install chromium && npm run verify:local
```

Eighteen browser checks at phone width: demo previews play, the sample highlight plays, two uploads in a row each flip to a full report without a reload or a paywall, the own-track highlight plays, no credit is debited, uploads are deleted, share and profile render, and the console stays clean. The engine's own suite is `python ml/test_cumbre.py` (38 tests), and CI runs it next to the TypeScript typecheck.

## What you are looking at

| Layer | Where | What it shows |
|---|---|---|
| Product UI | `web/` | Next.js 14 app (App Router, standalone build). Local auth is a stub user. |
| Report contract | `docs/analysis-contract.json` | The shape the report screen renders. |
| Feature engine | `ml/` | Fame-blind audio and lyric features. Tests in `ml/test_cumbre.py`. |
| Worker | `worker/cumbre_report.py` | Merges features, an optional model file, and the written notes. `aws_entry.py` wraps it as a Fargate task. |
| Orchestration | `infra/sfn/`, `steps/` | The Step Functions loop and its Lambda steps: validate, moderate, fingerprint, score, charge, deliver, review. |
| Database | `db/` | Postgres migrations, applied in order. |
| Local harness | `dev/`, `scripts/local.mjs` | Docker Postgres, local files instead of S3, the worker inline instead of Step Functions. |
| Production shape | `infra/terraform/`, `docs/AWS_ARCHITECTURE.md` | The same loop on ECS, Cognito, RDS, S3 and Step Functions. Identifiers in that folder are examples. |
| Archive | `archive/` | The pre-AWS stack and the training lineage, kept for the record. |

## Docs

| Read this | For |
|---|---|
| [`docs/AWS_ARCHITECTURE.md`](docs/AWS_ARCHITECTURE.md) | How the production loop is wired |
| [`docs/AWS_RUNBOOK.md`](docs/AWS_RUNBOOK.md) | Deploying it |
| [`docs/Cumbre_Build_Spec.md`](docs/Cumbre_Build_Spec.md) | Product spec, the source of truth for behavior |
| [`docs/QUALITY_LOOP.md`](docs/QUALITY_LOOP.md) | How flagged jobs reach human review |
| [`docs/README_engine.md`](docs/README_engine.md), [`docs/README_inhouse_ml.md`](docs/README_inhouse_ml.md) | The feature engine and the fame-blind model |
| [`CHANGELOG.md`](CHANGELOG.md) | What changed and when |
| [`AGENTS.md`](AGENTS.md) | Rules for anyone, human or agent, changing this repo |

## Principles

Upload only. Lyrics are scored and not kept. No hit-probability is shown. A charge happens only after a clean analysis, and it is idempotent. The model weights are owned.
