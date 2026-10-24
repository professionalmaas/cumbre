# Cumbre archives

Read-only snapshots of work that is **not** on the live deploy path (`web/`, `worker/`, `.github/workflows/deploy.yml`).

## Fame-blind ML lineage (pre–AWS deploy)

| Location | What |
|----------|------|
| Branch **`archive/fameblind-prd`** | Full GitHub PRD as of 2026-06-29 (`dad5693`) — zip foundation, doctor scripts, `enrich_popularity.py`, training pipeline. |
| Folder **`archive/fameblind/`** | Same unique artifacts copied here for browse-without-checkout. |

```bash
git fetch origin
git checkout archive/fameblind-prd   # full frozen tree
# or browse archive/fameblind/ on PRD
```

Live site and deploy CI use **PRD** at repo root (`ml/` engine for scoring only; training helpers live under `archive/` or the archive branch).

## Pre-AWS stack (`archive/pre-aws/`)

The first build targeted Supabase, Inngest and Modal. The app was re-platformed to AWS (ECS,
Cognito, RDS, S3, Step Functions) before launch; see `docs/AWS_ARCHITECTURE.md`. These files are
kept for the record and are not on any run path:

| File | What it was |
|------|-------------|
| `pre-aws/supabase/` | Supabase schema, triggers and storage policies. Superseded by `db/*.sql`. |
| `pre-aws/inngest/analyze-song.ts` | The Inngest loop skeleton. Superseded by `infra/sfn/analyze.asl.json` and `steps/`. |
| `pre-aws/worker/modal_app.py` | The Modal worker. Superseded by `worker/aws_entry.py` wrapping `worker/cumbre_report.py`. |
| `pre-aws/SETUP.md` | The zip-bundle bootstrap notes from that era. Superseded by `README.md` and `dev/README.md`. |
