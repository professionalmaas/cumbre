# Cumbre 🏔️

**Get your song to the summit.** A fame-blind, in-house song-quality engine + the web app around
it. Scores a track's **Music** and **Lyrics** by genre and returns the **Top 3 fixes** — no
Spotify API, no rented model weights.

**This is a standalone repo.** Don't nest it in another repo. Start with **`SETUP.md`**.

> ### 🎨 UI = the final design handoff (`docs/design_v2/`).
> The app implements the 6-screen experience: **Sample → Plans (pay-first) → Upload → Analyzing →
> Report → Profile**, in the warm ember/gold design system (Newsreader/Hanken/Space Mono). The rich
> Report renders the full `docs/analysis-contract.json` (market-fit, readiness, energy chart,
> best-moment highlight, Top 3 fixes with impact, mix & master, comparables). Monetization is
> **pay-first**: Summit Pass ($9 one-time) + Season Pass ($19/mo). The A&R copy and scores come from
> an **A&R model** layer in the worker (`worker/cumbre_report.py`). **Few-step deploy +
> model-prep:** see **`docs/DEPLOY.md`**. Preview the report locally at **`/report/sample`**.

> ### ⚡ This app is built **AWS-native** on the shared platform.
> The original build spec (`docs/Cumbre_Build_Spec.md`) targets Supabase + Inngest + Modal.
> Per a re-platform decision, the implemented stack is **ECS Fargate (behind the shared ALB) +
> a dedicated Cognito pool + RDS Postgres + S3 + Step Functions + a Fargate ML worker**, keeping
> Stripe + ACRCloud. The bridge/contract is **`docs/AWS_ARCHITECTURE.md`**; launch via
> **`docs/AWS_RUNBOOK.md`**. The `web/` app now uses `lib/db` (RDS), `lib/auth` (Cognito), and
> `lib/aws` (S3/Step Functions) — not Supabase. The Step Functions loop lives in `infra/sfn/` +
> `steps/`; the worker is `worker/aws_entry.py`. (`supabase/`, root `lib/inngest/`, and
> `worker/modal_app.py` remain as the original-spec reference path.)

## TL;DR
```bash
git init                                  # standalone
python -m venv .venv && source .venv/Scripts/activate
pip install -r ml/requirements.txt
python ml/test_cumbre.py                  # 38 tests pass
# train the model the app loads:
cd ml && pip install datasets
python train_fameblind.py spotify_12m.csv spotify_data.csv \
       --hf maharshipandya/spotify-tracks-dataset --model rf --out CUMBRE_fameblind_model.pkl
```
Then open the repo in Cursor → it reads `AGENTS.md` + `docs/Cumbre_Build_Spec.md`
→ follow `docs/PHASE1_CHECKLIST.md`.

## Map
| Path | What |
|---|---|
| `ml/` | engine (`cumbre_engine/lyrics/scoring`) + fame-blind training pipeline + tests |
| `worker/modal_app.py` | Modal worker — wraps `ml/` + loads the model (the loop's scoring step) |
| `supabase/schema.sql` | database contract |
| `lib/inngest/analyze-song.ts` | automated-loop skeleton (human-gate order) |
| `web/` | Next.js app (scaffolded in this repo) |
| `docs/` | build spec (source of truth), Phase-1 checklist, design brief, report prototype |
| `AGENTS.md` · `SETUP.md` · `.env.example` | rules · bootstrap · config |

## Principles (enforced in AGENTS.md)
No Spotify API · upload-only · analyze-never-display-lyrics · fame-blind/craft-first (no hit
prediction shown) · idempotent billing with moderation+fingerprint before charge · owned ML only.
