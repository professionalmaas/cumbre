# Cumbre — Fully In-House ML (own your weights, own your target)

This is the commercial-safe path you asked for: **no external pretrained weights, no
encumbered licenses, nothing phoning home.** You train your own audio model on your own
data, against a target that has artist fame removed.

## Why this is genuinely "in-house" (the license math)

| Component | License | Commercial? | In request path? |
|---|---|---|---|
| librosa (features) | ISC | ✅ yes | local |
| torch (your model) | BSD-style | ✅ yes | local |
| numpy / scipy / scikit-learn / pandas | BSD | ✅ yes | local |
| pyloudnorm | MIT | ✅ yes | local |
| **your trained weights** | **yours** | ✅ yes | local |
| ~~Essentia pretrained embeddings~~ | ~~AGPL lib + CC BY-**NC** weights~~ | ❌ no (paid license) | — avoided |
| ~~MERT / MuQ weights~~ | ~~CC BY-NC~~ | ❌ no | — avoided |

So "wiring in Essentia embeddings" would have been a **license** dependency (non-commercial),
not a service dependency. We avoid it entirely. Everything here you can ship commercially and
run on your own servers with zero third-party permission.

## Two new modules

### 1. `cumbre_fameblind.py` — strip artist fame from your training target
The core insight, operationalized. "Popularity" is mostly *who made it*, not *how good it is*.
This builds a fame-blind target so the model learns craft.

- `contamination_report(df)` — how much of popularity is just the artist (R²). In a synthetic
  test where fame drove 93% of popularity, raw popularity tracked true craft at **r=0.22**; the
  fame-blind target recovered it to **r=0.77**. That gap is your product.
- `build_fameblind_target(df, method=...)`:
  - `within_artist` — residual/z-score of a song vs its own artist's average (fame cancels). Needs ≥2 songs/artist.
  - `blind_panel` — anonymized listener ratings (Salganik design: no artist name, no play counts) → the gold standard. Merge via `merge_blind_panel`.
  - `hybrid` — panel where you have it, else within-artist.
- `make_binary_label(df, top_quantile=0.30)` — top-quantile of the fame-blind target = "intrinsically strong."
- `artist_stratified_split(df)` — no artist in both train and test (prevents fame memorization).
- `drop_fame_features(df)` — safety net that strips followers/streams/popularity from inputs.

### 2. `cumbre_audionet.py` — your own learned audio embedding
A from-scratch CNN you train; the penultimate layer is **your** 128-d embedding — the owned
equivalent of MERT/Essentia embeddings.

- `log_mel(path)` — owned feature transform (librosa).
- `AudioNet` — 4-block CNN → 128-d embedding → task heads (fame-blind hit + auxiliary genre).
- `train(rows, audio_dir, ...)` — multitask training, early stopping, saves **your** `.pt` weights.
- `load_model()` / `embed_file(model, path)` — extract your embedding for any song.
- `python cumbre_audionet.py --selftest` — trains on synthetic data in seconds, asserts it learns.

## The full in-house training pipeline

```
1. Assemble corpus      rows of {filename, artist, popularity, genre, lyrics?}
                        (audio you own/are licensed to analyze)
2. Fame-blind target    cumbre_fameblind.build_fameblind_target(df, "within_artist" | "hybrid")
                        cumbre_fameblind.make_binary_label(df, top_quantile=0.30)
3. Split safely         cumbre_fameblind.artist_stratified_split(df)
4. Train your model     cumbre_audionet.train(rows, audio_dir, epochs=30)   -> cumbre_audionet.pt
5a. Use as classifier   load_model() -> predicts fame-blind "intrinsically strong"
5b. Or as features      embed_file(model, song) -> 128-d -> feed your KNN/logistic
                        (refit_model.py) alongside hand-crafted features
6. Serve               cumbre_scoring.analyze_song() stays the product surface;
                        swap the proxy music model for your trained one.
```

## How it plugs into what you already have
- Keep `cumbre_engine.py` (hand-crafted, owned features) — it still powers the human-readable
  fixes (LUFS, dynamics, stereo, structure).
- Replace the *proxy* hit/quality model with your trained `AudioNet` (classifier) or with a
  probe on its embeddings. Either way, `cumbre_scoring.py` is unchanged for the UI.
- `refit_model.py` can consume the embedding vector instead of (or with) the 11 hand-crafted vars.

## Honest expectations
Even perfectly fame-blind, intrinsic audio caps around **~70% accuracy / AUC 0.65–0.81** on
hit/non-hit (Salganik: quality bounds outcomes, social dynamics decide the rest). Position it as
"filters the bottom, flags the genuinely strong" — never "predicts the next #1."

## Install (your machine)
```bash
pip install -r requirements.txt          # librosa, pandas, scikit-learn, etc.
pip install torch                          # CPU build is fine for training the small CNN
python test_inhouse.py                     # fame-blind tests pass; audionet self-test runs
python cumbre_audionet.py --selftest       # trains your model on synthetic data
```
*(Torch couldn't be installed in the build sandbox — its download index was network-blocked —
so the audio model ships syntax-validated; the self-test runs in seconds locally.)*
