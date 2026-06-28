# Rebuilding your training dataset (the right way, in 2026)

Your old 400k set is gone, and **you can't re-pull it** — Spotify shut off the audio-features
API to new apps in Nov 2024. You don't need to. Rebuild from pre-shutdown public datasets that
already contain the features **plus the artist column** your processed file was missing. Artist
is the one thing that unlocks true fame-blind training.

## Step 1 — get a source dataset (pick one)

| Dataset | Size | Has artist? | Has year? | Get it |
|---|---|---|---|---|
| **Spotify 1.2M Songs** | 1.2M | ✅ `artists` | ✅ | `kaggle datasets download -d rodolfofigueroa/spotify-12m-songs` |
| **Spotify 1M Tracks** | 1M | ✅ `artist_name` | ✅ | `kaggle datasets download -d amitanshjoshi/spotify-1million-tracks` |
| **maharshipandya/spotify-tracks-dataset** | 114k | ✅ `artists` | ➖ (genre, no year) | Hugging Face — loads in-script via `--hf` |

All three carry the same Echo-Nest audio features your 2021 model used (danceability, energy,
valence, loudness, key, mode, …) + popularity. The 1.2M or 1M sets are your 400k replacement
(bigger, and with artist included).

*(Kaggle download needs a free Kaggle account + `pip install kaggle` and an API token. Or just
download the CSV from the dataset page in your browser and point the script at it.)*

## Step 2 — rebuild into the Cumbre schema

```bash
python rebuild_dataset.py spotify_12m.csv --out cumbre_training.csv --max 400000
# multiple sources at once:
python rebuild_dataset.py one.csv two.csv --out cumbre_training.csv
# or straight from Hugging Face:
python rebuild_dataset.py --hf maharshipandya/spotify-tracks-dataset --out cumbre_training.csv
```
This maps the many column-name variants to one schema, derives `year` from release dates if
needed, de-dupes, and **keeps only artists with ≥2 songs** (required so within-artist
normalization can separate song from artist).

## Step 3 — build the fame-blind target + train

```bash
python import_spotify_csv.py cumbre_training.csv --train
```
Because artist is now present, this automatically:
- prints a **contamination report** (how much of popularity is just the artist),
- builds the **within-artist fame-blind target** (a song vs its own artist's average),
- trains with an **artist-stratified split** (no fame leakage across train/test),
- saves `CUMBRE_fameblind_model.pkl`.

## What this gets you (and what it doesn't)

✅ A large, **fame-blind** training target and a baseline model — the thing you actually wanted,
rebuilt at 400k+ scale, today, with no Spotify API.

⚠️ These are still **Spotify-derived features**. They're perfect for the fame-blind *labeling*
and a baseline. For the **production in-house model** (scoring an uploaded audio file), features
must come from `cumbre_engine` / `cumbre_audionet` run on actual audio — grow that corpus over
time (your uploads, licensed packs) and label it with the *same* fame-blind method.

Think of it as two datasets:
- **Labels/baseline (now):** public features + artist → fame-blind target + baseline model.
- **Production (ongoing):** audio → your in-house features/embeddings → same fame-blind target.
```
public dataset ──rebuild_dataset.py──> cumbre_training.csv ──import_spotify_csv.py──> fame-blind model
audio files    ──cumbre_engine/audionet──> in-house features ──(same fame-blind labels)──> production model
```
