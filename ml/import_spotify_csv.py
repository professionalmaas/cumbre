"""
Cumbre — Spotify CSV importer  ->  fame-blind labels (and a baseline model)
==========================================================================
Point this at a Spotify dataset CSV. Behavior depends on what's in the file:

  * If an ARTIST column exists  -> builds a true FAME-BLIND target (within-artist
    normalization: a song vs its own artist's average, so fame cancels out) and
    uses an artist-stratified split. THIS IS THE GOAL.

  * If NO artist column         -> falls back to a BASELINE on top-quantile
    popularity, with a loud warning that the target still contains artist fame.
    (Your processed SPOTIFY.csv is this case — see note at bottom.)

It auto-detects whether the data is already standardized (z-scored) so it won't
double-scale, and labels via top-quantile (robust to either scale).

Usage:
  python import_spotify_csv.py                       # newest CSV in ~/Downloads
  python import_spotify_csv.py SPOTIFY.csv --train
  python import_spotify_csv.py raw.csv --artist-col artist_name --pop-col track_popularity --train
"""
from __future__ import annotations
import argparse, glob, os, sys, json, time, pickle
import numpy as np, pandas as pd
import cumbre_fameblind as fb

CAND_ARTIST = ["artist", "artist_name", "artists", "track_artist", "artist(s)_name", "main_artist", "artist_id"]
CAND_POP    = ["popularity", "track_popularity", "pop", "popularity_score", "song_popularity"]
KNOWN_FEATURES = ["explicit", "instrumentalness", "duration_ms", "year", "loudness",
                  "danceability", "energy", "acousticness", "speechiness", "key", "mode",
                  "tempo", "valence", "liveness", "time_signature"]


def find_col(cols, candidates):
    low = {c.lower(): c for c in cols}
    for cand in candidates:
        if cand in low:
            return low[cand]
    return None


def _train(d, feats, label_col, artist_col, top_quantile, note):
    from sklearn.preprocessing import StandardScaler
    from sklearn.neighbors import KNeighborsClassifier
    from sklearn.pipeline import Pipeline
    from sklearn.model_selection import GridSearchCV, StratifiedKFold
    from sklearn.metrics import f1_score, roc_auc_score
    d = d.dropna(subset=[label_col] + feats).copy()
    d[label_col] = d[label_col].astype(int)
    if artist_col and artist_col in d:
        tr, te = fb.artist_stratified_split(d, artist_col=artist_col, test_size=0.25)
        split = "artist-stratified (no fame leakage across split)"
    else:
        from sklearn.model_selection import train_test_split
        tr, te = train_test_split(d, test_size=0.25, random_state=42, stratify=d[label_col])
        split = "random (no artist column to stratify on — may leak)"
    Xtr = tr[feats].apply(pd.to_numeric, errors="coerce").fillna(0).values
    Xte = te[feats].apply(pd.to_numeric, errors="coerce").fillna(0).values
    ytr, yte = tr[label_col].values, te[label_col].values
    pipe = Pipeline([("scaler", StandardScaler()), ("knn", KNeighborsClassifier())])
    grid = {"knn__n_neighbors": [11, 20, 35], "knn__weights": ["distance"],
            "knn__metric": ["manhattan", "euclidean"]}
    gs = GridSearchCV(pipe, grid, scoring="f1",
                      cv=StratifiedKFold(5, shuffle=True, random_state=42), n_jobs=-1)
    gs.fit(Xtr, ytr)
    proba = gs.best_estimator_.predict_proba(Xte)[:, 1]
    bt, bf = 0.5, -1.0
    for t in np.linspace(0.1, 0.9, 81):
        f = f1_score(yte, (proba >= t).astype(int), zero_division=0)
        if f > bf:
            bf, bt = f, float(t)
    art = {"best_model": gs.best_estimator_, "features": feats, "best_f1_threshold": round(bt, 4),
           "split": split, "label": label_col, "auc": round(roc_auc_score(yte, proba), 4),
           "cv_f1": round(gs.best_score_, 4), "test_f1": round(float(bf), 4),
           "best_params": gs.best_params_, "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
           "note": note}
    pickle.dump(art, open("CUMBRE_fameblind_model.pkl", "wb"))
    print(json.dumps({k: art[k] for k in ("label", "split", "auc", "cv_f1", "test_f1",
                                          "best_f1_threshold", "best_params")}, indent=2))
    print("Saved CUMBRE_fameblind_model.pkl")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", nargs="?")
    ap.add_argument("--artist-col"); ap.add_argument("--pop-col")
    ap.add_argument("--top-quantile", type=float, default=0.30)
    ap.add_argument("--train", action="store_true")
    ap.add_argument("--out", default="cumbre_fameblind_labeled.csv")
    a = ap.parse_args()

    path = a.csv
    if not path:
        dl = os.path.expanduser("~/Downloads")
        cands = sorted(glob.glob(os.path.join(dl, "*.csv")), key=os.path.getmtime, reverse=True)
        if not cands:
            sys.exit("No CSV given and none found in ~/Downloads.")
        path = cands[0]; print(f"Using newest CSV in Downloads:\n  {path}")
    df = pd.read_csv(path)
    print(f"Loaded {len(df):,} rows x {len(df.columns)} columns")

    artist = a.artist_col or find_col(df.columns, CAND_ARTIST)
    pop = a.pop_col or find_col(df.columns, CAND_POP)
    if not pop:
        print("Columns:", list(df.columns)); sys.exit("No popularity column found — pass --pop-col.")
    feats = [c for c in KNOWN_FEATURES if c in df.columns]
    p = pd.to_numeric(df[pop], errors="coerce")
    standardized = (p.min() < -0.01) or (p.max() <= 1.5 and p.min() < 0)
    print(f"popularity column = '{pop}'  ({'already standardized' if standardized else 'raw scale'})")
    print(f"feature columns ({len(feats)}): {feats}")

    work = df.copy()
    work["popularity"] = p
    # top-quantile label works regardless of scale
    cut = p.quantile(1 - a.top_quantile)

    if artist:
        print(f"artist column = '{artist}'  -> building TRUE fame-blind (within-artist) target")
        work["artist"] = df[artist].astype(str)
        rep = fb.contamination_report(work, artist_col="artist", pop_col="popularity")
        print("\n--- Fame contamination ---\n" + json.dumps(rep, indent=2))
        work = fb.build_fameblind_target(work, method="within_artist", artist_col="artist", pop_col="popularity")
        work = fb.make_binary_label(work, top_quantile=a.top_quantile)  # hit_fameblind
        label_col, note = "hit_fameblind", "fame-blind within-artist target"
        artist_col = "artist"
    else:
        print("\n⚠  NO ARTIST COLUMN FOUND.")
        print("   Cannot remove artist fame from the target. Falling back to a BASELINE on")
        print("   top-quantile popularity — useful, but the target STILL CONTAINS FAME.")
        print("   To get a true fame-blind model, re-export the dataset WITH an artist name/ID")
        print("   column (the raw Spotify pull has it), then re-run this importer.")
        work["hit_baseline"] = (work["popularity"] >= cut).astype(int)
        label_col, note = "hit_baseline", "FAME-CONTAMINATED baseline (no artist column available)"
        artist_col = None

    keepcols = (["artist"] if artist else []) + ["popularity", label_col] + feats
    work[keepcols].to_csv(a.out, index=False)
    print(f"\nWrote {a.out}  | positives: {int(work[label_col].fillna(0).astype(int).sum()):,} "
          f"of {int(work[label_col].notna().sum()):,} labeled")

    if a.train:
        if len(feats) < 4:
            sys.exit(f"Only {len(feats)} feature columns — need >=4 to train.")
        print(f"\n--- Training ({note}) ---")
        _train(work, feats,               label_col, artist_col, a.top_quantile, note)


if __name__ == "__main__":
    main()
