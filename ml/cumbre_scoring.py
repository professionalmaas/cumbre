"""
Cumbre — Scoring & Grade
========================
Combines the Music score (cumbre_engine) and the Lyrics score (cumbre_lyrics)
into one genre-weighted Summit Score + letter grade, and merges the Top 3 fixes.

Positioning guardrail: this grades CRAFT vs genre norms. It is NOT a hit
prediction. Never surface a "probability of success" number to users.
"""
from __future__ import annotations
from dataclasses import asdict
import math

# lyrics weight by genre (matches cumbre_lyrics.LYRIC_GENRE)
LYRICS_WEIGHT = {"hiphop": 0.50, "pop": 0.35, "edm": 0.20}

GRADE_BANDS = [
    (93, "A+"), (90, "A"), (87, "A-"), (83, "B+"), (80, "B"), (77, "B-"),
    (73, "C+"), (70, "C"), (67, "C-"), (63, "D+"), (60, "D"), (0, "F"),
]

def grade_letter(score: float) -> str:
    for cutoff, letter in GRADE_BANDS:
        if score >= cutoff:
            return letter
    return "F"

def summit_phrase(score: float) -> str:
    if score >= 90: return "at the summit"
    if score >= 80: return "near the peak — final push"
    if score >= 70: return "two thirds up the mountain"
    if score >= 55: return "on the ascent"
    if score >= 40: return "at base camp"
    return "still mapping the route"


def percentile_vs_reference(music_score: float, reference_scores) -> float | None:
    """Optional: percentile of this song's music_score within a genre reference set."""
    if not reference_scores:
        return None
    ref = sorted(reference_scores)
    below = sum(1 for r in ref if r <= music_score)
    return round(100 * below / len(ref), 1)


def combine(music_result: dict, lyrics_result: dict | None, genre: str,
            reference_scores=None) -> dict:
    """music_result: from cumbre_engine.score(); lyrics_result: from cumbre_lyrics.lyrics_score()."""
    genre = genre if genre in LYRICS_WEIGHT else "pop"
    music = float(music_result.get("music_score", 0.0))
    fixes = list(music_result.get("top_fixes", []))

    lyrics = None
    lw = LYRICS_WEIGHT[genre]
    if lyrics_result and lyrics_result.get("lyrics_score") is not None:
        lyrics = float(lyrics_result["lyrics_score"])
        lw = float(lyrics_result.get("weight", lw))
        # interleave fixes: take top music fix, top lyric fix, then fill
        lfix = list(lyrics_result.get("fixes", []))
        merged = []
        for a, b in zip(fixes, lfix):
            merged += [a, b]
        merged += fixes[len(lfix):] + lfix[len(fixes):]
        fixes = merged
        combined = round(music * (1 - lw) + lyrics * lw, 1)
    else:
        combined = round(music, 1)   # instrumental: music only
        lw = 0.0

    report = {
        "summit_score": combined,
        "grade": grade_letter(combined),
        "summit_phrase": summit_phrase(combined),
        "music_score": round(music, 1),
        "lyrics_score": round(lyrics, 1) if lyrics is not None else None,
        "genre": genre,
        "lyrics_weight": lw,
        "top_fixes": (fixes[:3] if fixes else
                      ["Strong technical foundation — focus the next pass on arrangement and hook."]),
        "music_subscores": music_result.get("subscores", {}),
        "lyrics_subscores": (lyrics_result or {}).get("subscores", {}),
    }
    pct = percentile_vs_reference(music, reference_scores)
    if pct is not None:
        report["music_percentile"] = pct
    return report


def analyze_song(audio_path: str, genre: str = "pop", lyrics_text: str | None = None,
                 year: int | None = None, reference_scores=None, transcribe_if_missing=False) -> dict:
    """End-to-end: audio features + (optional) lyrics -> full Cumbre report."""
    import cumbre_engine as ce
    feats = ce.analyze(audio_path, genre)
    music_result = ce.score(feats, genre)

    lyrics_result = None
    lyric_features = None
    if lyrics_text is None and transcribe_if_missing:
        try:
            import cumbre_lyrics as cl
            lyrics_text = cl.transcribe(audio_path)
        except Exception as e:
            music_result.setdefault("notes", []).append(f"transcription skipped: {e}")
    if lyrics_text:
        import cumbre_lyrics as cl
        lf = cl.analyze_lyrics(lyrics_text, duration_sec=feats.duration_sec)
        lyric_features = asdict(lf)
        lyrics_result = cl.lyrics_score(lf, genre)

    report = combine(music_result, lyrics_result, genre, reference_scores)
    model_vec = ce.to_model_features(
        feats, year=year or 2026,
        explicit=(lyric_features or {}).get("explicit", 0))
    return {
        "app": "Cumbre",
        "tagline": "Get your song to the summit.",
        "genre": genre,
        "report": report,
        "audio_features": asdict(feats),
        "lyric_features": lyric_features,
        "model_vector": model_vec,   # 11-var schema for the refit KNN
    }


if __name__ == "__main__":
    import sys, json
    audio = sys.argv[1]; genre = sys.argv[2] if len(sys.argv) > 2 else "pop"
    out = analyze_song(audio, genre)
    print(json.dumps(out["report"], indent=2))
