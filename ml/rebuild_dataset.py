"""
Cumbre — Rebuild the training dataset (with the artist column this time)
=======================================================================
Your old 400k set was lost, and you can't re-pull it from Spotify (the
audio-features API was shut off Nov 2024). Instead, rebuild from PRE-SHUTDOWN
public datasets that already contain the features + ARTIST + popularity.

Recommended sources (download the CSV, then point this script at it):
  * Spotify 1.2M Songs   kaggle datasets download -d rodolfofigueroa/spotify-12m-songs
  * Spotify 1M Tracks    kaggle datasets download -d amitanshjoshi/spotify-1million-tracks
  * 114k (HF, scriptable) huggingface: maharshipandya/spotify-tracks-dataset

What it does:
  - loads one or more CSVs (or a Hugging Face dataset id),
  - maps the many column-naming variants to the Cumbre schema,
  - derives `year` from a release date if needed,
  - de-dupes by (track_id) or (track_name+artist),
  - writes a clean training CSV ready for:
        python import_spotify_csv.py cumbre_training.csv --train
    (which will build the TRUE fame-blind within-artist target, because artist
     is now present).

Usage:
  python rebuild_dataset.py spotify_12m.csv --out cumbre_training.csv
  python rebuild_dataset.py a.csv b.csv --max 400000 --out cumbre_training.csv
  python rebuild_dataset.py --hf maharshipandya/spotify-tracks-dataset --out cumbre_training.csv
"""
from __future__ import annotations
import argparse, sys
import pandas as pd

# map: cumbre canonical -> possible source column names (lowercased)
COLMAP = {
    "track_id":   ["track_id", "id", "spotify_id", "uri"],
    "track_name": ["track_name", "name", "track", "song", "title"],
    "artist":     ["artist", "artists", "artist_name", "track_artist", "artist(s)_name", "main_artist"],
    "popularity": ["popularity", "track_popularity", "song_popularity", "pop"],
    "year":       ["year", "release_year"],
    "release_date": ["release_date", "album_release_date", "date"],
    # audio features
    "danceability": ["danceability"], "energy": ["energy"], "key": ["key"],
    "loudness": ["loudness"], "mode": ["mode"], "speechiness": ["speechiness"],
    "acousticness": ["acousticness"], "instrumentalness": ["instrumentalness"],
    "liveness": ["liveness"], "valence": ["valence"], "tempo": ["tempo"],
    "duration_ms": ["duration_ms", "duration"], "explicit": ["explicit"],
    "time_signature": ["time_signature"],
}
FEATURES = ["danceability","energy","key","loudness","mode","speechiness","acousticness",
            "instrumentalness","liveness","valence","tempo","duration_ms","explicit","year"]


def _resolve(cols):
    low = {c.lower().strip(): c for c in cols}
    found = {}
    for canon, variants in COLMAP.items():
        for v in variants:
            if v in low:
                found[canon] = low[v]; break
    return found


def normalize(df: pd.DataFrame) -> pd.DataFrame:
    f = _resolve(df.columns)
    if "artist" not in f or "popularity" not in f:
        raise ValueError(f"Source missing artist/popularity. Detected: {list(f)}")
    out = pd.DataFrame()
    out["artist"] = df[f["artist"]].astype(str).str.split(";").str[0].str.strip()  # first artist
    out["popularity"] = pd.to_numeric(df[f["popularity"]], errors="coerce")
    if "track_id" in f: out["track_id"] = df[f["track_id"]].astype(str)
    if "track_name" in f: out["track_name"] = df[f["track_name"]].astype(str)
    # year: prefer explicit year, else parse from release_date
    if "year" in f:
        out["year"] = pd.to_numeric(df[f["year"]], errors="coerce")
    elif "release_date" in f:
        out["year"] = pd.to_datetime(df[f["release_date"]], errors="coerce").dt.year
    # features
    for feat in FEATURES:
        if feat == "year":
            continue
        if feat in f:
            col = df[f[feat]]
            if feat == "explicit":
                out["explicit"] = col.map(lambda x: int(bool(x)) if not pd.isna(x) else 0)
            else:
                out[feat] = pd.to_numeric(col, errors="coerce")
    return out


def dedupe(df: pd.DataFrame) -> pd.DataFrame:
    if "track_id" in df:
        df = df.drop_duplicates(subset=["track_id"])
    elif {"track_name", "artist"}.issubset(df.columns):
        df = df.drop_duplicates(subset=["track_name", "artist"])
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csvs", nargs="*", help="one or more source CSV files")
    ap.add_argument("--hf", help="Hugging Face dataset id (needs `pip install datasets`)")
    ap.add_argument("--out", default="cumbre_training.csv")
    ap.add_argument("--max", type=int, help="cap total rows (e.g. 400000)")
    ap.add_argument("--min-songs-per-artist", type=int, default=2,
                    help="keep artists with >= this many songs (needed for within-artist fame-blind)")
    a = ap.parse_args()

    frames = []
    for path in a.csvs:
        print(f"loading {path} ...")
        frames.append(normalize(pd.read_csv(path)))
    if a.hf:
        try:
            from datasets import load_dataset
        except ImportError:
            sys.exit("pip install datasets  to use --hf")
        print(f"loading HF dataset {a.hf} ...")
        d = load_dataset(a.hf, split="train").to_pandas()
        frames.append(normalize(d))
    if not frames:
        sys.exit("Provide at least one CSV or --hf <id>.")

    df = pd.concat(frames, ignore_index=True)
    print(f"combined rows: {len(df):,}")
    df = dedupe(df)
    df = df.dropna(subset=["artist", "popularity"])
    # require enough songs per artist so within-artist fame-blind works
    vc = df["artist"].value_counts()
    keep = vc[vc >= a.min_songs_per_artist].index
    before = len(df)
    df = df[df["artist"].isin(keep)]
    print(f"after dedupe + >= {a.min_songs_per_artist} songs/artist: {len(df):,} "
          f"(dropped {before - len(df):,}) across {df['artist'].nunique():,} artists")
    if a.max and len(df) > a.max:
        df = df.sample(a.max, random_state=42)
        print(f"capped to {len(df):,}")

    df.to_csv(a.out, index=False)
    feats_present = [c for c in FEATURES if c in df.columns]
    print(f"\nWrote {a.out}  ({len(df):,} rows, {len(feats_present)} features: {feats_present})")
    print("\nNext:")
    print(f"  python import_spotify_csv.py {a.out} --train")
    print("  -> builds the TRUE fame-blind within-artist target and trains the model.")


if __name__ == "__main__":
    main()
