#!/usr/bin/env python3
"""Entry point for Cumbre engine tasks."""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ML = ROOT / "ml" / "fameblind"


def main() -> int:
    parser = argparse.ArgumentParser(description="Cumbre engine")
    sub = parser.add_subparsers(dest="cmd", required=True)

    enrich = sub.add_parser("enrich", help="Enrich tracks CSV with popularity")
    enrich.add_argument("features_csv", type=Path)
    enrich.add_argument("labeled_csv", type=Path)
    enrich.add_argument("-o", "--output", type=Path, default=None)

    train = sub.add_parser("train", help="Train fame-blind popularity model")
    train.add_argument("features_csv", type=Path)
    train.add_argument("labeled_csv", type=Path)
    train.add_argument("--model", default="rf")
    train.add_argument("--sample", type=int, default=None)

    args = parser.parse_args()
    script = "enrich_popularity.py" if args.cmd == "enrich" else "train_fameblind.py"
    cmd = [sys.executable, str(ML / script), str(args.features_csv), str(args.labeled_csv)]
    if args.cmd == "enrich" and args.output:
        cmd.extend(["-o", str(args.output)])
    if args.cmd == "train":
        cmd.extend(["--model", args.model])
        if args.sample:
            cmd.extend(["--sample", str(args.sample)])

    return subprocess.call(cmd, cwd=ML)


if __name__ == "__main__":
    raise SystemExit(main())
