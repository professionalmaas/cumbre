# Cumbre data contract — fame-blind popularity

## Enriched tracks (`tracks_features_with_popularity.csv`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | string | Spotify track id |
| `popularity` | float 0–100 | Observed Spotify score or model fill |
| `popularity_spotify` | float | Present when joined from labeled Kaggle set |
| `popularity_predicted` | float | Fame-blind model estimate |
| `popularity_source` | enum | `spotify_join` \| `model_predicted` |
| `relative_popularity` | float 0–100 | Percentile rank within corpus |

## Fame-blind rule

Apps and models must **not** use artist name, track title, album, or genre as predictors when exposing “fame-blind” scores. Audio features + year (+ explicit) only.

## App integration

- **Read path:** consume enriched CSV or future REST `/v1/tracks/{id}/popularity`
- **Write path:** none in v0.1 (batch ML only)
- **Secrets:** no API keys in repo; Spotify API credentials via environment only
