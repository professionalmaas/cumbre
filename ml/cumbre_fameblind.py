"""
Cumbre — Fame-Blind Labeling Harness
====================================
The hard problem in song-quality modeling: "popularity" is mostly artist fame,
not song craft. This module builds a training TARGET that strips fame out, so a
model learns intrinsic quality. 100% in-house (pandas/numpy only — no torch,
no external services).

Three ways to get a fame-blind target (use the best you have data for):

  1. within_artist            residual popularity vs the artist's own average
                              (fame baseline cancels out per artist). Needs
                              >=2 songs per artist.
  2. blind_panel              anonymized listener ratings (Salganik design):
                              no artist name, no play counts. The gold standard.
  3. hybrid                   panel where available, else within-artist residual.

Plus: artist-stratified splitting (prevents the model memorizing artists) and a
contamination diagnostic (how much of "popularity" is just the artist?).

No fame features ever enter X — that is enforced by FAME_FEATURES below.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

# features that leak fame — never allow these as model inputs
FAME_FEATURES = {
    "artist_popularity", "artist_followers", "followers", "monthly_listeners",
    "streams", "playcount", "play_count", "popularity", "chart_weeks",
    "prior_chart", "label_size", "artist_id_popularity",
}


# ----------------------------------------------------------------- targets
def within_artist_residual(df: pd.DataFrame, artist_col="artist",
                           pop_col="popularity", method="zscore") -> pd.DataFrame:
    """Fame-blind target = how a song does RELATIVE TO ITS OWN ARTIST.

    method='zscore' -> (pop - artist_mean) / artist_std   (needs >=2 songs)
    method='residual' -> pop - artist_mean
    Artists with a single song get NaN (can't separate song from artist) and are
    flagged; decide to drop or route them to the blind panel.
    """
    df = df.copy()
    grp = df.groupby(artist_col)[pop_col]
    counts = grp.transform("count")
    mean = grp.transform("mean")
    if method == "zscore":
        std = grp.transform("std").replace(0, np.nan)
        df["fameblind_target"] = (df[pop_col] - mean) / std
    else:
        df["fameblind_target"] = df[pop_col] - mean
    df.loc[counts < 2, "fameblind_target"] = np.nan
    df["fameblind_source"] = np.where(counts >= 2, "within_artist", "insufficient")
    return df


def merge_blind_panel(df: pd.DataFrame, panel: pd.DataFrame,
                      key="song_id", rating_col="blind_rating") -> pd.DataFrame:
    """Merge anonymized blind-listener ratings (the cleanest fame-free signal).

    panel: columns [key, rating_col] where rating_col is the mean rating/save-rate
    from listeners who never saw the artist name or any play counts.
    """
    df = df.copy()
    agg = panel.groupby(key)[rating_col].mean().rename("panel_rating")
    df = df.merge(agg, left_on=key, right_index=True, how="left")
    # standardize the panel rating to be comparable with within-artist z
    if df["panel_rating"].notna().any():
        m, s = df["panel_rating"].mean(), df["panel_rating"].std() or 1.0
        df["panel_z"] = (df["panel_rating"] - m) / s
    else:
        df["panel_z"] = np.nan
    return df


def build_fameblind_target(df: pd.DataFrame, method="hybrid", artist_col="artist",
                           pop_col="popularity") -> pd.DataFrame:
    """Produce a single `fameblind_target` column via the chosen strategy."""
    out = within_artist_residual(df, artist_col, pop_col)
    if method in ("panel", "hybrid"):
        if "panel_z" not in out:
            raise ValueError("Call merge_blind_panel() before using panel/hybrid.")
        if method == "panel":
            out["fameblind_target"] = out["panel_z"]
            out["fameblind_source"] = np.where(out["panel_z"].notna(), "panel", "missing")
        else:  # hybrid: prefer panel, fall back to within-artist
            out["fameblind_target"] = out["panel_z"].fillna(out["fameblind_target"])
            out["fameblind_source"] = np.where(out["panel_z"].notna(), "panel", out["fameblind_source"])
    return out


def make_binary_label(df: pd.DataFrame, top_quantile=0.30, col="fameblind_target",
                      out_col="hit_fameblind") -> pd.DataFrame:
    """Top-quantile of the fame-blind target = 'intrinsically strong'."""
    df = df.copy()
    valid = df[col].dropna()
    if valid.empty:
        raise ValueError("No valid fame-blind targets to threshold.")
    cutoff = valid.quantile(1 - top_quantile)
    df[out_col] = (df[col] >= cutoff).astype("Int64")
    df.loc[df[col].isna(), out_col] = pd.NA
    df.attrs["label_cutoff"] = float(cutoff)
    return df


# ----------------------------------------------------------------- hygiene
def drop_fame_features(df: pd.DataFrame) -> pd.DataFrame:
    """Remove any fame-leaking columns from a feature frame (safety net)."""
    bad = [c for c in df.columns if c.lower() in FAME_FEATURES]
    return df.drop(columns=bad), bad


def artist_stratified_split(df: pd.DataFrame, artist_col="artist", test_size=0.25, seed=42):
    """Split so NO artist appears in both train and test (prevents fame memorization)."""
    rng = np.random.default_rng(seed)
    artists = df[artist_col].dropna().unique()
    rng.shuffle(artists)
    n_test = max(1, int(len(artists) * test_size))
    test_artists = set(artists[:n_test])
    test_mask = df[artist_col].isin(test_artists)
    return df[~test_mask].copy(), df[test_mask].copy()


def contamination_report(df: pd.DataFrame, artist_col="artist", pop_col="popularity") -> dict:
    """How much of 'popularity' is just the artist? High R^2 => fame-dominated."""
    g = df.groupby(artist_col)[pop_col]
    artist_mean = g.transform("mean")
    ss_tot = float(((df[pop_col] - df[pop_col].mean()) ** 2).sum()) or 1.0
    ss_between = float(((artist_mean - df[pop_col].mean()) ** 2).sum())
    r2_artist = ss_between / ss_tot
    return {
        "n_songs": int(len(df)),
        "n_artists": int(df[artist_col].nunique()),
        "songs_per_artist": round(len(df) / max(df[artist_col].nunique(), 1), 2),
        "variance_explained_by_artist": round(r2_artist, 3),
        "interpretation": ("fame-dominated — within-artist or panel target strongly advised"
                           if r2_artist > 0.5 else
                           "moderate fame effect — fame-blind target still recommended"),
    }


# ----------------------------------------------------------------- self-test
def _selftest():
    rng = np.random.default_rng(0)
    rows = []
    for a in range(30):                       # 30 artists
        fame = rng.normal(0, 1)               # artist fame baseline
        for s in range(rng.integers(2, 6)):   # 2-5 songs each
            craft = rng.normal(0, 1)          # intrinsic song quality (what we want)
            pop = 0.8 * fame + 0.3 * craft + rng.normal(0, 0.1)  # fame dominates
            rows.append({"song_id": f"{a}_{s}", "artist": f"artist_{a}",
                         "popularity": pop, "true_craft": craft})
    df = pd.DataFrame(rows)
    rep = contamination_report(df)
    assert rep["variance_explained_by_artist"] > 0.5, "expected fame-dominated"

    fb = build_fameblind_target(df, method="within_artist")
    fb = make_binary_label(fb, top_quantile=0.3)
    # fame-blind target should correlate with TRUE craft far better than raw popularity does
    corr_raw = np.corrcoef(df["popularity"], df["true_craft"])[0, 1]
    valid = fb.dropna(subset=["fameblind_target"])
    corr_fb = np.corrcoef(valid["fameblind_target"], valid["true_craft"])[0, 1]
    tr, te = artist_stratified_split(fb)
    overlap = set(tr["artist"]) & set(te["artist"])

    print(f"contamination: artist explains {rep['variance_explained_by_artist']:.0%} of popularity")
    print(f"corr(raw_pop, craft)      = {corr_raw:.3f}")
    print(f"corr(fameblind, craft)    = {corr_fb:.3f}   (should be much higher)")
    print(f"artist overlap train/test = {len(overlap)} (must be 0)")
    assert corr_fb > corr_raw + 0.2, "fame-blind target should track craft better"
    assert len(overlap) == 0, "artist leaked across split"
    print("FAMEBLIND SELFTEST OK")


if __name__ == "__main__":
    _selftest()
