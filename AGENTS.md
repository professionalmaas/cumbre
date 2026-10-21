# AGENTS.md — Cumbre

> This is a **standalone repository** (not part of the `home` monorepo — ignore any home-repo
> git guardrails). Auto-loaded project instructions. Read `docs/Cumbre_Build_Spec.md`
> in full before building — it is the source of truth. This file is the short version + rules.
>
> **⚡ Implemented stack is AWS-native** (re-platformed from the spec's Supabase/Inngest/Modal):
> ECS Fargate + dedicated Cognito pool + RDS Postgres + S3 + Step Functions + Fargate worker,
> keeping Stripe + ACRCloud. The bridge is **`docs/AWS_ARCHITECTURE.md`**; deploy via
> **`docs/AWS_RUNBOOK.md`**. The non-negotiables below still hold verbatim. The product behavior,
> engine (`ml/`), schema shape, and results UI are unchanged — only the infrastructure differs.

## What Cumbre is
A subscription web app where an independent artist uploads a song and gets a two-part,
**genre-aware, fame-blind craft grade** (Music + Lyrics) plus the **Top 3 fixes** to improve it.
Fully automated loop; a human is involved only for high-risk decisions. Monetized by
pay-per-song + subscription credits. Tagline: **Get your song to the summit.**

## Repository layout (everything you need is here)
```
ml/              Python engine + fame-blind training pipeline (owned, tested)
worker/          aws_entry.py — Fargate worker (wraps ml/, reads model from S3)
web/             Next.js app (App Router, standalone build for Docker)
steps/           Step Functions Lambda steps (TypeScript, compiled to dist/)
infra/terraform/ App-layer Terraform (ECS, ALB rule, Cognito client, S3, secrets)
infra/terraform/Makefile  Workflow: plan / apply / validate / check-live
docs/            AWS_ARCHITECTURE.md, AWS_RUNBOOK.md, Cumbre_Build_Spec.md
```

## Non-negotiable rules (do not violate)
1. **No Spotify API dependency.** All audio features come from `ml/cumbre_engine.py`. Never call
   Spotify's audio-features/analysis endpoints (deprecated Nov 2024).
2. **Upload-only ingestion.** Never pull audio from YouTube/Spotify URLs (ToS + copyright).
   Require a rights-warranty checkbox at upload.
3. **Analyze, never display lyrics.** Output scores/feedback, not lyric text. ASR transcripts are
   transient/per-user; store derived metrics only. Delete uploaded audio after analysis; store the
   feature vector, not the audio.
4. **Fame-blind, craft-first.** Grade craft vs genre norms. Never show a "hit probability" /
   "% chance of success" to users (the internal `fameblind` score from the worker is internal-only).
   No public accuracy claims.
5. **Money safety.** Credit charge is idempotent (Stripe idempotency key = jobId) and behind a
   kill switch (`KILL_SWITCH_SCORING`). Moderation + copyright fingerprint run BEFORE the charge.
   Verify webhook signatures; dedupe webhook events by id.
6. **Owned ML only.** Use `ml/CUMBRE_fameblind_model.pkl` (+ optional `ml/cumbre_audionet.pt`).
   No AGPL/non-commercial weights (no Essentia pretrained models, no MERT). librosa/torch/sklearn ok.

## Terraform rules (MANDATORY — one wrong apply breaks auth sitewide)

`terraform.tfvars` (gitignored) is the **ONLY** apply-time config file. It is auto-loaded.

```sh
# CORRECT — always run from infra/terraform/
cd infra/terraform
terraform plan
terraform apply -auto-approve
# or: make plan / make apply
```

**NEVER** pass `-var-file=environments/prd.tfvars.example`. It is a template with placeholder
values. Passing it OVERRIDES the real `terraform.tfvars` — corrupting the ALB listener rule,
the Cognito callback/logout URLs, and the shared state references. Last time this happened it
took down auth sitewide (redirect_mismatch on every sign-in attempt).

`host_header` in `terraform.tfvars` must always be `"getcumbre.com"`. It controls:
1. ALB listener routing (wrong value = 404 on every request)
2. Cognito callback + logout URLs (wrong value = auth broken for all users)

The `make validate` target in `infra/terraform/Makefile` checks this before applying.

## Git guardrails (installed — standalone repo, branch `PRD`)
This is its own git repo (default branch `PRD`; never `main`/`master`). Hooks live in
`.githooks/` and are armed into `.git/hooks/`. Re-arm after a fresh clone:
`sh .githooks/install-guardrails.sh`.
- **pre-commit** (instant): repo/branch banner · blocks direct commits to `main`/`master` ·
  blocks junk/`.claude/` files · advisory secret scan (AWS/Anthropic/Stripe/PEM). Overrides:
  `GIT_ALLOW_MAIN=YES`, `GIT_ALLOW_JUNK=YES`, `STRICT_SECRETS=1` (make scan blocking).
- **pre-push**: blocks pushes to `main`/`master` and force-pushes · **BUILD-GREEN gate** —
  typechecks `web/` + `steps/` (`tsc --noEmit`) · **TF VAR guard** — if `.tf` files changed,
  verifies `terraform.tfvars host_header="getcumbre.com"` (wrong value = auth broken sitewide).
  Overrides: `GIT_ALLOW_MAIN=YES`, `GIT_ALLOW_FORCE=YES`, `SKIP_BUILD_CHECK=1`, `SKIP_TF_CHECK=1`.
- Safe config set: `push.default=current`, `push.autoSetupRemote=true`, `pull.ff=only`.
- Pushes use the user's credentials and must be run by the user (the agent cannot push). Copyrighted
  demo clips (`web/public/samples/*.mp3`) and secrets (`.env*`, `*.tfvars`, `*.pkl`) are gitignored.

## Existing engine (REUSE — do not rewrite)
- `ml/cumbre_scoring.py` → `analyze_song(path, genre, lyrics_text=, year=)` returns the full report
  (summit score, grade, top fixes). **This is the product surface.**
- `ml/cumbre_engine.py` → audio features + `validate_audio()` (loop's OOD gate) + `to_model_features()`.
- `ml/cumbre_lyrics.py` → lyric metrics + `transcribe()` (OpenAI Whisper; needs `OPENAI_API_KEY`).
- `ml/train_fameblind.py`, `cumbre_fameblind.py`, `enhance_features.py`, `rebuild_dataset.py`,
  `import_spotify_csv.py` → offline fame-blind training → produces `CUMBRE_fameblind_model.pkl`.
- Tests: `ml/test_cumbre.py` (38) + `ml/test_inhouse.py`. Keep green.

## Stack (LIVE — AWS-native)
Next.js (App Router, ECS Fargate) · Cognito (OAuth + Google) · RDS Postgres · S3 (presigned PUT
browser uploads) · Step Functions (analysis loop) · Lambda steps + Fargate worker · Stripe
Checkout + Postgres credit ledger · OpenAI moderation + Whisper · ACRCloud fingerprint · A&R
copy (lyric feedback). The production shape is in `infra/terraform/` and `docs/AWS_ARCHITECTURE.md`.
The running demo is local. See `dev/README.md`.

## Architecture rule that drives everything
The audio job takes seconds-to-minutes. The ML work MUST run in the **Fargate worker**
(`worker/aws_entry.py`), triggered by Step Functions, never inline in a Next.js route or Lambda.

## Data flow (LIVE)
User uploads → S3 presigned PUT → Step Functions `hub-cumbre-prd-analysis` → Lambda steps:
validate → moderate (OpenAI) → fingerprint (ACRCloud) → **Fargate worker** (`worker/aws_entry.py`:
librosa features + `ml/cumbre_scoring.analyze_song` + PKL model from S3 + numpy casts) →
feedback (the A&R model) → **charge** (Stripe, idempotent, after success) → deliver results.
Confidence gate at SFN `ConfidenceChoice` (`low_confidence_threshold = 0.0` → no manual-review
gate; set > 0.0 to enable). Results stored in RDS `jobs` table.