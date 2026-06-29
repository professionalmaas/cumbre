"""
Cumbre worker — AWS-native entrypoint (Fargate task launched by Step Functions).
=================================================================================
Step Functions runs this container with `ecs:runTask.waitForTaskToken` and passes,
via container-override env vars:
    TASK_TOKEN, JOB_ID, S3_KEY, GENRE, YEAR
The task role provides S3 read (uploads + artifacts) and states:SendTaskSuccess/Failure.

Flow: download audio from S3 -> ml/cumbre_scoring.analyze_song (+ optional fame-blind
model from the artifacts bucket) -> SendTaskSuccess with the report. On any error,
SendTaskFailure so the state machine routes the job to human review (ReviewOod).

The uploaded audio is downloaded to /tmp and removed; the worker never persists it.
This mirrors worker/modal_app.py::extract_and_score (kept for the non-AWS path).
"""
from __future__ import annotations
import datetime
import json
import os
import sys
import tempfile

import boto3

REGION = os.environ.get("AWS_REGION", "us-east-1")
ML_DIR = os.path.join(os.path.dirname(__file__), "..", "ml")


def _log(level: str, event: str, **fields) -> None:
    """Structured single-line JSON log to stdout (picked up by the awslogs driver)."""
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

        # Full RICH report matching docs/analysis-contract.json (engine + MIR + A&R).
        report = cr.build_report(audio, genre, depth, lens, year)

        # Fame-blind model score (internal only — never surfaced as "hit probability").
        # Optional/secondary: its absence must never break the report.
        model_version = None
        fameblind = None
        loc = _parse_model_loc()
        if loc:
            try:
                import pickle
                import numpy as np

                import cumbre_scoring as cs  # noqa: E402

                out = cs.analyze_song(audio, genre, year=year)
                mp = _download(s3, loc[0], loc[1], ".pkl")
                art = pickle.load(open(mp, "rb"))
                feats = art.get("features") or art.get("required_vars") or []
                mv = out.get("model_vector", {})
                x = np.array([[float(mv.get(f, 0.0)) for f in feats]])
                proba = float(art["best_model"].predict_proba(x)[0, 1])
                thr = art.get("best_f1_threshold", 0.5)
                model_version = art.get("trained_at")
                fameblind = {"score": round(proba, 4), "threshold": thr,
                             "above_threshold": proba >= thr}
                os.remove(mp)
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


if __name__ == "__main__":
    sys.exit(main())
