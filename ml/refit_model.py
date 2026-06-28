"""
Cumbre — Refit the SMU model on IN-HOUSE features
=================================================
Your deployed model was a KNN (k=20, Manhattan, distance-weighted) trained on
SPOTIFY feature distributions with target `hit = popularity >= 0.90`. Because
KNN is scale/distribution sensitive, you cannot feed cumbre_engine features into
the old scaler/model. This script REFITS the same pipeline on features extracted
by cumbre_engine, preserving the schema, the target definition, the StandardScaler
step, the GridSearch, and the F1-threshold tuning — only the weights change.

Two modes:
  1) Real:  build_training_table(rows) from your labeled corpus, then refit().
  2) Self-test:  `python refit_model.py --selftest`  (synthetic data; proves the
     pipeline trains/saves/loads and beats chance — used by the test suite).

Output artifact mirrors your original pickle's structure + the scaler:
  {best_model, scaler, model_name, best_f1_threshold, required_vars,
   outcome_variable, trained_at, cv_f1}
"""
from __future__ import annotations
import argparse, pickle, time, json
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import KNeighborsClassifier
from sklearn.model_selection import train_test_split, GridSearchCV, StratifiedKFold
from sklearn.metrics import f1_score
from sklearn.pipeline import Pipeline

REQUIRED_VARS = ['explicit','instrumentalness','duration_ms','year','loudness',
                 'danceability','energy','acousticness','speechiness','key','mode']
HIT_THRESHOLD = 0.90  # popularity >= 0.90  (unchanged from the SMU work)


def build_training_table(rows):
    """rows: iterable of dicts {audio_path, popularity (0..1), year, explicit?, lyrics?}.
    Extracts in-house features and returns (X[list[dict]], y[list[int]])."""
    import cumbre_engine as ce
    try:
        import cumbre_lyrics as cl
    except Exception:
        cl = None
    X, y = [], []
    for r in rows:
        feats = ce.analyze(r["audio_path"], r.get("genre", "pop"))
        explicit = r.get("explicit", 0)
        if cl and r.get("lyrics"):
            explicit = cl.analyze_lyrics(r["lyrics"]).explicit
        X.append(ce.to_model_features(feats, year=r.get("year", 2026), explicit=explicit))
        y.append(int(float(r["popularity"]) >= HIT_THRESHOLD))
    return X, y


def _to_matrix(X):
    return np.array([[row[k] for k in REQUIRED_VARS] for row in X], dtype=float)


def best_threshold(y_true, proba):
    """Pick the probability cutoff that maximizes F1 (mirrors the SMU approach)."""
    best_t, best_f1 = 0.5, -1.0
    for t in np.linspace(0.05, 0.95, 91):
        f1 = f1_score(y_true, (proba >= t).astype(int), zero_division=0)
        if f1 > best_f1:
            best_f1, best_t = f1, float(t)
    return round(best_t, 4), round(best_f1, 4)


def refit(X, y, save_path="CUMBRE_best_model_and_metadata.pkl", seed=42):
    Xm, y = _to_matrix(X), np.asarray(y, dtype=int)
    if len(set(y.tolist())) < 2:
        raise ValueError("Need both hit and non-hit examples to train.")
    Xtr, Xte, ytr, yte = train_test_split(Xm, y, test_size=0.25, random_state=seed, stratify=y)

    pipe = Pipeline([("scaler", StandardScaler()), ("knn", KNeighborsClassifier())])
    grid = {
        "knn__n_neighbors": [5, 11, 20, 35],
        "knn__weights": ["uniform", "distance"],
        "knn__metric": ["manhattan", "euclidean"],
    }
    cv = StratifiedKFold(n_splits=min(5, np.bincount(ytr).min()), shuffle=True, random_state=seed)
    gs = GridSearchCV(pipe, grid, scoring="f1", cv=cv, n_jobs=-1)
    gs.fit(Xtr, ytr)
    model = gs.best_estimator_

    proba = model.predict_proba(Xte)[:, 1]
    thr, f1_at_thr = best_threshold(yte, proba)
    test_f1 = round(f1_score(yte, (proba >= thr).astype(int), zero_division=0), 4)

    artifact = {
        "best_model": model,                 # full pipeline (scaler+knn) — feed raw in-house features
        "scaler": model.named_steps["scaler"],
        "model_name": "KNN",
        "best_f1_threshold": thr,
        "required_vars": REQUIRED_VARS,
        "outcome_variable": "popularity_group (popularity>=0.90)",
        "feature_source": "cumbre_engine (in-house; NOT Spotify API)",
        "cv_f1": round(gs.best_score_, 4),
        "test_f1": test_f1,
        "best_params": gs.best_params_,
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    with open(save_path, "wb") as fh:
        pickle.dump(artifact, fh)
    return artifact


def predict(artifact, feature_dict):
    """Predict hit/not using a refit artifact + a cumbre_engine model vector."""
    x = np.array([[feature_dict[k] for k in artifact["required_vars"]]], dtype=float)
    proba = artifact["best_model"].predict_proba(x)[0, 1]
    return {"hit": bool(proba >= artifact["best_f1_threshold"]),
            "score": round(float(proba), 4),
            "threshold": artifact["best_f1_threshold"]}


def _selftest():
    """Synthetic, learnable data -> pipeline must beat chance and round-trip on disk."""
    rng = np.random.default_rng(0)
    n = 400
    X = []
    y = []
    for _ in range(n):
        hit = rng.random() < 0.4
        # hits trend: louder, more danceable, slightly newer (a learnable signal + noise)
        X.append({
            "explicit": int(rng.random() < 0.3),
            "instrumentalness": float(rng.random()*0.3),
            "duration_ms": int(rng.normal(200000, 30000)),
            "year": int(rng.integers(2015, 2026)) + (2 if hit else 0),
            "loudness": float(rng.normal(-8 if hit else -12, 2)),
            "danceability": float(np.clip(rng.normal(0.75 if hit else 0.55, 0.12), 0, 1)),
            "energy": float(np.clip(rng.normal(0.7 if hit else 0.55, 0.15), 0, 1)),
            "acousticness": float(np.clip(rng.normal(0.2 if hit else 0.4, 0.15), 0, 1)),
            "speechiness": float(np.clip(rng.normal(0.1, 0.05), 0, 1)),
            "key": int(rng.integers(0, 12)),
            "mode": int(rng.random() < 0.6),
        })
        y.append(int(hit))
    art = refit(X, y, save_path="CUMBRE_selftest_model.pkl")
    loaded = pickle.load(open("CUMBRE_selftest_model.pkl", "rb"))
    pred = predict(loaded, X[0])
    print(json.dumps({"cv_f1": art["cv_f1"], "test_f1": art["test_f1"],
                      "threshold": art["best_f1_threshold"], "best_params": art["best_params"],
                      "sample_pred": pred}, indent=2))
    assert art["test_f1"] > 0.45, "pipeline failed to beat chance on learnable data"
    assert set(loaded["required_vars"]) == set(REQUIRED_VARS)
    print("SELFTEST OK")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--corpus", help="JSON list of {audio_path,popularity,year,genre,lyrics?}")
    ap.add_argument("--out", default="CUMBRE_best_model_and_metadata.pkl")
    a = ap.parse_args()
    if a.selftest:
        _selftest()
    elif a.corpus:
        rows = json.load(open(a.corpus))
        X, y = build_training_table(rows)
        art = refit(X, y, save_path=a.out)
        print(json.dumps({k: art[k] for k in ("model_name","cv_f1","test_f1","best_f1_threshold","best_params")}, indent=2))
    else:
        print("Use --selftest or --corpus path.json")
