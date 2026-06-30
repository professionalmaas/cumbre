"""
Cumbre worker -- AWS-native entrypoint.
=======================================
Two execution paths share the same analysis logic:

  Fargate path (original, kept as fallback):
    Step Functions invokes via ecs:runTask.waitForTaskToken and passes parameters
    as container-override env vars: TASK_TOKEN, JOB_ID, S3_KEY, GENRE, YEAR, etc.
    main() reads those env vars, calls run(), then sends SendTaskSuccess/Failure.

  Lambda path (new, warm container):
    Step Functions invokes via lambda:invoke and passes a JSON payload dict with
    keys: jobId, userId, songId, s3Key, genre, year, depth, lens.
    handler(event, context) maps payload keys to env vars then calls run(), and
    returns the result dict directly (SFN reads $.Payload from the Lambda response).
    No TASK_TOKEN / SendTask* calls needed -- Lambda invoke is synchronous.

The analysis logic lives entirely in run(); neither entrypoint duplicates it.
"""
from __future__ import annotations
import datetime
import json
import os
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

import boto3

REGION = os.environ.get("AWS_REGION", "us-east-1")
PKL_CACHE = "/tmp/fameblind_model.pkl"
ML_DIR = os.path.join(os.path.dirname(__file__), "..", "ml")


def _log(level: str, event: str, **fields) -> None:
    """Structured single-line JSON log to stdout (picked up by awslogs / Lambda)."""
    print(json.dumps({
        "ts": datetime.datetime.utcnow().isoformat() + "Z",
        "level": level,
        "service": "cumbre-worker",
        "event": event,
        **fields,
    }, default=str))


def _env(name: str, default: str | None = None) -> str:
    v = os.environ.get(name, default)
    if v is None:
        raise RuntimeError(f"missing required env {name}")
    return v


def _download(s3, bucket: str, key: str, suffix: str) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    s3.download_file(bucket, key, path)
    return path


def _download_to(s3, bucket: str, key: str, dest: str) -> None:
    """Download an S3 object to a fixed destination path (for the pkl cache)."""
    s3.download_file(bucket, key, dest)


def _parse_model_loc() -> tuple[str, str] | None:
    """CUMBRE_MODEL_S3 may be 's3://bucket/key' or a bucket (+ CUMBRE_MODEL_KEY)."""
    loc = os.environ.get("CUMBRE_MODEL_S3", "")
    if not loc:
        return None
    if loc.startswith("s3://"):
        rest = loc[5:]
        bucket, _, key = rest.partition("/")
        return (bucket, key or "CUMBRE_fameblind_model.pkl")
    return (loc, os.environ.get("CUMBRE_MODEL_KEY", "CUMBRE_fameblind_model.pkl"))


def run() -> dict:
    """Core analysis logic; reads parameters from os.environ.
    Called by both main() (Fargate path) and handler() (Lambda path).
    The caller is responsible for populating the relevant env vars before calling.
    Required: S3_UPLOAD_BUCKET, S3_KEY.
    Optional: GENRE, YEAR, DEPTH, LENS, JOB_ID, CUMBRE_MODEL_S3.
    """
    s3 = boto3.client("s3", region_name=REGION)
    upload_bucket = _env("S3_UPLOAD_BUCKET")
    key = _env("S3_KEY")
    genre = os.environ.get("GENRE", "pop")
    year = int(os.environ.get("YEAR", "2026"))
    depth = os.environ.get("DEPTH", "deep")
    lens = os.environ.get("LENS", "ar")

    _log("info", "worker.start", jobId=os.environ.get("JOB_ID"), s3Key=key)

    audio = _download(s3, upload_bucket, key, ".audio")
    try:
        sys.path.insert(0, ML_DIR)
        sys.path.insert(0, os.path.dirname(__file__))
        import cumbre_engine as ce  # noqa: E402
        import cumbre_report as cr  # noqa: E402

        v = ce.validate_audio(audio)
        if not v.get("ok"):
            return {"ok": False, "reason": v.get("reason", "invalid"), "validate": v}

        loc = _parse_model_loc()

        import cumbre_scoring as cs  # noqa: E402

        def _build():
            return cr.build_report(audio, genre, depth, lens, year)

        def _score():
            if not loc:
                return None
            return cs.analyze_song(audio, genre, year=year)

        with ThreadPoolExecutor(max_workers=2) as pool:
            r_fut = pool.submit(_build)
            s_fut = pool.submit(_score)
            report = r_fut.result()
            score_out = s_fut.result()  # None if no model loc configured

        # Fame-blind model score (internal only — never surfaced as "hit probability").
        # Optional/secondary: its absence must never break the report.
        model_version = None
        fameblind = None
        if loc and score_out is not None:
            try:
                import pickle
                import numpy as np

                mp = PKL_CACHE
                if not os.path.exists(mp):
                    _download_to(s3, loc[0], loc[1], mp)

                art = pickle.load(open(mp, "rb"))
                feats = art.get("features") or art.get("required_vars") or []
                mv = score_out.get("model_vector", {})
                x = np.array([[float(mv.get(f, 0.0)) for f in feats]])
                proba = float(art["best_model"].predict_proba(x)[0, 1])
                thr = art.get("best_f1_threshold", 0.5)
                model_version = str(art.get("trained_at", "")) or None
                fameblind = {"score": round(proba, 4), "threshold": float(thr),
                             "above_threshold": bool(proba >= thr)}
                # Do NOT os.remove(mp) — it is the persistent cache.
            except Exception as e:  # noqa: BLE001
                fameblind = {"error": str(e)[:200]}  # internal-only; report still returns

        # Confidence drives the Step Functions ConfidenceChoice ($.worker.confidence).
        overall = report.get("scores", {}).get("overall", 0)
        _log("info", "worker.success", jobId=os.environ.get("JOB_ID"), overall=overall)
        return {
            "ok": True,
            "report": report,             # the contract `response` dict (Deliver lambda reads this)
            "fameblind": fameblind,       # internal only
            "confidence": overall / 100.0,
            "model_version": model_version,
        }
    finally:
        try:
            os.remove(audio)
        except OSError:
            pass


def main() -> int:
    sfn = boto3.client("stepfunctions", region_name=REGION)
    token = os.environ.get("TASK_TOKEN")
    try:
        result = run()
        if token:
            sfn.send_task_success(taskToken=token, output=json.dumps(result, default=str))
        else:
            print(json.dumps(result, default=str, indent=2))
        return 0
    except Exception as e:  # noqa: BLE001
        _log("error", "worker.error", jobId=os.environ.get("JOB_ID"), message=str(e)[:500])
        if token:
            sfn.send_task_failure(taskToken=token, error="WorkerError", cause=str(e)[:32000])
        print(f"worker failed: {e}", file=sys.stderr)
        return 1


def handler(event: dict, context) -> dict:
    """Lambda entrypoint for the warm-container worker path.

    Step Functions (lambda:invoke) passes the execution input as the Lambda
    payload.  Expected keys (all strings unless noted):
        jobId, userId, songId, s3Key, genre, year (int or str), depth, lens.

    S3_UPLOAD_BUCKET and CUMBRE_MODEL_S3 come from the Lambda environment
    (set in Terraform); all per-job fields come from the event payload so the
    Lambda container stays warm across jobs without re-parsing env vars.

    Returns the result dict directly.  Step Functions reads $.Payload from the
    Lambda response and maps it to $.worker via ResultSelector.  Raises on any
    unhandled error so Step Functions retries and eventually routes to ReviewOod
    via the Catch block -- identical behaviour to the Fargate task-token path.
    """
    # Map per-job payload keys into the env vars that run() reads.
    # Do NOT permanently mutate the process env for keys that vary per job so
    # that a warm container serving a second invocation sees fresh values.
    # We use a try/finally to restore previous values (or delete if absent).
    overrides = {
        "S3_KEY":   str(event.get("s3Key", "")),
        "GENRE":    str(event.get("genre", "pop")),
        "YEAR":     str(event.get("year", "2026")),
        "DEPTH":    str(event.get("depth", "deep")),
        "LENS":     str(event.get("lens", "ar")),
        "JOB_ID":   str(event.get("jobId", "")),
        "USER_ID":  str(event.get("userId", "")),
        "SONG_ID":  str(event.get("songId", "")),
    }
    previous = {k: os.environ.get(k) for k in overrides}
    try:
        os.environ.update(overrides)
        result = run()
    except Exception as e:  # noqa: BLE001
        _log("error", "worker.error", jobId=event.get("jobId"), message=str(e)[:500])
        raise  # Let Step Functions Retry/Catch handle it
    finally:
        # Restore original values so the next warm invocation is not polluted.
        for k, prev in previous.items():
            if prev is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = prev

    return result


if __name__ == "__main__":
    sys.exit(main())
