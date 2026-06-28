# Cumbre 🏔️

**Get your song to the summit.** A fame-blind, in-house song-quality engine + the web app around
it. Scores a track's **Music** and **Lyrics** by genre and returns the **Top 3 fixes** — no
Spotify API, no rented model weights.

**This is a standalone repo.** Don't nest it in another repo. Start with **`SETUP.md`**.

## TL;DR
```bash
git init                                  # standalone
python -m venv .venv && source .venv/Scripts/activate
pip install -r ml/requirements.txt
python ml/test_cumbre.py                  # 38 tests pass
# enrich 1.2M Kaggle features (no popularity column):
python ml/enrich_popularity.py ~/Downloads/spotify12million/tracks_features.csv \
       ~/Downloads/spotify_data.csv -o ~/Downloads/spotify12million/tracks_features_with_popularity.csv
# train the model the app loads:
cd ml && pip install datasets
python train_fameblind.py spotify_12m.csv spotify_data.csv \
       --hf maharshipandya/spotify-tracks-dataset --model rf --out CUMBRE_fameblind_model.pkl
```
Then open the repo in Cursor/Claude Code → it reads `CLAUDE.md` + `docs/Cumbre_Build_Spec.md`
→ follow `docs/PHASE1_CHECKLIST.md`.

## Map
| Path | What |
|---|---|
| `ml/` | engine (`cumbre_engine/lyrics/scoring`) + fame-blind training pipeline + tests |
| `worker/modal_app.py` | Modal worker — wraps `ml/` + loads the model (the loop's scoring step) |
| `supabase/schema.sql` | database contract |
| `lib/inngest/analyze-song.ts` | automated-loop skeleton (human-gate order) |
| `web/` | Next.js app (Claude Code scaffolds) |
| `docs/` | build spec (source of truth), Phase-1 checklist, design brief, report prototype |
| `CLAUDE.md` · `SETUP.md` · `.env.example` | rules · bootstrap · config |

## Principles (enforced in CLAUDE.md)
No Spotify API · upload-only · analyze-never-display-lyrics · fame-blind/craft-first (no hit
prediction shown) · idempotent billing with moderation+fingerprint before charge · owned ML only.
