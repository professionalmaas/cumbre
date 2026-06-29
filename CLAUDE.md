# CLAUDE.md — Cumbre

> This is a **standalone repository** (not part of the `home` monorepo — ignore any home-repo
> git guardrails). Auto-loaded instructions for Claude Code. Read `docs/Cumbre_Build_Spec.md`
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
ml/        Python engine + fame-blind training pipeline (owned, tested)
worker/    modal_app.py — Modal worker that wraps ml/ and loads the trained model
supabase/  schema.sql — the DB contract (apply in Supabase)
lib/inngest/ analyze-song.ts — the automated-loop skeleton (human-gate order)
web/       Next.js app — you scaffold this (see docs/PHASE1_CHECKLIST.md)
docs/      Cumbre_Build_Spec.md (SOURCE OF TRUTH), PHASE1_CHECKLIST.md, design brief, prototype
.env.example  CLAUDE.md  SETUP.md  README.md
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

## Git guardrails (installed — standalone repo, branch `PRD`)
This is its own git repo (default branch `PRD`; never `main`/`master`). Hooks live in
`.githooks/` and are armed into `.git/hooks/`. Re-arm after a fresh clone:
`sh .githooks/install-guardrails.sh`.
- **pre-commit** (instant): repo/branch banner · blocks direct commits to `main`/`master` ·
  blocks junk/`.claude/` files · advisory secret scan (AWS/Anthropic/Stripe/PEM). Overrides:
  `GIT_ALLOW_MAIN=YES`, `GIT_ALLOW_JUNK=YES`, `STRICT_SECRETS=1` (make scan blocking).
- **pre-push**: blocks pushes to `main`/`master` and force-pushes · **BUILD-GREEN gate** —
  typechecks `web/` + `steps/` (`tsc --noEmit`) and refuses to push broken TypeScript (CI runs
  the full build). Overrides: `GIT_ALLOW_MAIN=YES`, `GIT_ALLOW_FORCE=YES`, `SKIP_BUILD_CHECK=1`.
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

## Stack
Next.js (App Router) on Vercel · Supabase (Postgres+Auth+Storage+RLS) · Stripe Checkout + Postgres
credit ledger · Inngest durable workflow · Modal Python worker (`worker/modal_app.py`) · OpenAI
moderation · ACRCloud fingerprint · cheap LLM for lyric feedback.

## Architecture rule that drives everything
The audio job takes seconds-to-minutes — longer than any serverless web function. The ML work
MUST run on the Modal worker, triggered by the Inngest loop, never inline in a Next.js route.

## Data flow
upload (presigned URL → Supabase Storage) → `song/uploaded` → Inngest `analyze.song`
(`lib/inngest/analyze-song.ts`): validate → moderate → fingerprint → **extract+score on Modal**
(`worker/modal_app.py` → `ml/cumbre_scoring.analyze_song` + the model) → feedback → **charge
(idempotent, after success)** → deliver → capture feedback for active learning. Escalate to
`review_queue` only for: copyright (ACRCloud BlockAccess), refunds/disputes, abuse, confidence
< 0.70, out-of-distribution, validated drift.

## Build orde