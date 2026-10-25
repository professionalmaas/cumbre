"""
Cumbre — Modal worker
=====================
The ML step of the automated loop. Inngest calls `extract_and_score` with a
presigned URL to the uploaded audio; this runs the in-house engine + the
fame-blind model and returns the report. Scale-to-zero; CPU is fine for Phase 1.

It wraps the existing, tested ml/ modules (cumbre_engine, cumbre_lyrics,
cumbre_scoring) — no rewrite. The trained model is downloaded from object
storage (CUMBRE_MODEL_URL), not committed to git.

Deploy:  modal deploy worker/modal_app.py
Local test: modal run worker/modal_app.py::extract_and_score --url <signed-url> --genre pop
"""
from __future__ import annotations
import os, sys, json, tempfile, urllib.request
import modal

# bundle the ml/ folder into the image so the engine modules are importable
ML_DIR = os.path.join(os.path.dirname(__file__), "..", "ml")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("librosa", "soundfile", "pyloudnorm", "numpy", "scipy",
                 "scikit-learn", "pandas", "pronouncing", "openai",
                 "fastapi[standard]")  # fastapi for the HTTP endpoint the loop calls
    .add_local_dir(ML_DIR, remote_path="/root/ml")  # ships cumbre_engine.py etc.
)
app = modal.App("cumbre-worker", image=image)

MODEL_URL = os.environ.get("CUMBRE_MODEL_URL", "")


def _download(url: str, suffix: str) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    urllib.request.urlretrieve(url, path)
    return path


@app.function(timeout=600, secrets=[modal.Secret.from_name("cumbre")])
def extract_and_score(url: str, genre: str = "pop", year: int = 2026,
                      lyrics_text: str | None = None) -> dict:
    """url: presigned GET to the uploaded audio. Returns the full Cumbre report."""
    sys.path.insert(0, "/root/ml")
    import cumbre_engine as ce
    import cumbre_scoring as cs

    audio = _download(url, ".audio")
    try:
        # Step 1 guard (also enforced in the loop): reject non-music/corrupt
        v = ce.validate_audio(audio)
        if not v.get("ok"):
            return {"ok": False, "reason": v.get("reason", "invalid"), "validate": v}

        # full in-house report (music + optional lyrics + top fixes)
        out = cs.analyze_song(audio, genre, lyrics_text=lyrics_text, year=year)

        # fame-blind model score (loaded from object storage)
        hit = None
        if MODEL_URL:
            import pickle, numpy as np
            mp = _download(MODEL_URL, ".pkl")
            art = pickle.load(open(mp, "rb"))
            # refit_model.py saves the feature list under "required_vars"; older
            # artifacts used "features". Accept either so the worker stays compatible.
            feats = art.get("features") or art.get("required_vars") or []
            # engine model_vector covers the parity features; engineered ones default to 0 if absent
            mv = out.get("model_vector", {})
            x = np.array([[float(mv.get(f, 0.0)) for f in feats]])
            proba = float(art["best_model"].predict_proba(x)[0, 1])
            hit = {"score": round(proba, 4), "threshold": art.get("best_f1_threshold", 0.5),
                   "above_threshold": proba >= art.get("best_f1_threshold", 0.5),
                   "model_version": art.get("trained_at")}
        report = out["report"]
        return {
            "ok": True,
            "report": report,
            "features": out["audio_features"],
            "fameblind": hit,                       # internal only — DO NOT show as "hit probability"
            "confidence": report.get("summit_score", 0) / 100.0,
            "model_version": (hit or {}).get("model_version"),
        }
    finally:
        try: os.remove(audio)
        except OSError: pass


@app.function(secrets=[modal.Secret.from_name("cumbre")])
@modal.fastapi_endpoint(method="POST")
async def web(request):
    """HTTP entrypoint the Inngest loop calls (callModal in web/lib/inngest/helpers.ts).

    Auth: requires `Authorization: Bearer $CUMBRE_WORKER_TOKEN` (token lives in the
    'cumbre' Modal secret). Body: {"url": <presigned GET>, "genre": "pop", "year": 2026}.
    """
    from fastapi.responses import JSONResponse

    expected = os.environ.get("CUMBRE_WORKER_TOKEN", "")
    if expected and request.headers.get("authorization", "") != f"Bearer {expected}":
        return JSONResponse({"ok": False, "reason": "unauthorized"}, status_code=401)

    body = await request.json()
    url = body.get("url")
    if not url:
        return JSONResponse({"ok": False, "reason": "missing url"}, status_code=400)
    genre = body.get("genre", "pop")
    year = int(body.get("year", 2026))
    # Dispatch the heavy CPU work to the container function (its own 600s timeout).
    return extract_and_score.remote(url, genre, year)


@app.local_entrypoint()
def main(url: str, genre: str = "pop"):
    print(json.dumps(extract_and_score.remote(url, genre), indent=2))
