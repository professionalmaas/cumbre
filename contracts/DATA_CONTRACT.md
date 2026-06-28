# Cumbre data contract — fame-blind popularity

## Enriched tracks (`tracks_features_with_popularity.csv`)

Produced by `ml/enrich_popularity.py` when the 1.2M Kaggle features file lacks popularity.

| Column | Type | Description |
|--------|------|-------------|
| `id` | string | Spotify track id |
| `popularity` | float 0–100 | Observed Spotify score or model fill |
| `popularity_spotify` | float | Present when joined from labeled Kaggle set |
| `popularity_predicted` | float | Fame-blind model estimate |
| `popularity_source` | enum | `spotify_join` \| `model_predicted` |
| `relative_popularity` | float 0–100 | Percentile rank within corpus |

## Fame-blind training (`ml/train_fameblind.py`)

Uses `cumbre_fameblind.py` for **within-artist** residual targets — strips artist fame from the label.
Audio/engineered features only in **X**; never `FAME_FEATURES` from `cumbre_fameblind.py`.

## Kaggle inputs (local, gitignored)

| File | Role |
|------|------|
| `~/Downloads/spotify_data.csv` | ~1.16M labeled tracks |
| `~/Downloads/spotify12million/tracks_features.csv` | ~1.2M audio features (no popularity) |

```bash
python ml/enrich_popularity.py tracks_features.csv spotify_data.csv -o tracks_features_with_popularity.csv
python ml/train_fameblind.py spotify_12m.csv spotify_data.csv --hf maharshipandya/spotify-tracks-dataset --model rf
```

## App integration

- **Read path:** enriched CSV or future REST `/v1/tracks/{id}/popularity`
- **Write path:** none in v0.1 (batch ML only)
- **Secrets:** no API keys in repo; Spotify API via environment only
