# Cumbre — Analysis Engine (working package)

*Get your song to the summit.*

A complete, tested, **Spotify-free** analysis pipeline: upload audio → two-part grade
(Music + Lyrics), genre-aware, with the **Top 3 Fixes**. Reuses your SMU modeling approach
(KNN, `hit = popularity ≥ 0.90`) but on features computed **in-house**.

**Status: 38/38 tests passing.** Engine recovers ground-truth tempo & key on test audio;
refit pipeline hits CV-F1 0.92 / test-F1 0.95 on a learnable benchmark.

## Files
| File | What it is |
|---|---|
| `cumbre_engine.py` | Audio features (Spotify parity + LUFS/dynamics/stereo/structure) + `validate_audio()` OOD gate + `to_model_features()` (11-var SMU schema) |
| `cumbre_lyrics.py` | Phonetics-first lyric metrics: repetition, MTLD, **rhyme density (CMUdict)**, chorus, sentiment, explicit flag; `transcribe()` (Whisper) interface |
| `cumbre_scoring.py` | Combines Music + Lyrics → genre-weighted **Summit Score**, A–F grade, merged Top-3 fixes; `analyze_song()` end-to-end |
| `refit_model.py` | Refit StandardScaler+KNN on in-house features (GridSearch + F1-threshold); `--selftest` |
| `test_cumbre.py` | 38 tests across engine/lyrics/scoring/refit. `python test_cumbre.py` |
| `requirements.txt` | Core deps (librosa, pyloudnorm, soundfile, pronouncing, scikit-learn) |

## Quick start
```bash
pip install -r requirements.txt
python test_cumbre.py                              # 38 passed, 0 failed
python cumbre_scoring.py yoursong.wav pop          # full report
python -c "import cumbre_scoring as cs, json; \
  print(json.dumps(cs.analyze_song('yoursong.wav','hiphop', lyrics_text=open('lyrics.txt').read())['report'], indent=2))"
python refit_model.py --selftest                   # prove the refit pipeline
```

## End-to-end output shape (`analyze_song`)
```jsonc
{
  "report": {
    "summit_score": 72.0, "grade": "B", "summit_phrase": "two thirds up the mountain",
    "music_score": 76.0, "lyrics_score": 68.0, "genre": "pop", "lyrics_weight": 0.35,
    "top_fixes": ["Ease the limiter ~2 dB ...", "Add internal rhymes ...", "Repeat the chorus ..."],
    "music_subscores": {...}, "lyrics_subscores": {...}
  },
  "audio_features": { ... full vector ... },
  "lyric_features": { ... },
  "model_vector": { 11-var schema for the refit KNN }
}
```

## Reusing your SMU model — refit, don't reuse weights
The original KNN + StandardScaler were fit on **Spotify** distributions; KNN is scale-sensitive,
so feeding in-house values into the old scaler is invalid. `refit_model.py`:
1. `build_