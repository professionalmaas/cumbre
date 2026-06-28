#!/usr/bin/env python3
"""Attach popularity to tracks_features.csv via join + fame-blind model prediction."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
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


def _encode_explicit(series: pd.Series) -> pd.Series:
    return series.map({True: 1, False: 0, "True": 1, "False": 0, "true": 1, "false": 0})


def load_popularity_map(labeled_csv: Path, chunksize: int = 200_000) -> dict[str, float]:
    mapping: dict[str, float] = {}
    for chunk in pd.read_csv(labeled_csv, usecols=["track_id", "popularity"], chunksize=chunksize):
        chunk = chunk.dropna(subset=["track_id", "popularity"])
        for tid, pop in zip(chunk["track_id"].astype(str), chunk["popularity"]):
            mapping[tid] = float(pop)
    return mapping


def prepare_xy(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series | None]:
    work = df.copy()
    if "explicit" in work.columns:
        work["explicit"] = _encode_explicit(work["explicit"])
    cols = [c for c in AUDIO_FEATURES if c in work.columns]
    X = work[cols]
    y = None
    if "popularity" in work.columns:
        y = pd.to_numeric(work["popularity"], errors="coerce")
    return X, y


def build_model(kind: str, feature_cols: list[str]) -> Pipeline:
    numeric = [c for c in feature_cols if c != "explicit"]
    cat = [c for c in feature_cols if c == "explicit"]
    transformers = []
    if numeric:
        transformers.append(
            (
                "num",
                Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]),
                numeric,
            )
        )
    if cat:
        transformers.append(
            (
                "cat",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("onehot", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                cat,
            )
        )
    pre = ColumnTransformer(transformers)
    if kind == "hgb":
        reg = HistGradientBoostingRegressor(random_state=42, max_iter=200, learning_rate=0.08)
    else:
        reg = RandomForestRegressor(n_estimators=120, random_state=42, n_jobs=-1, min_samples_leaf=4)
    return Pipeline([("pre", pre), ("model", reg)])


def train_on_labeled(labeled_csv: Path, model_kind: str, train_sample: int | None) -> tuple[Pipeline, list[str]]:
    if train_sample:
        df = pd.read_csv(labeled_csv, nrows=train_sample)
    else:
        df = pd.read_csv(labeled_csv)
    X, y = prepare_xy(df)
    mask = y.notna()
    X, y = X.loc[mask], y.loc[mask]
    feature_cols = list(X.columns)
    pipe = build_model(model_kind, feature_cols)
    print(f"Training {model_kind} popularity model on {len(X):,} labeled rows ({len(feature_cols)} features)...")
    pipe.fit(X, y)
    return pipe, feature_cols


def enrich(
    features_csv: Path,
    labeled_csv: Path,
    out_csv: Path,
    model_kind: str,
    train_sample: int | None,
    chunksize: int,
) -> None:
    pop_map = load_popularity_map(labeled_csv)
    print(f"Loaded {len(pop_map):,} labeled track ids from {labeled_csv.name}")

    pipe, feature_cols = train_on_labeled(labeled_csv, model_kind, train_sample)

    first = True
    total = 0
    observed = 0
    parts: list[pd.Series] = []

    for chunk in pd.read_csv(features_csv, chunksize=chunksize):
        chunk["track_id"] = chunk["id"].astype(str)
        chunk["popularity_spotify"] = chunk["track_id"].map(pop_map)
        observed += chunk["popularity_spotify"].notna().sum()

        X, _ = prepare_xy(chunk)
        X = X.reindex(columns=feature_cols, fill_value=np.nan)
        chunk["popularity_predicted"] = np.clip(pipe.predict(X), 0, 100)
        chunk["popularity"] = chunk["popularity_spotify"].fillna(chunk["popularity_predicted"])
        chunk["popularity_source"] = np.where(
            chunk["popularity_spotify"].notna(), "spotify_join", "model_predicted"
        )
        parts.append(chunk["popularity"].copy())
        total += len(chunk)

        chunk.to_csv(out_csv, mode="w" if first else "a", header=first, index=False)
        first = False
        print(f"  wrote {total:,} rows...", end="\r")

    print(f"\nEnriched {total:,} rows -> {out_csv}")
    print(f"  Spotify join hits: {observed:,} ({100 * observed / total:.2f}%)")
    print(f"  Model-filled:      {total - observed:,}")

    all_pop = pd.concat(parts, ignore_index=True)
    all_pop = pd.to_numeric(all_pop, errors="coerce")
    ranks = all_pop.rank(method="average", pct=True) * 100

    # Second pass: add relative_popularity percentile column
    print("Adding relative_popularity percentile...")
    first = True
    offset = 0
    for chunk in pd.read_csv(out_csv, chunksize=chunksize):
        n = len(chunk)
        chunk["relative_popularity"] = ranks.iloc[offset : offset + n].to_numpy()
        offset += n
        chunk.to_csv(out_csv.with_suffix(".tmp.csv"), mode="w" if first else "a", header=first, index=False)
        first = False

    out_csv.with_suffix(".tmp.csv").replace(out_csv)
    print("Done.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrich tracks_features.csv with popularity")
    parser.add_argument("features_csv", type=Path)
    parser.add_argument("labeled_csv", type=Path)
    parser.add_argument("-o", "--output", type=Path, default=None)
    parser.add_argument("--model", choices=["hgb", "rf"], default="hgb")
    parser.add_argument("--train-sample", type=int, default=None, help="Train on first N labeled rows")
    parser.add_argument("--chunksize", type=int, default=100_000)
    args = parser.parse_args()

    out = args.output or args.features_csv.with_name("tracks_features_with_popularity.csv")
    enrich(args.features_csv, args.labeled_csv, out, args.model, args.train_sample, args.chunksize)
    return 0


if __name__ == "__main__":
    sys.exit(main())
