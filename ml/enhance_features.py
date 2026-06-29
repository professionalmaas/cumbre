"""
Cumbre — Feature engineering / dataset enhancement
==================================================
Adds INTRINSIC engineered features (no fame leakage) that tend to lift model
performance, plus light cleaning. Safe to run on any rebuilt training table.

All derived features use only the song's own audio descriptors — nothing about
the artist's popularity/following — so the fame-blind property is preserved.

  add_engineered(df) -> df with extra columns + a list of the new feature names
  clean(df)          -> dtype coercion, clip ranges, drop impossible rows
"""
from __future__ import annotations
import numpy as np, pandas as pd

ENGINEERED = [
    "track_age", "energy_x_loud", "groove", "mood_intensity", "dance_energy",
    "is_instrumental", "is_acoustic", "duration_min", "tempo_bucket",
    "valence_sq", "speech_flag",
]

def clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    num = ["danceability","energy","loudness","speechiness","acousticness",
           "instrumentalness","liveness","valence","tempo","duration_ms","popularity","year"]
    for c in num:
        if c in df: df[c] = pd.to_numeric(df[c], errors="coerce")
    # plausible ranges
    if "tempo" in df: df = df[(df["tempo"].isna()) | (df["tempo"].between(30, 260))]
    if "duration_ms" in df: df = df[(df["duration_ms"].isna()) | (df["duration_ms"].between(30000, 1_800_000))]
    if "explicit" in df: df["explicit"] = df["explicit"].map(lambda x: int(bool(x)) if not pd.isna(x) else 0)
    return df

def add_engineered(df: pd.DataFrame):
    df = df.copy()
    cur = int(pd.Timestamp.now().year)
    g = df.get
    if "year" in df:        df["track_age"] = (cur - df["year"]).clip(lower=0)
    if {"energy","loudness"}.issubset(df):  df["energy_x_loud"] = df["energy"] * df["loudness"]
    if {"danceability","tempo"}.issubset(df): df["groove"] = df["danceability"] * (df["tempo"] / 120.0)
    if {"valence","energy"}.issubset(df):   df["mood_intensity"] = df["valence"] * df["energy"]
    if {"danceability","energy"}.issubset(df): df["dance_energy"] = df["danceability"] * df["energy"]
    if "instrumentalness" in df: df["is_instrumental"] = (df["instrumentalness"] > 0.5).astype(int)
    if "acousticness" in df:     df["is_acoustic"] = (df["acousticness"] > 0.5).astype(int)
    if "duration_ms" in df:      df["duration_min"] = df["duration_ms"] / 60000.0
    if "tempo" in df:            df["tempo_bucket"] = pd.cut(df["tempo"], [0,90,110,130,160,260],
                                                            labels=False).astype("float")
    if "valence" in df:          df["valence_sq"] = df["valence"] ** 2
    if "speechiness" in df:      df["speech_flag"] = (df["speechiness"] > 0.33).astype(int)
    present = [c for c in ENGINEERED if c in df.columns]
    return df, present


if __name__ == "__main__":
    import sys
    df = pd.read_csv(sys.argv[1])
    df = clean(df)
    df, new = add_engineered(df)
    out = sys.argv[2] if len(sys.argv) > 2 else "enhanced.csv"
    df.to_csv(out, index=False)
    print(f"Wrote {out}: {len(df):,} rows, added engineered features: {new}")
