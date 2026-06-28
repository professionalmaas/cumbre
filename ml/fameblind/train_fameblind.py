#!/usr/bin/env python3
"""Fame-blind Spotify popularity model — audio features only (no artist/track identity).

Kaggle inputs (typical):
  1. tracks_features.csv  — Spotify 1.2M audio features (no popularity)
  2. spotify_data.csv     — labeled tracks with popularity + genre/year

Train on the labeled file; optionally merge labels onto the features file by track id.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

AUDIO_FEATURES = [
    "danceability",
    "energy",
    "key",
    "loudness",
    "mode",
    "speechiness",
    "acousticness",
    "instrumentalness",
    "liveness",
    "valence",
    "tempo",
    "duration_ms",
    "time_signature",
    "explicit",
    "year",
]

# Identity / fame proxies — excluded from features
FAME_COLUMNS = {
    "track_id",
    "id",
    "artists",
    "artist_ids",
    "artist_name",
    "album_name",
    "album",
    "album_id",
    "track_name",
    "name",
    "track_genre",
    "genre",
    "track_number",
    "disc_number",
    "release_date",
    "Unnamed: 0",
}


def load_hf(dataset_id: str) -> pd.DataFrame:
    try:
        from datasets import load_dataset

        ds = load_dataset(dataset_id, split="train")
        return ds.to_pandas()
    except Exception as exc:
        print(f"HF load_dataset failed ({exc}); falling back to direct CSV download...")
        from huggingface_hub import hf_hub_download

        path = hf_hub_download(
            repo_id=dataset_id,
            repo_type="dataset",
            filename="dataset.csv",
        )
        return pd.read_csv(path)


def load_frame(path: Path, hf: str | None, sample: int | None) -> pd.DataFrame:
    if path.is_file():
        if sample:
            return pd.read_csv(path, nrows=sample)
        return pd.read_csv(path)
    if hf:
        df = load_hf(hf)
        path.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(path, index=False)
        print(f"Wrote {len(df):,} rows -> {path}")
        return df
    raise FileNotFoundError(f"Missing {path} (pass --hf to download)")


def normalize_ids(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if "track_id" not in out.columns and "id" in out.columns:
        out["track_id"] = out["id"]
    elif "id" not in out.columns and "track_id" in out.columns:
        out["id"] = out["track_id"]
    return out


def merge_labeled(features: pd.DataFrame, labeled: pd.DataFrame) -> pd.DataFrame:
    """Attach popularity from labeled CSV onto features-only rows when possible."""
    features = normalize_ids(features)
    labeled = normalize_ids(labeled)
    if "popularity" in features.columns:
        return features

    label_cols = ["track_id", "popularity"]
    extra = [c for c in ("year", "genre") if c in labeled.columns]
    slim = labeled[label_cols + extra].drop_duplicates("track_id")
    merged = features.merge(slim, on="track_id", how="inner")
    print(f"Merged labels: {len(merged):,} rows (from {len(features):,} features, {len(labeled):,} labeled)")
    return merged


def choose_training_frame(features_path: Path, labeled_path: Path, hf: str | None, sample: int | None) -> pd.DataFrame:
    labeled = load_frame(labeled_path, hf, sample)

    if not features_path.is_file():
        print(f"Using labeled file only: {labeled_path}")
        return labeled

    if "popularity" in labeled.columns:
        # Kaggle spotify_data.csv is the labeled source; 12M features file is mostly disjoint IDs.
        print(f"Training on labeled Kaggle file: {labeled_path} ({len(labeled):,} rows)")
        print(f"(Features-only file present: {features_path} — use for scoring, not merged training)")
        return labeled

    features = load_frame(features_path, None, sample)
    return merge_labeled(features, labeled)


def prepare(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    if "popularity" not in df.columns:
        raise ValueError("Dataset must include a 'popularity' column")

    work = df.drop(columns=[c for c in FAME_COLUMNS if c in df.columns], errors="ignore").copy()
    if "explicit" in work.columns:
        work["explicit"] = work["explicit"].map(
            {True: 1, False: 0, "True": 1, "False": 0, "true": 1, "false": 0}
        )

    feature_cols = [c for c in AUDIO_FEATURES if c in work.columns]
    if not feature_cols:
        raise ValueError("No audio feature columns found")

    X = work[feature_cols]
    y = pd.to_numeric(work["popularity"], errors="coerce")
    mask = y.notna()
    return X.loc[mask], y.loc[mask]


def build_model(name: str, feature_cols: list[str]) -> Pipeline:
    numeric = [c for c in feature_cols if c != "explicit"]
    categorical = [c for c in feature_cols if c == "explicit"]

    transformers = []
    if numeric:
        transformers.append(
            (
                "num",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                numeric,
            )
        )
    if categorical:
        transformers.append(
            (
                "cat",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("onehot", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                categorical,
            )
        )

    pre = ColumnTransformer(transformers)

    if name == "rf":
        reg = RandomForestRegressor(
            n_estimators=200,
            random_state=42,
            n_jobs=-1,
            min_samples_leaf=2,
        )
    else:
        raise ValueError(f"Unsupported model: {name!r} (use rf)")

    return Pipeline([("pre", pre), ("model", reg)])


def main() -> int:
    parser = argparse.ArgumentParser(description="Train fame-blind Spotify popularity model")
    parser.add_argument(
        "features_csv",
        type=Path,
        help="Kaggle 1.2M features CSV (e.g. spotify12million/tracks_features.csv)",
    )
    parser.add_argument(
        "labeled_csv",
        type=Path,
        help="Kaggle labeled CSV with popularity (e.g. spotify_data.csv)",
    )
    parser.add_argument("--hf", metavar="DATASET", help="HuggingFace dataset fallback for labeled_csv")
    parser.add_argument("--model", default="rf", choices=["rf"], help="Model type")
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--sample", type=int, default=None, help="Load only first N rows (quick runs)")
    args = parser.parse_args()

    df = choose_training_frame(args.features_csv, args.labeled_csv, args.hf, args.sample)
    X, y = prepare(df)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=42
    )

    pipe = build_model(args.model, list(X.columns))
    print(f"Training {args.model} on {len(X_train):,} rows...")
    pipe.fit(X_train, y_train)
    pred = pipe.predict(X_test)

    print(f"Model: {args.model} | rows: {len(X):,} | features: {list(X.columns)}")
    print(f"Holdout R2:   {r2_score(y_test, pred):.4f}")
    print(f"Holdout MAE:  {mean_absolute_error(y_test, pred):.4f}")
    print("(Fame-blind: excluded artist/track/album/genre/id columns)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
