#!/usr/bin/env python3
"""Local smoke test — run the FULL Cumbre report on a local audio file, no AWS.

  python worker/run_local.py <audio.wav> [genre] [depth] [lens]

Reads ANTHROPIC_API_KEY from the environment for the Claude Haiku A&R layer; if it's
absent the report still generates via the deterministic heuristic fallback. This calls
the same `cumbre_report.build_report` the Fargate worker uses — so it proves the real
engine + librosa structure/highlight + A&R copy without any AWS, Step Functions, or S3.

Prereqs:  pip install -r worker/requirements.txt   (librosa, anthropic, etc.)
"""
import json
import os
import sys

# Persist librosa/numba's JIT cache to disk so the 2nd+ local analyses are much faster
# (the very first run pays the one-time numba compile cost — minutes; later runs reuse this).
os.environ.setdefault("NUMBA_CACHE_DIR", os.path.join(os.path.dirname(__file__), ".numba_cache"))

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ml"))
sys.path.insert(0, os.path.dirname(__file__))

import cumbre_report as cr  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        print("error: pass an audio file, e.g.  python worker/run_local.py ml/t_clean.wav pop deep ar", file=sys.stderr)
        return 2
    audio = sys.argv[1]
    genre = sys.argv[2] if len(sys.argv) > 2 else "pop"
    depth = sys.argv[3] if len(sys.argv) > 3 else "deep"
    lens = sys.argv[4] if len(sys.argv) > 4 else "ar"

    if not os.path.isfile(audio):
        print(f"error: no such file: {audio}", file=sys.stderr)
        return 2

    have_key = bool(os.environ.get("ANTHROPIC_API_KEY"))
    print(f"# building report for {audio}  (genre={genre} depth={depth} lens={lens}; "
          f"A&R = {'Claude Haiku' if have_key else 'heuristic fallback — set ANTHROPIC_API_KEY for the real copy'})",
          file=sys.stderr)

    report = cr.build_report(audio, genre, depth, lens, 2026)
    print(json.dumps(report, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
