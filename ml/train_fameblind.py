"""
Cumbre — one-command fame-blind trainer
=======================================
Merge sources -> engineer features -> build fame-blind target -> train -> save.
The single command to rebuild your model on the recovered data.

Examples:
  # your local big files + the Hugging Face 114k, merged, engineered, trained:
  python train_fameblind.py spotify_12m.csv spotify_data.csv \
         --hf maharshipandya/spotify-tracks-dataset --model rf

  # just one file:
  python train_fameblind.py cumbre_training.csv --model knn
"""
from __future__ import annotations
import argparse, sys, json, time, pickle
import numpy as np, pandas as pd
import rebuild_dataset as rb, cumbre_fameblind as fb, enhance_features as ef

BASE = ["danceability","energy","key","loudness","mode","speechiness","acousticness",
        "instrumentalness","liveness","valence","tempo","duration_ms","explicit","year"]


def load_all(csvs, hf):
    frames = []
    for p in csvs:
        print(f"loading {p} ...", flush=True); frames.append(rb.normalize(pd.read_csv(p)))
    if hf:
        from datasets import load_dataset
        print(f"loading HF {hf} ...", flush=True)
        frames.append(rb.normalize(load_dataset(hf, split="train").to_pandas()))
    if not frames:
        sys.exit("Provide CSV(s) or --hf.")
    df = pd.concat(frames, ignore_index=True)
    return rb.dedupe(df)


def make_model(kind):
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    if kind == "knn":
        from sklearn.neighbors import KNeighborsClassifier
        return Pipeline([("s", StandardScaler()),
                         ("m", KNeighborsClassifier(n_neighbors=25, weights="distance", metric="manhattan"))])
    if kind == "rf":
        from sklearn.ensemble import RandomForestClassifier
        return RandomForestClassifier(n_estimators=300, min_samples_leaf=2,
                                      class_weight="balanced", n_jobs=-1, random_state=42)
    from sklearn.linear_model import LogisticRegression
    return Pipeline([("s", StandardScaler()),
                     ("m", LogisticRegression(max_iter=1000, class_weight="balanced"))])


def evaluate(model, Xtr, ytr, Xte, yte):
    from sklearn.metrics import f1_score, roc_auc_score
    model.fit(Xtr, ytr)
    p = model.predict_proba(Xte)[:, 1]
    bt, bf = 0.5, -1.0
    for t in np.linspace(0.1, 0.9, 81):
        f = f1_score(yte, (p >= t).astype(int), zero_division=0)
        if f > bf:
            bf, bt = f, float(t)
    return round(roc_auc_score(yte, p), 4), round(float(bf), 4), round(bt, 4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csvs", nargs="*")
    ap.add_argument("--hf")
    ap.add_argument("--top-quantile", type=float, default=0.30)
    ap.add_argument("--min-songs-per-artist", type=int, default=2)
    ap.add_argument("--max", type=int)
    ap.add_argument("--model", default="rf", choices=["rf", "knn", "logreg"])
    ap.add_argument("--no-engineer", action="store_true")
    ap.add_argument("--out", default="CUMBRE_fameblind_model.pkl")
    a = ap.parse_args()

    df = load_all(a.csvs, a.hf)
    print(f"combined+deduped: {len(df):,} rows", flush=True)
    df = ef.clean(df)
    eng = []
    if not a.no_engineer:
        df, eng = ef.add_engineered(df)
        print("engineered features:", eng, flush=True)

    has_artist = "artist" in df and df["artist"].notna().any()
    if has_artist:
        vc = df["artist"].value_counts(); keep = vc[vc >= a.min_songs_per_artist].index
        df = df[df["artist"].isin(keep)]
        rep = fb.contamination_report(df, "artist", "popularity")
        print("contamination report:", json.dumps(rep), flush=True)
        df = fb.build_fameblind_target(df, "within_artist", "artist", "popularity")
        df = fb.make_binary_label(df, top_quantile=a.top_quantile)
        label, note = "hit_fameblind", "fame-blind within-artist"
    else:
        cut = df["popularity"].quantile(1 - a.top_quantile)
        df["hit_baseline"] = (df["popularity"] >= cut).astype(int)
        label, note = "hit_baseline", "FAME-CONTAMINATED baseline (no artist col)"
        print("WARNING:", note, flush=True)

    feats = [c for c in BASE + eng if c in df.columns]
    d = df.dropna(subset=[label] + feats).copy(); d[label] = d[label].astype(int)
    if a.max and len(d) > a.max:
        d = d.sample(a.max, random_state=42)
    print(f"training rows: {len(d):,}  features: {len(feats)}", flush=True)

    if has_artist:
        tr, te = fb.artist_stratified_split(d, "artist", 0.25)
    else:
        from sklearn.model_selection import train_test_split
        tr, te = train_test_split(d, test_size=0.25, random_state=42, stratify=d[label])
    Xtr, ytr = tr[feats].fillna(0).values, tr[label].values
    Xte, yte = te[feats].fillna(0).values, te[label].values

    auc, f1, thr = evaluate(make_model(a.model), Xtr, ytr, Xte, yte)
    print(f"\n{a.model.upper()}  AUC={auc}  bestF1={f1}  @thr {thr}", flush=True)

    model = make_model(a.model); model.fit(np.vstack([Xtr, Xte]), np.concatenate([ytr, yte]))
    art = {"best_model": model, "features": feats, "engineered": eng, "label": label,
           "best_f1_threshold": thr, "auc": auc, "test_f1": f1, "target": note,
           "model_kind": a.model, "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")}
    pickle.dump(art, open(a.out, "wb"))
    print("saved", a.out, flush=True)


if __name__ == "__main__":
    main()
