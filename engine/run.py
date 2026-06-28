#!/usr/bin/env python3
"""Entry point for Cumbre engine tasks."""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ML = ROOT / "ml"


def main() -> int:
    parser = argparse.ArgumentParser(description="Cumbre engine")
    sub = parser.add_subparsers(dest="cmd", required=True)

    enrich = sub.add_parser("enrich", help="Enrich tracks CSV with popularity")
    enrich.add_argument("features_csv", type=Path)
    enrich.add_argument("labeled_csv", type=Path)
    enrich.add_argument("-o", "--output", type=Path, default=None)
    enrich.add_argument("--model", choices=["hgb", "rf"], default="hgb")

    train = sub.add_parser("train", help="Train fame-blind hit classifier (full Cumbre pipeline)")
    train.add_argument("csvs", nargs="*", type=Path)
    train.add_argument("--hf", default=None)
    train.add_argument("--model", default="rf", choices=["rf", "knn", "logreg"])
    train.add_argument("--out", default="CUMBRE_fameblind_model.pkl")

    args = parser.parse_args()
    if args.cmd == "enrich":
        cmd = [sys.executable, str(ML / "enrich_popularity.py"), str(args.features_csv), str(args.labeled_csv)]
        if args.output:
            cmd.extend(["-o", str(args.output)])
        cmd.extend(["--model", args.model])
    else:
        cmd = [sys.executable, str(ML / "train_fameblind.py"), *[str(p) for p in args.csvs]]
        if args.hf:
            cmd.extend(["--hf", args.hf])
        cmd.extend(["--model", args.model, "--out", args.out])

    return subprocess.call(cmd, cwd=ML)


if __name__ == "__main__":
    raise SystemExit(main())
