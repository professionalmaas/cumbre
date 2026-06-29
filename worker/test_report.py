"""
Tiny self-test for cumbre_report.build_report — heuristic (no-LLM) path.

Runs build_report on an ml/t_*.wav test file with ANTHROPIC_API_KEY unset
(forcing the deterministic heuristic A&R block) and asserts the returned dict
has every top-level contract key and valid enums.

    python worker/test_report.py
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)

# Force the heuristic path — no LLM call.
os.environ.pop("ANTHROPIC_API_KEY", None)

import cumbre_report as cr  # noqa: E402

TOP_LEVEL_KEYS = [
    "song", "review", "scores", "marketFit", "readiness", "structure",
    "highlight", "keep", "fixes", "subscores", "mix", "comparables", "features",
]
BANDS = {"base camp", "ascending", "summit"}
READINESS = {"not yet", "close", "ready"}
IMPACT_AREAS = {"Music", "Lyrics", "Mix"}


def _find_audio() -> str:
    for name in ("t_clean.wav", "t_short.wav"):
        p = os.path.join(HERE, "..", "ml", name)
        if os.path.exists(p):
            return os.path.abspath(p)
    raise SystemExit("no ml/t_*.wav test file found")


def main() -> int:
    audio = _find_audio()
    print(f"building report for {audio} (heuristic path) ...")
    r = cr.build_report(audio, genre="indie pop", depth="deep", lens="ar", year=2026)

    # every top-level contract key present
    for k in TOP_LEVEL_KEYS:
        assert k in r, f"missing top-level key: {k}"

    # request echo
    assert r["request"]["genre"] == "indie pop"
    assert r["request"]["depth"] == "deep"
    assert r["request"]["lens"] == "ar"

    # scores + band enum
    s = r["scores"]
    assert 0 <= s["overall"] <= 100, s["overall"]
    assert 0 <= s["music"] <= 100
    assert s["band"] in BANDS, s["band"]
    assert isinstance(s["verdict"], str) and s["verdict"]

    # readiness enums
    for k in ("playlist", "radio", "sync"):
        assert r["readiness"][k] in READINESS, r["readiness"][k]

    # structure: 8 sections, valid indices, energies in [0,1]
    secs = r["structure"]["sections"]
    assert len(secs) == 8, len(secs)
    for sec in secs:
        assert 0.0 <= sec["energy"] <= 1.0, sec
    assert 0 <= r["structure"]["peakIndex"] < 8
    assert 0 <= r["structure"]["liftIndex"] < 8

    # highlight window
    h = r["highlight"]
    assert h["startSec"] <= h["endSec"], h
    assert isinstance(h["label"], str)

    # keep / fixes counts + impact area enum
    assert len(r["keep"]) == 3, len(r["keep"])
    assert len(r["fixes"]) == 3, len(r["fixes"])
    for f in r["fixes"]:
        assert f["impact"]["area"] in IMPACT_AREAS, f["impact"]["area"]
        assert isinstance(f["impact"]["points"], int)

    # marketFit shape
    mf = r["marketFit"]
    for k in ("genre", "you", "genreAvg", "chartReady", "pointsToChartReady"):
        assert k in mf, k

    # mix
    mix = r["mix"]
    assert mix["lufsTarget"] == -14
    for k in ("lufs", "dynamicRange", "truePeakDb", "stereoWidthPct", "note"):
        assert k in mix, k
    assert 0 <= mix["stereoWidthPct"] <= 100

    # comparables
    comp = r["comparables"]
    assert len(comp["artists"]) == 3
    assert len(comp["playlists"]) == 3
    assert isinstance(comp["audience"], str)

    # features
    feat = r["features"]
    for k in ("key", "tempoBpm", "energy", "danceability", "valence",
              "loudnessDb", "timeSignature", "durationSec"):
        assert k in feat, k

    print("OK — all top-level keys present, enums valid, structure has 8 sections.")
    print(f"  overall={s['overall']} band={s['band']} music={s['music']} lyrics={s['lyrics']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
