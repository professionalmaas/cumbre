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
```

```
