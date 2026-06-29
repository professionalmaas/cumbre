# Cumbre — Setup (bootstrap the standalone repo)

> Cumbre is its **own repository**, separate from your `home` monorepo. Do NOT nest it inside
> `home` (its git guardrails will fight you). Unzip this bundle to its own folder and `git init`.

## Repository layout
```
cumbre/
  CLAUDE.md              # auto-loaded rules for Claude Code (this repo's, not home's)
  README.md  SETUP.md
  .env.example  .gitignore
  ml/                    # the Python engine + fame-blind training pipeline (owned, tested)
    cumbre_engine.py  cumbre_lyrics.py  cumbre_scoring.py
    cumbre_fameblind.py  enhance_features.py  train_fameblind.py
    rebuild_dataset.py  import_spotify_csv.py  refit_model.py  cumbre_audionet.py
    cumbre_batch.py  tracks_manifest.csv  requirements.txt
    test_cumbre.py  test_inhouse.py
  worker/                # Modal worker that wraps ml/ and loads the trained model
    modal_app.py  requirements.txt
  supabase/
    schema.sql           # the database contract (apply in Supabase SQL editor)
  lib/inngest/
    analyze-song.ts      # the automated-loop skeleton (human-gate steps)
  web/                   # Next.js app — Claude Code scaffolds this (see docs/PHASE1_CHECKLIST.md)
    README.md
  docs/
    Cumbre_Build_Spec.md       # SOURCE OF TRUTH
    PHASE1_CHECKLIST.md
    Cumbre_Design_Brief.docx   cumbre_report_prototype.html
    README_engine.md  README_inhouse_ml.md  REBUILD_DATASET.md
    Song_Grader_Research_Brief.docx  Song_Grader_Build_Playbook.docx
```

## One-time bootstrap
```bash
cd ~
unzip cumbre_project.zip            # creates ./cumbre
cd cumbre
git init                            # standalone repo (NOT inside home)

# Python env for the ML/worker side
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash
pip install -r ml/requirements.txt

# sanity: engine tests should pass
python ml/test_cumbre.py
```

## Train the model the worker loads (creates ml/CUMBRE_fameblind_model.pkl)
Put your data files anywhere and point at them (use your real filenames):
```bash
cd ml
pip install datasets                # enables --hf
python train_fameblind.py spotify_12m.csv spotify_data.csv \
       --hf maharshipandya/spotify-tracks-dataset --model rf \
       --out CUMBRE_fameblind_model.pkl
# (quick placeholder if you just want SOMETHING to wire up:
#  python import_spotify_csv.py SPOTIFY.csv --train )
```
The `.pkl` is git-ignored (it's large). For production it's uploaded to object storage and the
Modal worker downloads it — see `worker/modal_app.py`.

## Then open `cumbre/` in Cursor / Claude Code and say:
> "Read CLAUDE.md and docs/Cumbre_Build_Spec.md, then work through docs/PHASE1_CHECKLIST.md.
>  The DB contract is supabase/schema.sql, the loop skeleton is lib/inngest/analyze-song.ts,
>  and the scoring worker is worker/modal_app.py wrapping ml/cumbre_scoring.py. Start with
>  setup + Supabase + upload (checklist 0–2) and open a PR."

Everything it said was missing now exists in this repo.

## Env
Copy `.env.example` to `.env.local` (web) / `.env` (worker) and fill in keys. Never commit secrets.

---

## Phase 1 web app (built — AWS-native)

The app is implemented **AWS-native** on the shared platform (not Supabase/Inngest/Modal).
**Deploy via `docs/AWS_RUNBOOK.md`**; the architecture/contract is `docs/AWS_ARCHITECTURE.md`.

Stack: ECS Fargate (behind the shared ALB) · dedicated **Cognito** pool (self-signup) ·
**RDS Postgres** · **S3** uploads · **Step Functions** durable loop (`infra/sfn/analyze.asl.json`)
with **Lambda** steps (`steps/`) + a **Fargate worker** (`worker/aws_entry.py`) · Stripe · ACRCloud.

### Build & verify locally (no AWS calls)
```bash
cd web   && npm install && npm run build       # Next.js standalone build
cd steps && npm install && npm run build       # 7 Lambda bundles -> steps/dist/<name>/index.js
# DB schema for RDS: db/001_schema.sql  (apply with psql against the RDS instance)
```

### Deploy (summary — full steps in docs/AWS_RUNBOOK.md)
1. Build `steps/dist/*` (Terraform's `archive_file` reads them at plan time).
2. `cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars` and fill secrets.
3. `terraform init` (S3 backend) → two-pass `terraform apply` (RDS SG depends on the module's ECS SG).
4. Create the GitHub `prd` Environment + `AWS_*_ROLE_ARN` secrets from `terraform output`.
5. Run `deploy.yml` (web + worker images) → upload `CUMBRE_fameblind_model.pkl` to the artifacts bucket.
6. Apply `db/001_schema.sql` to RDS → smoke-test `/api/health` → run `/deploy-ready` (PRR).

### What the app does (Phase 1, Pop only)
- **Cognito** hosted-UI sign-in / self-signup. New users get **1 free credit** automatically
  (provisioned on first login by `ensureUser`).
- Upload (browser → **S3 presigned PUT**) → genre **Pop** (locked), year, rights checkbox.
- App calls **StartExecution** on the `analyze` state machine: validate → moderate → fingerprint →
  **extract+score on the Fargate worker (`waitForTaskToken`)** → confidence gate → **charge
  (idempotent, after success)** → deliver. Audio is **deleted** after analysis; only the feature
  vector + scores are stored.
- Results page renders the design handoff: summit gauge, Music/Lyrics, **Top 3 fixes**,
  subscore bars, feature chips, disclaimer.
- Flagged jobs (copyright / low-confidence / OOD / moderation) land in **`/admin/review`**
  (allowlist via `ADMIN_EMAILS`) instead of auto-charging.

### Notes / knobs
- `KILL_SWITCH_SCORING=on` halts the charge path cleanly in an incident (checked in the `charge` Lambda).
- `LOW_CONFIDENCE_THRESHOLD` (default 0.7, baked into the ASL) sets the AUTO band. The worker maps
  `confidence = summit_score/100`, so songs scoring < 70 route to human review by default —
  intentional for Phase 1 ("start tight, widen as it proves reliable"). Lower it to widen.
- Stripe price ids: set `STRIPE_PRICE_SINGLE` / `STRIPE_PRICE_CREDITS_PACK` / `STRIPE_PRICE_PACK20`.
