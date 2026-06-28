# Cumbre

Foundation repo: **engine** orchestration, **fame-blind ML** (Spotify popularity without artist/track identity), and **app contracts** for downstream consumers.

## Layout

| Path | Purpose |
|------|---------|
| `engine/` | Pipeline runner and shared utilities |
| `ml/fameblind/` | Train + enrich popularity from Kaggle / HuggingFace sources |
| `contracts/` | Data and API contracts for apps integrating with Cumbre |

## Quick start (ML)

```bash
pip install -r ml/fameblind/requirements.txt
python ml/fameblind/enrich_popularity.py <tracks_features.csv> <spotify_data.csv>
python ml/fameblind/train_fameblind.py <tracks_features.csv> <spotify_data.csv> --model rf
```

Data files are local-only (gitignored). Place Kaggle CSVs outside this repo.

## Git

Standalone repository — **not** a submodule of `professionalmaas/home`.
