"""
Cumbre — Rich report assembler
==============================
Composes the full analysis report that the frontend Report screen renders,
matching docs/analysis-contract.json's `response` object EXACTLY (field names,
nesting, enums — camelCase as in the contract).

Three sources are merged:
  a. Engine (in-house)  — ml/cumbre_scoring.analyze_song -> song, scores.music/
     lyrics, subscores, mix, features.
  b. Added MIR (librosa) — structure (8 sections) + highlight (best ~24s window).
  c. A&R / LLM layer (Claude Haiku 4.5) — the judgement fields the engine can't
     infer: scores.overall/band/verdict, marketFit, readiness, keep, fixes,
     comparables. Falls back to a deterministic heuristic when the key is absent
     or the call fails. Never crashes the worker.

Positioning guardrail (inherited from ml/): grade CRAFT vs genre norms; never
surface a "hit probability" in any user-facing field.

Public entrypoint:
    build_report(audio_path, genre, depth, lens, year, *, anthropic_api_key=None) -> dict
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np

ML_DIR = os.path.join(os.path.dirname(__file__), "..", "ml")

# --- enums (from the contract) ---
_BANDS = ("base camp", "ascending", "summit")
_READINESS = ("not yet", "close", "ready")
_IMPACT_AREAS = ("Music", "Lyrics", "Mix")

# Fixed Phase-1 section labels (best-effort — see contract structure.sections).
_SECTION_LABELS = ["Intro", "V1", "Pre", "Chorus1", "V2", "Chorus2", "Bridge", "Outro"]
_HIGHLIGHT_SEC = 24.0

ANTHROPIC_MODEL = "claude-haiku-4-5"

# Static per-genre comparables for the heuristic fallback.
_COMPARABLES = {
    "indie pop": {
        "artists": ["Novo Amor", "Local Natives", "Lord Huron"],
        "playlists": ["Indie Chill", "Atmospheric Mornings", "Late-Night Drives"],
        "audience": "25-34 · US · UK · AU",
    },
    "pop": {
        "artists": ["Dua Lipa", "Tove Lo", "MUNA"],
        "playlists": ["Pop Rising", "New Music Friday", "Mood Booster"],
        "audience": "18-29 · US · UK · AU",
    },
    "hiphop": {
        "artists": ["Smino", "JID", "Saba"],
        "playlists": ["Get Turnt", "Mellow Bars", "Internet People"],
        "audience": "18-29 · US · UK · CA",
    },
    "edm": {
        "artists": ["ODESZA", "Flume", "Lane 8"],
        "playlists": ["mint", "Friday Cratediggers", "Night Rider"],
        "audience": "18-29 · US · UK · DE",
    },
}


# =====================================================================
# helpers
# =====================================================================
def _band_for(overall: float) -> str:
    if overall >= 80:
        return "summit"
    if overall >= 60:
        return "ascending"
    return "base camp"


def _round(x, ndigits=0):
    try:
        v = round(float(x), ndigits)
        return int(v) if ndigits == 0 else v
    except (TypeError, ValueError):
        return 0


def _clamp(x, lo, hi):
    return max(lo, min(hi, x))


def _key_pretty(engine_key: str) -> str:
    """Engine emits 'F# minor' / 'C major' — contract wants the same shape."""
    return engine_key or ""


def _label_from_subscore_key(k: str) -> str:
    """Turn an engine subscore key into a human label, e.g. 'mix_balance' -> 'Mix balance'."""
    return k.replace("_", " ").strip().capitalize()


# =====================================================================
# (a) engine -> contract: song / scores(music,lyrics) / subscores / mix / features
# =====================================================================
def _stereo_width_pct(stereo_correlation: float) -> int:
    """Map stereo correlation (1=mono-safe ... <0 phase issues) to a 0-100 width estimate.

    corr 1.0  -> narrow/mono  -> ~0% extra width
    corr 0.0  -> wide          -> ~100%
    corr <0   -> very wide / phasey -> clamp at 100
    """
    width = (1.0 - float(stereo_correlation)) * 100.0
    return int(_clamp(round(width), 0, 100))


def _build_mix(feats: dict) -> dict:
    lufs = feats.get("lufs_integrated") or 0.0
    crest = feats.get("crest_factor_db") or 0.0
    true_peak = feats.get("true_peak_dbtp") or 0.0
    corr = feats.get("stereo_correlation")
    corr = 1.0 if corr is None else corr

    lufs = _round(lufs, 1)
    dr = _round(crest)
    width = _stereo_width_pct(corr)

    # plain-English note grounded in the actual numbers
    if lufs and lufs > -14:
        over = round(abs(lufs + 14), 1)
        note = (
            f"Your master is ~{over} dB louder than Spotify's -14 LUFS target, so it'll be "
            f"turned down on playback. Pull the limiter back for more punch and breathing room."
        )
    elif lufs and lufs < -16:
        note = (
            f"At {lufs} LUFS you're quieter than the -14 streaming target — there's headroom "
            f"to push level for more impact without clipping."
        )
    else:
        note = (
            f"Loudness sits near the -14 LUFS streaming target with DR {dr} of dynamic range — "
            f"a healthy, competitive master."
        )

    return {
        "lufs": lufs,
        "lufsTarget": -14,
        "dynamicRange": dr,
        "truePeakDb": _round(true_peak, 1),
        "stereoWidthPct": width,
        "note": note,
    }


def _build_features(feats: dict) -> dict:
    return {
        "key": _key_pretty(feats.get("key", "")),
        "tempoBpm": _round(feats.get("tempo_bpm")),
        "energy": _round(feats.get("energy"), 2),
        "danceability": _round(feats.get("danceability"), 2),
        "valence": _round(feats.get("valence"), 2),
        "loudnessDb": _round(feats.get("lufs_integrated") or feats.get("loudness_db_rms"), 1),
        "timeSignature": f"{int(feats.get('time_signature', 4))}/4",
        "durationSec": _round(feats.get("duration_sec")),
    }


def _build_song(feats: dict, genre: str) -> dict:
    return {
        "title": "Your track",
        "artistName": "you",
        "genre": genre,
        "key": _key_pretty(feats.get("key", "")),
        "tempoBpm": _round(feats.get("tempo_bpm")),
        "durationSec": _round(feats.get("duration_sec")),
        "timeSignature": f"{int(feats.get('time_signature', 4))}/4",
    }


def _subscores_from(engine_subscores: dict) -> list:
    """engine subscores: {key: 0-100 float}. -> [{label, value}] scaled/clamped 0-100."""
    out = []
    for k, v in (engine_subscores or {}).items():
        out.append({"label": _label_from_subscore_key(k), "value": int(_clamp(round(float(v)), 0, 100))})
    return out


# =====================================================================
# (b) added MIR: structure + highlight (librosa)
# =====================================================================
def _build_structure_and_highlight(audio_path: str, duration_sec: float) -> tuple[dict, dict]:
    """Split into ~8 sections by time, compute normalized RMS energy per section,
    and pick the best ~24s contiguous high-energy window."""
    import librosa

    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    dur = float(librosa.get_duration(y=y, sr=sr)) if y.size else float(duration_sec or 0.0)
    if dur <= 0:
        dur = float(duration_sec or 1.0)

    # ---- 8-section energy curve ----
    n = len(_SECTION_LABELS)
    rms = librosa.feature.rms(y=y)[0] if y.size else np.zeros(1)
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr) if y.size else np.array([0.0])

    section_energy = []
    bounds = np.linspace(0, dur, n + 1)
    for i in range(n):
        lo, hi = bounds[i], bounds[i + 1]
        mask = (times >= lo) & (times < hi)
        if np.any(mask):
            section_energy.append(float(np.mean(rms[mask])))
        else:
            section_energy.append(0.0)
    section_energy = np.array(section_energy)

    # normalize 0..1
    mx = float(section_energy.max()) if section_energy.size else 0.0
    mn = float(section_energy.min()) if section_energy.size else 0.0
    if mx > mn:
        norm = (section_energy - mn) / (mx - mn)
    else:
        norm = np.zeros_like(section_energy)

    sections = [
        {"label": _SECTION_LABELS[i], "energy": round(float(norm[i]), 2)}
        for i in range(n)
    ]
    peak_index = int(np.argmax(norm)) if norm.size else 0
    # second-highest = "lift"
    order = list(np.argsort(norm)[::-1]) if norm.size else [0]
    lift_index = int(order[1]) if len(order) > 1 else peak_index

    structure = {"sections": sections, "peakIndex": peak_index, "liftIndex": lift_index}

    # ---- best ~24s highlight window (highest mean RMS) ----
    win = min(_HIGHLIGHT_SEC, dur)
    if y.size and len(rms) > 1 and dur > win:
        hop_t = times[1] - times[0] if len(times) > 1 else (dur / max(len(rms), 1))
        win_frames = max(1, int(round(win / max(hop_t, 1e-9))))
        if win_frames < len(rms):
            # rolling mean via cumulative sum
            csum = np.cumsum(np.insert(rms, 0, 0.0))
            window_means = (csum[win_frames:] - csum[:-win_frames]) / win_frames
            best = int(np.argmax(window_means))
            start_sec = float(times[best])
        else:
            start_sec = 0.0
    else:
        start_sec = 0.0

    start_sec = _clamp(start_sec, 0.0, max(0.0, dur - win))
    end_sec = _clamp(start_sec + win, 0.0, dur)

    label = _SECTION_LABELS[peak_index] if 0 <= peak_index < n else "energy peak"
    highlight = {
        "startSec": int(round(start_sec)),
        "endSec": int(round(end_sec)),
        "label": label,
    }
    return structure, highlight


def _fallback_structure_highlight(duration_sec: float) -> tuple[dict, dict]:
    """If librosa fails entirely, return a valid neutral structure/highlight."""
    n = len(_SECTION_LABELS)
    sections = [{"label": _SECTION_LABELS[i], "energy": 0.5} for i in range(n)]
    structure = {"sections": sections, "peakIndex": 3, "liftIndex": 5}
    dur = float(duration_sec or 0.0)
    win = min(_HIGHLIGHT_SEC, dur) if dur else _HIGHLIGHT_SEC
    start = _clamp((dur / 2.0) - (win / 2.0), 0.0, max(0.0, dur - win))
    highlight = {"startSec": int(round(start)), "endSec": int(round(start + win)), "label": "Chorus1"}
    return structure, highlight


# =====================================================================
# (c) A&R / LLM layer (Claude Haiku 4.5) + heuristic fallback
# =====================================================================
def _ar_json_schema() -> dict:
    """Strict JSON schema for ONLY the A&R fields. additionalProperties:false everywhere,
    every key required."""
    fix_item = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "rank": {"type": "integer"},
            "title": {"type": "string"},
            "note": {"type": "string"},
            "impact": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "points": {"type": "integer"},
                    "area": {"type": "string", "enum": list(_IMPACT_AREAS)},
                },
                "required": ["points", "area"],
            },
        },
        "required": ["rank", "title", "note", "impact"],
    }
    keep_item = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "title": {"type": "string"},
            "note": {"type": "string"},
        },
        "required": ["title", "note"],
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "overall": {"type": "integer"},
            "band": {"type": "string", "enum": list(_BANDS)},
            "verdict": {"type": "string"},
            "marketFit": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "genre": {"type": "string"},
                    "you": {"type": "integer"},
                    "genreAvg": {"type": "integer"},
                    "chartReady": {"type": "integer"},
                    "pointsToChartReady": {"type": "integer"},
                },
                "required": ["genre", "you", "genreAvg", "chartReady", "pointsToChartReady"],
            },
            "readiness": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "playlist": {"type": "string", "enum": list(_READINESS)},
                    "radio": {"type": "string", "enum": list(_READINESS)},
                    "sync": {"type": "string", "enum": list(_READINESS)},
                },
                "required": ["playlist", "radio", "sync"],
            },
            "keep": {"type": "array", "items": keep_item, "minItems": 3, "maxItems": 3},
            "fixes": {"type": "array", "items": fix_item, "minItems": 3, "maxItems": 3},
            "comparables": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "artists": {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 3},
                    "playlists": {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 3},
                    "audience": {"type": "string"},
                },
                "required": ["artists", "playlists", "audience"],
            },
        },
        "required": [
            "overall", "band", "verdict", "marketFit", "readiness",
            "keep", "fixes", "comparables",
        ],
    }


def _ar_prompt(genre, depth, lens, music_score, lyrics_score, music_sub, lyrics_sub,
               mix, structure, highlight) -> str:
    lens_voice = {
        "listener": "Write in plain, warm fan language — how the song *feels* to a regular listener.",
        "producer": "Write as a producer/mix engineer — focus on arrangement, mix, and sonic decisions.",
        "ar": "Write as an A&R / label scout — focus on market positioning, playlist/radio/sync fit, and commercial readiness.",
    }.get(lens, "Write as an A&R / label scout.")
    detail = ("Give deep, specific notes that reference the actual metrics."
              if depth == "deep" else "Keep notes punchy and concise.")
    has_lyrics = lyrics_score is not None

    return (
        "You are Cumbre, an A&R 'climbing guide' that grades a song's CRAFT vs its genre norms. "
        "You NEVER predict hit probability or chance of success — only craft quality and readiness.\n\n"
        f"Genre: {genre}\nReview lens: {lens} — {lens_voice}\nDepth: {depth} — {detail}\n\n"
        "In-house engine results (0-100):\n"
        f"  music_score = {music_score}\n"
        f"  lyrics_score = {lyrics_score if has_lyrics else 'N/A (instrumental or no lyrics)'}\n"
        f"  music subscores = {json.dumps(music_sub)}\n"
        f"  lyrics subscores = {json.dumps(lyrics_sub)}\n\n"
        "Mix & master metrics:\n"
        f"  integrated loudness = {mix['lufs']} LUFS (target {mix['lufsTarget']})\n"
        f"  dynamic range = DR {mix['dynamicRange']}\n"
        f"  true peak = {mix['truePeakDb']} dBTP\n"
        f"  stereo width = {mix['stereoWidthPct']}%\n\n"
        "Structure (8 sections, normalized energy 0-1) and highlight:\n"
        f"  sections = {json.dumps(structure['sections'])}\n"
        f"  peakIndex = {structure['peakIndex']}, liftIndex = {structure['liftIndex']}\n"
        f"  highlight = {highlight['startSec']}s-{highlight['endSec']}s ({highlight['label']})\n\n"
        "Produce the A&R layer as JSON matching the provided schema:\n"
        "- overall (0-100): a holistic craft score blending music, lyrics, mix and arrangement.\n"
        "- band: 'base camp' (<60), 'ascending' (60-79), or 'summit' (80+) — must match overall.\n"
        "- verdict: one vivid sentence.\n"
        "- marketFit: {genre, you (=overall), genreAvg, chartReady, pointsToChartReady = chartReady - you}.\n"
        "- readiness: playlist/radio/sync each 'not yet'|'close'|'ready'.\n"
        "- keep: exactly 3 strengths to protect {title, note}.\n"
        "- fixes: exactly 3 ranked fixes {rank, title, note, impact:{points, area in Music|Lyrics|Mix}}. "
        "Ground each fix in the actual metrics above (reference the LUFS/DR/structure numbers where relevant).\n"
        "- comparables: {artists[3], playlists[3], audience}.\n"
    )


def _call_anthropic_ar(api_key, genre, depth, lens, music_score, lyrics_score,
                       music_sub, lyrics_sub, mix, structure, highlight) -> dict:
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    schema = _ar_json_schema()
    prompt = _ar_prompt(genre, depth, lens, music_score, lyrics_score, music_sub,
                        lyrics_sub, mix, structure, highlight)

    resp = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=1500,
        output_config={"format": {"type": "json_schema", "schema": schema}},
        messages=[{"role": "user", "content": prompt}],
    )
    text = next(b.text for b in resp.content if b.type == "text")
    data = json.loads(text)

    # normalize band to match overall + clamp/validate enums
    return _normalize_ar(data, genre)


def _heuristic_ar(genre, music_score, lyrics_score, mix, engine_top_fixes) -> dict:
    """Deterministic A&R block when the LLM is unavailable or fails."""
    m = float(music_score or 0.0)
    ly = float(lyrics_score) if lyrics_score is not None else None
    if ly is not None:
        overall = int(round(0.6 * m + 0.4 * ly))
    else:
        overall = int(round(m))
    overall = int(_clamp(overall, 0, 100))
    band = _band_for(overall)

    verdict = {
        "summit": "Strong bones and real altitude — you're near the peak.",
        "ascending": "Solid climb in progress — a few clean moves lift you higher.",
        "base camp": "Good raw material — focus the next pass on the fundamentals.",
    }[band]

    genre_avg = 71
    chart_ready = 82
    market_fit = {
        "genre": genre,
        "you": overall,
        "genreAvg": genre_avg,
        "chartReady": chart_ready,
        "pointsToChartReady": int(max(0, chart_ready - overall)),
    }

    # readiness from simple thresholds on scores + mix
    def thr(score, hi, mid):
        if score >= hi:
            return "ready"
        if score >= mid:
            return "close"
        return "not yet"

    lufs = mix.get("lufs") or 0.0
    mix_ok = -16 <= lufs <= -8 if lufs else True
    readiness = {
        "playlist": thr(overall, 75, 60),
        "radio": thr(overall, 82, 68),
        "sync": "ready" if (overall >= 70 and mix_ok) else thr(overall, 78, 62),
    }

    # keep: generic strengths anchored to the metrics
    keep = [
        {"title": "Clear creative identity.",
         "note": "The track has a recognizable point of view — protect what makes it yours."},
        {"title": "Production reads pro.",
         "note": f"With DR {mix.get('dynamicRange')} and a {mix.get('truePeakDb')} dBTP ceiling, "
                 f"the master is clean and competitive."},
        {"title": "Real emotional pull.",
         "note": "The performance lands honest — don't over-polish it in the next pass."},
    ]

    # fixes: prefer engine top_fixes, mapped to impact areas; pad to 3.
    fixes = []
    area_cycle = ["Music", "Lyrics", "Mix"]
    pts_cycle = [6, 5, 4]
    src = list(engine_top_fixes or [])
    for i in range(3):
        if i < len(src) and isinstance(src[i], str) and src[i].strip():
            note = src[i].strip()
            title = note.split(".")[0][:60] or f"Improvement {i + 1}"
        else:
            defaults = [
                ("Lift the peak section", "Stack a harmony or octave so the loudest section feels higher, not just louder."),
                ("Anchor the imagery", "Tie an abstract line to one concrete image so the story pulls listeners in."),
                ("Carve space in the low-mids", "Trim 200-400 Hz on rhythm parts so the vocal can breathe."),
            ]
            title, note = defaults[i]
        fixes.append({
            "rank": i + 1,
            "title": title,
            "note": note,
            "impact": {"points": pts_cycle[i], "area": area_cycle[i]},
        })

    comp = _COMPARABLES.get((genre or "").strip().lower(), _COMPARABLES["pop"])
    comparables = {
        "artists": list(comp["artists"]),
        "playlists": list(comp["playlists"]),
        "audience": comp["audience"],
    }

    return {
        "overall": overall,
        "band": band,
        "verdict": verdict,
        "marketFit": market_fit,
        "readiness": readiness,
        "keep": keep,
        "fixes": fixes,
        "comparables": comparables,
    }


def _normalize_ar(data: dict, genre: str) -> dict:
    """Defensive normalization of an LLM A&R block: clamp scores, fix band/enums,
    keep exactly 3 keep/fixes, re-derive pointsToChartReady."""
    overall = int(_clamp(_round(data.get("overall", 0)), 0, 100))
    band = data.get("band")
    if band not in _BANDS:
        band = _band_for(overall)
    # keep band consistent with overall cutoffs
    band = _band_for(overall)

    mf = data.get("marketFit") or {}
    you = int(_clamp(_round(mf.get("you", overall)), 0, 100))
    genre_avg = int(_clamp(_round(mf.get("genreAvg", 71)), 0, 100))
    chart_ready = int(_clamp(_round(mf.get("chartReady", 82)), 0, 100))
    market_fit = {
        "genre": mf.get("genre") or genre,
        "you": you,
        "genreAvg": genre_avg,
        "chartReady": chart_ready,
        "pointsToChartReady": int(max(0, chart_ready - you)),
    }

    rd = data.get("readiness") or {}
    readiness = {
        k: (rd.get(k) if rd.get(k) in _READINESS else "not yet")
        for k in ("playlist", "radio", "sync")
    }

    keep = list(data.get("keep") or [])[:3]
    while len(keep) < 3:
        keep.append({"title": "Strength", "note": "A craft strength worth protecting."})

    fixes = []
    for i, f in enumerate(list(data.get("fixes") or [])[:3]):
        impact = f.get("impact") or {}
        area = impact.get("area")
        if area not in _IMPACT_AREAS:
            area = _IMPACT_AREAS[i % 3]
        fixes.append({
            "rank": int(f.get("rank", i + 1)),
            "title": str(f.get("title", f"Fix {i + 1}")),
            "note": str(f.get("note", "")),
            "impact": {"points": int(_round(impact.get("points", 4))), "area": area},
        })
    while len(fixes) < 3:
        i = len(fixes)
        fixes.append({"rank": i + 1, "title": f"Fix {i + 1}", "note": "",
                      "impact": {"points": 4, "area": _IMPACT_AREAS[i % 3]}})

    comp = data.get("comparables") or {}
    fallback_comp = _COMPARABLES.get((genre or "").strip().lower(), _COMPARABLES["pop"])
    artists = list(comp.get("artists") or [])[:3] or list(fallback_comp["artists"])
    playlists = list(comp.get("playlists") or [])[:3] or list(fallback_comp["playlists"])
    comparables = {
        "artists": (artists + fallback_comp["artists"])[:3],
        "playlists": (playlists + fallback_comp["playlists"])[:3],
        "audience": comp.get("audience") or fallback_comp["audience"],
    }

    return {
        "overall": overall,
        "band": band,
        "verdict": str(data.get("verdict") or "A craft read of your track."),
        "marketFit": market_fit,
        "readiness": readiness,
        "keep": keep,
        "fixes": fixes,
        "comparables": comparables,
    }


# =====================================================================
# public entrypoint
# =====================================================================
def build_report(audio_path: str, genre: str, depth: str, lens: str,
                 year: int | None = None, *, anthropic_api_key: str | None = None) -> dict:
    """Assemble the full contract `response` dict from engine + MIR + A&R layers."""
    if ML_DIR not in sys.path:
        sys.path.insert(0, ML_DIR)
    import cumbre_scoring as cs  # noqa: E402

    genre = genre or "pop"
    depth = depth if depth in ("fast", "deep") else "deep"
    lens = lens if lens in ("listener", "producer", "ar") else "ar"

    # ---- (a) engine ----
    out = cs.analyze_song(audio_path, genre, year=year)
    feats = out.get("audio_features", {}) or {}
    report = out.get("report", {}) or {}

    music_score = report.get("music_score", 0.0)
    lyrics_score = report.get("lyrics_score")  # None for instrumental
    music_sub = _subscores_from(report.get("music_subscores", {}))
    lyrics_sub = _subscores_from(report.get("lyrics_subscores", {}))
    engine_top_fixes = report.get("top_fixes", [])

    song = _build_song(feats, genre)
    mix = _build_mix(feats)
    features = _build_features(feats)
    duration_sec = feats.get("duration_sec", 0.0)

    scores_music = int(_clamp(round(float(music_score)), 0, 100))
    scores_lyrics = int(_clamp(round(float(lyrics_score)), 0, 100)) if lyrics_score is not None else 0

    # ---- (b) added MIR ----
    try:
        structure, highlight = _build_structure_and_highlight(audio_path, duration_sec)
    except Exception:
        structure, highlight = _fallback_structure_highlight(duration_sec)

    # ---- (c) A&R / LLM layer (with heuristic fallback) ----
    api_key = anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY")
    ar = None
    if api_key:
        try:
            ar = _call_anthropic_ar(
                api_key, genre, depth, lens, scores_music,
                (scores_lyrics if lyrics_score is not None else None),
                music_sub, lyrics_sub, mix, structure, highlight,
            )
        except Exception:
            ar = None
    if ar is None:
        ar = _heuristic_ar(genre, scores_music,
                           (scores_lyrics if lyrics_score is not None else None),
                           mix, engine_top_fixes)

    # ---- merge into the contract `response` shape ----
    response = {
        "request": {"genre": genre, "depth": depth, "lens": lens},
        "song": song,
        "review": {"lens": lens, "depth": depth},
        "scores": {
            "overall": ar["overall"],
            "band": ar["band"],
            "music": scores_music,
            "lyrics": scores_lyrics,
            "verdict": ar["verdict"],
        },
        "marketFit": ar["marketFit"],
        "readiness": ar["readiness"],
        "structure": structure,
        "highlight": highlight,
        "keep": ar["keep"],
        "fixes": ar["fixes"],
        "subscores": {"music": music_sub, "lyrics": lyrics_sub},
        "mix": mix,
        "comparables": ar["comparables"],
        "features": features,
    }
    return response


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--genre", default="pop")
    ap.add_argument("--depth", default="deep")
    ap.add_argument("--lens", default="ar")
    ap.add_argument("--year", type=int, default=2026)
    a = ap.parse_args()
    print(json.dumps(build_report(a.audio, a.genre, a.depth, a.lens, a.year), indent=2))
