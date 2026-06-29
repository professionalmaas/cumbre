"""
Cumbre — Batch validation harness
=================================
Point this at a manifest CSV + a folder of audio files YOU legally have, and it
runs the full Cumbre pipeline on each track and prints a per-genre comparison
table — exactly how you check "is my process working" on real reference songs.

It NEVER downloads anything. You supply the audio (files you own/are licensed to
analyze), matching the `filename` column. This is the same upload-only model the
product uses.

Usage:
    python cumbre_batch.py --manifest tracks_manifest.csv --audio-dir ./audio
    python cumbre_batch.py --manifest tracks_manifest.csv --audio-dir ./audio \
        --lyrics-dir ./lyrics --model CUMBRE_best_model_and_metadata.pkl --out results.csv

Manifest columns: title,artist,genre,year,expected_label,filename
Audio match: <audio-dir>/<filename>.{wav,mp3,m4a,flac,ogg}
Lyrics (optional): <lyrics-dir>/<filename>.txt
"""
from __future__ import annotations
import argparse, csv, os, glob, json, statistics, pickle

AUDIO_EXTS = (".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aiff")

def find_audio(audio_dir, stem):
    for ext in AUDIO_EXTS:
        p = os.path.join(audio_dir, stem + ext)
        if os.path.exists(p):
            return p
    # loose match (case-insensitive contains)
    for p in glob.glob(os.path.join(audio_dir, "*")):
        if p.lower().endswith(AUDIO_EXTS) and stem.lower() in os.path.basename(p).lower():
            return p
    return None

def load_lyrics(lyrics_dir, stem):
    if not lyrics_dir:
        return None
    p = os.path.join(lyrics_dir, stem + ".txt")
    return open(p, encoding="utf-8").read() if os.path.exists(p) else None


def run(manifest, audio_dir, lyrics_dir=None, model_path=None, out="results.csv"):
    import cumbre_engine as ce
    import cumbre_scoring as cs

    model = pickle.load(open(model_path, "rb")) if model_path and os.path.exists(model_path) else None
    if model_path and not model:
        print(f"(model {model_path} not found — skipping hit prediction)")

    rows = list(csv.DictReader(open(manifest, encoding="utf-8")))
    results, missing = [], []

    for r in rows:
        stem = r.get("filename") or r["title"].lower().replace(" ", "_")
        genre = (r.get("genre") or "pop").strip().lower()
        audio = find_audio(audio_dir, stem)
        if not audio:
            missing.append(stem); continue

        v = ce.validate_audio(audio)
        if not v["ok"]:
            results.append({**r, "status": f"REJECTED:{v['reason']}"}); continue

        lyrics = load_lyrics(lyrics_dir, stem)
        out_obj = cs.analyze_song(audio, genre, lyrics_text=lyrics,
                                  year=int(r.get("year") or 2026))
        rep = out_obj["report"]
        row = {
            "title": r["title"], "artist": r.get("artist", ""), "genre": genre,
            "summit": rep["summit_score"], "grade": rep["grade"],
            "music": rep["music_score"], "lyrics": rep["lyrics_score"],
            "tempo": out_obj["audio_features"]["tempo_bpm"],
            "key": out_obj["audio_features"]["key"],
            "lufs": out_obj["audio_features"]["lufs_integrated"],
            "crest": out_obj["audio_features"]["crest_factor_db"],
            "status": "OK",
        }
        if model:
            import refit_model as rm
            pred = rm.predict(model, out_obj["model_vector"])
            row["pred_hit"] = pred["hit"]; row["hit_score"] = pred["score"]
            row["expected"] = r.get("expected_label", "")
        results.append(row)

    # write CSV
    if results:
        keys = sorted({k for row in results for k in row})
        with open(out, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=keys); w.writeheader(); w.writerows(results)

    _print_table(results, missing, bool(model))
    return results


def _print_table(results, missing, has_model):
    ok = [r for r in results if r.get("status") == "OK"]
    print("\n" + "=" * 78)
    print("CUMBRE BATCH REPORT")
    print("=" * 78)
    hdr = f"{'Title':<26}{'Genre':<8}{'Summit':>7}{'Gr':>4}{'Music':>7}{'Lyr':>6}{'Tempo':>7}{'Key':>9}"
    if has_model: hdr += f"{'Hit?':>6}"
    print(hdr); print("-" * len(hdr))
    for g in ("hiphop", "pop", "edm"):
        gr = [r for r in ok if r["genre"] == g]
        for r in gr:
            line = (f"{r['title'][:25]:<26}{g:<8}{r['summit']:>7}{r['grade']:>4}"
                    f"{r['music']:>7}{str(r['lyrics']):>6}{r['tempo']:>7}{r['key']:>9}")
            if has_model: line += f"{('YES' if r.get('pred_hit') else 'no'):>6}"
            print(line)
        if gr:
            avg = round(statistics.mean(x["summit"] for x in gr), 1)
            print(f"  {'-> '+g+' avg summit':<40}{avg:>5}")
    if missing:
        print("\nMISSING AUDIO (drop these into the audio folder to score them):")
        for m in missing: print(f"  - {m}.{{wav,mp3,m4a,flac}}")
    print(f"\nScored {len(ok)} / {len(results)+len(missing)} tracks. CSV written.")
    print("Note: Cumbre grades CRAFT vs genre norms — not a prediction of commercial success.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--audio-dir", required=True)
    ap.add_argument("--lyrics-dir")
    ap.add_argument("--model")
    ap.add_argument("--out", default="results.csv")
    a = ap.parse_args()
    run(a.manifest, a.audio_dir, a.lyrics_dir, a.model, a.out)
