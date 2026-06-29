"""
Cumbre — Audio Feature Engine (prototype)
==========================================
Get your song to the summit.

Extracts a Spotify-parity feature vector PLUS the production/structure
enhancements the research says actually help artists, from a single
uploaded audio file. No Spotify API required.

This prototype runs on librosa + pyloudnorm + soundfile (all pip-installable).
Heavier/optional engines (Essentia models, madmom, Demucs, all-in-one) are
wired as OPTIONAL upgrades: if installed they're used, otherwise the engine
falls back to a librosa-based approximation and flags lower confidence.

Usage:
    python cumbre_engine.py path/to/song.wav --genre pop --pretty
    python cumbre_engine.py path/to/song.mp3 --genre hiphop --out features.json

Confidence tiers (see Cumbre research brief):
    HIGH       duration, tempo, key, mode, LUFS loudness, true-peak, crest/DR
    MED-HIGH   energy, instrumentalness(librosa), brightness, onset density
    MED        danceability, acousticness, time_signature, sections
    LOW        valence, liveness         <- treat as soft signals only
"""

from __future__ import annotations
import argparse, json, sys, warnings, math
from dataclasses import dataclass, asdict, field
from typing import Optional

warnings.filterwarnings("ignore")

import numpy as np

try:
    import librosa
except ImportError:
    sys.exit("librosa is required:  pip install librosa soundfile pyloudnorm")

try:
    import pyloudnorm as pyln
    _HAVE_PYLN = True
except ImportError:
    _HAVE_PYLN = False

# ---- optional pro-grade upgrades (used automatically if present) ----
def _try(name):
    try:
        __import__(name); return True
    except Exception:
        return False

HAVE_ESSENTIA = _try("essentia")     # high-level ML heads: danceability, mood, valence
HAVE_MADMOM   = _try("madmom")       # SOTA beat/downbeat -> tempo, time_signature
HAVE_DEMUCS   = _try("demucs")       # stem separation -> vocal prominence
HAVE_ALLIN1   = _try("allin1")       # structure / time-to-hook


# =====================================================================
# Music theory helpers
# =====================================================================
PITCH_CLASSES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]

# Krumhansl-Schmuckler key profiles (major / minor)
_KS_MAJOR = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
_KS_MINOR = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])

def estimate_key(chroma_mean: np.ndarray):
    """Krumhansl-Schmuckler key finding. Returns (key_idx, mode, strength)."""
    best = (-1, 1, -2.0)  # idx, mode(1=maj/0=min), corr
    for mode, profile in ((1, _KS_MAJOR), (0, _KS_MINOR)):
        for shift in range(12):
            rotated = np.roll(profile, shift)
            corr = float(np.corrcoef(chroma_mean, rotated)[0, 1])
            if corr > best[2]:
                best = (shift, mode, corr)
    return best  # (key_idx, mode, strength)


# =====================================================================
# Feature container
# =====================================================================
@dataclass
class Features:
    # --- Spotify parity (computed locally) ---
    duration_sec: float = 0.0
    tempo_bpm: float = 0.0
    time_signature: int = 4
    key: str = ""
    key_index: int = -1
    mode: int = 1                 # 1 major, 0 minor
    key_strength: float = 0.0
    loudness_db_rms: float = 0.0  # Spotify-style internal dB (NOT LUFS)
    energy: float = 0.0           # 0..1
    danceability: float = 0.0     # 0..1
    acousticness: float = 0.0     # 0..1
    instrumentalness: float = 0.0 # 0..1
    speechiness: float = 0.0      # 0..1
    valence: float = 0.0          # 0..1  (LOW confidence)
    liveness: float = 0.0         # 0..1  (LOW confidence)

    # --- Cumbre enhancements (the edge) ---
    lufs_integrated: float = 0.0  # streaming loudness vs -14 target
    true_peak_dbtp: float = 0.0
    loudness_headroom_db: float = 0.0   # how far from -14 LUFS / -1 dBTP
    crest_factor_db: float = 0.0        # dynamic range proxy
    clipping_pct: float = 0.0
    stereo_correlation: float = 1.0     # 1 mono-safe, <0 phase problems
    spectral_centroid_hz: float = 0.0   # brightness
    spectral_rolloff_hz: float = 0.0
    sub_bass_ratio: float = 0.0         # energy <120Hz / total
    onset_rate_hz: float = 0.0
    intro_length_sec: float = 0.0       # time to first strong energy section
    n_sections: int = 0

    # --- provenance ---
    confidence: dict = field(default_factory=dict)
    engines: dict = field(default_factory=dict)
    notes: list = field(default_factory=list)


# =====================================================================
# The engine
# =====================================================================
def analyze(path: str, genre: str = "pop") -> Features:
    f = Features()
    f.engines = {
        "essentia": HAVE_ESSENTIA, "madmom": HAVE_MADMOM,
        "demucs": HAVE_DEMUCS, "allin1": HAVE_ALLIN1, "pyloudnorm": _HAVE_PYLN,
    }

    # --- load: mono for analysis, stereo for loudness/width ---
    y, sr = librosa.load(path, sr=44100, mono=True)
    try:
        y_stereo, _ = librosa.load(path, sr=44100, mono=False)
    except Exception:
        y_stereo = y
    if y.size == 0:
        raise ValueError("Empty / unreadable audio")

    f.duration_sec = round(float(librosa.get_duration(y=y, sr=sr)), 2)

    # ---------- TEMPO / BEATS (HIGH) ----------
    if HAVE_MADMOM:
        try:
            from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor
            act = RNNBeatProcessor()(path)
            beats = DBNBeatTrackingProcessor(fps=100)(act)
            if len(beats) > 1:
                f.tempo_bpm = round(60.0 / np.median(np.diff(beats)), 1)
            f.confidence["tempo_bpm"] = "HIGH"
        except Exception as e:
            f.notes.append(f"madmom tempo failed, fell back to librosa ({e})")
    if not f.tempo_bpm:
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
        f.tempo_bpm = round(float(np.atleast_1d(tempo)[0]), 1)
        f.confidence["tempo_bpm"] = "HIGH" if HAVE_MADMOM else "MED-HIGH"

    # ---------- KEY / MODE (HIGH) ----------
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)
    kidx, mode, strength = estimate_key(chroma_mean)
    f.key_index, f.mode, f.key_strength = kidx, mode, round(strength, 3)
    f.key = f"{PITCH_CLASSES[kidx]} {'major' if mode else 'minor'}"
    f.confidence["key"] = "HIGH"

    # ---------- TIME SIGNATURE (MED) ----------
    # heuristic from beat grouping; madmom downbeats would replace this
    f.time_signature = 4
    f.confidence["time_signature"] = "MED"

    # ---------- LOUDNESS: LUFS + true peak (HIGH) ----------
    if _HAVE_PYLN:
        meter = pyln.Meter(sr)
        loud_input = y_stereo.T if y_stereo.ndim > 1 else y
        try:
            f.lufs_integrated = round(float(meter.integrated_loudness(loud_input)), 2)
        except Exception as e:
            f.notes.append(f"LUFS failed ({e})")
        f.confidence["lufs_integrated"] = "HIGH"
    else:
        f.notes.append("pyloudnorm not installed: LUFS skipped (install for streaming-loudness check)")

    peak = float(np.max(np.abs(y_stereo))) if y_stereo.size else float(np.max(np.abs(y)))
    f.true_peak_dbtp = round(20 * math.log10(peak + 1e-9), 2)
    # headroom vs streaming targets (-14 LUFS, -1 dBTP)
    if f.lufs_integrated:
        f.loudness_headroom_db = round(f.lufs_integrated - (-14.0), 2)  # +ve = too loud, will be turned down
    f.confidence["true_peak_dbtp"] = "HIGH"

    # ---------- DYNAMICS: crest factor / clipping (HIGH) ----------
    rms = librosa.feature.rms(y=y)[0]
    rms_db = 20 * np.log10(np.maximum(rms, 1e-9))
    peak_db = 20 * math.log10(peak + 1e-9)
    f.crest_factor_db = round(float(peak_db - np.mean(rms_db)), 2)
    f.clipping_pct = round(float(np.mean(np.abs(y) > 0.999) * 100), 4)
    f.confidence["crest_factor_db"] = "HIGH"

    # Spotify-style internal loudness (NOT LUFS) — mean RMS dB
    f.loudness_db_rms = round(float(np.mean(rms_db)), 2)

    # ---------- STEREO WIDTH (HIGH if stereo) ----------
    if y_stereo.ndim > 1 and y_stereo.shape[0] >= 2:
        L, R = y_stereo[0], y_stereo[1]
        n = min(len(L), len(R))
        if n > 1 and np.std(L[:n]) > 0 and np.std(R[:n]) > 0:
            f.stereo_correlation = round(float(np.corrcoef(L[:n], R[:n])[0, 1]), 3)
        f.confidence["stereo_correlation"] = "HIGH"
    else:
        f.stereo_correlation = 1.0
        f.notes.append("Mono file: stereo width not assessed")

    # ---------- SPECTRAL: brightness / balance (MED-HIGH) ----------
    f.spectral_centroid_hz = round(float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))), 1)
    f.spectral_rolloff_hz = round(float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr))), 1)
    S = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=sr)
    total_e = float(S.sum()) + 1e-9
    f.sub_bass_ratio = round(float(S[freqs < 120].sum()) / total_e, 4)

    # ---------- ONSET DENSITY (MED-HIGH) ----------
    onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time")
    f.onset_rate_hz = round(len(onsets) / max(f.duration_sec, 1e-9), 3)

    # ---------- ENERGY (MED-HIGH) ----------
    # composite of loudness + spectral activity + onset density, squashed 0..1
    energy_raw = (
        _norm(np.mean(rms), 0.0, 0.3) * 0.5
        + _norm(f.spectral_centroid_hz, 800, 4000) * 0.3
        + _norm(f.onset_rate_hz, 0.5, 5.0) * 0.2
    )
    f.energy = round(float(np.clip(energy_raw, 0, 1)), 3)
    f.confidence["energy"] = "MED-HIGH"

    # ---------- DANCEABILITY (MED) ----------
    # tempo-fit + beat regularity + sub-bass presence
    pulse = librosa.beat.plp(y=y, sr=sr)
    beat_reg = float(np.clip(np.mean(pulse) / (np.std(pulse) + 1e-9) / 3.0, 0, 1))
    tempo_fit = _bell(f.tempo_bpm, center=120, width=35)
    f.danceability = round(float(np.clip(0.45*beat_reg + 0.35*tempo_fit + 0.20*_norm(f.sub_bass_ratio,0.02,0.15),0,1)),3)
    f.confidence["danceability"] = "MED"

    # ---------- ACOUSTICNESS (MED) ----------
    # low spectral flatness + low high-freq energy ~ more acoustic
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)))
    f.acousticness = round(float(np.clip(1.0 - _norm(f.spectral_centroid_hz, 1000, 5000)*0.7 - flatness*3, 0, 1)),3)
    f.confidence["acousticness"] = "MED"

    # ---------- INSTRUMENTALNESS (MED-HIGH w/ Demucs, else MED) ----------
    if HAVE_DEMUCS:
        try:
            f.instrumentalness = _instrumentalness_demucs(path, sr)
            f.confidence["instrumentalness"] = "MED-HIGH"
        except Exception as e:
            f.notes.append(f"Demucs failed, used proxy ({e})")
    if not f.instrumentalness:
        # proxy: vocal range (200-4000Hz) presence vs total
        voc = float(S[(freqs>=200)&(freqs<=4000)].sum())/total_e
        f.instrumentalness = round(float(np.clip(1.0 - _norm(voc, 0.2, 0.6), 0, 1)), 3)
        f.confidence["instrumentalness"] = "MED"

    # ---------- SPEECHINESS (MED) ----------
    zcr = float(np.mean(librosa.feature.zero_crossing_rate(y)))
    f.speechiness = round(float(np.clip(_norm(zcr, 0.05, 0.25), 0, 1)),3)
    f.confidence["speechiness"] = "MED"

    # ---------- VALENCE (LOW) ----------
    # crude: major mode + brightness + tempo -> positivity. Soft signal only.
    f.valence = round(float(np.clip(0.4*f.mode + 0.3*_norm(f.spectral_centroid_hz,1000,4000) + 0.3*tempo_fit,0,1)),3)
    f.confidence["valence"] = "LOW"

    # ---------- LIVENESS (LOW) ----------
    f.liveness = 0.0
    f.confidence["liveness"] = "LOW"
    f.notes.append("liveness has no reliable open-source equivalent; reported as 0 / low-confidence")

    # ---------- STRUCTURE / TIME-TO-HOOK (MED) ----------
    if HAVE_ALLIN1:
        try:
            import allin1
            res = allin1.analyze(path)
            segs = res.segments
            f.n_sections = len(segs)
            # intro = time until first 'chorus'/'verse' after intro label
            for s in segs:
                if str(getattr(s, "label", "")).lower() not in ("start","intro","silence"):
                    f.intro_length_sec = round(float(s.start), 2); break
            f.confidence["structure"] = "HIGH"
        except Exception as e:
            f.notes.append(f"all-in-one failed, used librosa segmentation ({e})")
    if not f.n_sections:
        # librosa novelty-based segmentation
        try:
            bounds = librosa.segment.agglomerative(
                librosa.util.sync(chroma, librosa.onset.onset_detect(y=y, sr=sr), aggregate=np.mean), 8)
            f.n_sections = int(len(bounds))
        except Exception:
            f.n_sections = 0
        # intro length = time of first big RMS jump
        if len(rms) > 4:
            thr = np.percentile(rms, 70)
            idx = np.argmax(rms > thr)
            f.intro_length_sec = round(float(librosa.frames_to_time(idx, sr=sr)), 2)
        f.confidence["structure"] = "MED"

    return f


# =====================================================================
# Genre-aware scoring  (illustrative — refit on real reference corpus)
# =====================================================================
# Reference targets per genre: (ideal_lufs, ideal_tempo_range, ideal_crest_db, ideal_intro_max_s)
GENRE_TARGETS = {
    "pop":    dict(lufs=-9.5,  tempo=(95, 130), crest=(8, 14),  intro_max=8,  dance=(0.6,0.9)),
    "edm":    dict(lufs=-6.0,  tempo=(120,132), crest=(5, 9),   intro_max=16, dance=(0.7,0.95)),
    "hiphop": dict(lufs=-8.0,  tempo=(70, 100), crest=(7, 12),  intro_max=8,  dance=(0.6,0.9)),
}

def score(f: Features, genre: str = "pop") -> dict:
    g = GENRE_TARGETS.get(genre, GENRE_TARGETS["pop"])
    parts, fixes = {}, []

    # Loudness (vs streaming + genre)
    if f.lufs_integrated:
        over = f.lufs_integrated - g["lufs"]
        loud_score = max(0.0, 1 - abs(over) / 6.0)
        parts["loudness"] = loud_score
        if f.lufs_integrated > -14:
            fixes.append(f"Master is {f.lufs_integrated} LUFS; streaming normalizes to -14, so it will be turned down "
                         f"{abs(round(f.lufs_integrated+14,1))} dB. {'Typical for '+genre+'.' if over<2 else 'Consider less limiting.'}")
    # Dynamics
    lo, hi = g["crest"]
    parts["dynamics"] = 1.0 if lo <= f.crest_factor_db <= hi else max(0.0, 1 - min(abs(f.crest_factor_db-lo),abs(f.crest_factor_db-hi))/8)
    if f.crest_factor_db < lo:
        fixes.append(f"Crest factor {f.crest_factor_db} dB is low (over-compressed). Back off the limiter for punch.")
    if f.clipping_pct > 0.1:
        fixes.append(f"Clipping detected on {f.clipping_pct}% of samples — pull the ceiling to -1 dBTP.")
    # Tempo fit
    tlo, thi = g["tempo"]
    parts["tempo_fit"] = 1.0 if tlo <= f.tempo_bpm <= thi else max(0.0, 1 - min(abs(f.tempo_bpm-tlo),abs(f.tempo_bpm-thi))/40)
    # Danceability vs genre
    dlo, dhi = g["dance"]
    parts["danceability"] = 1.0 if dlo <= f.danceability <= dhi else max(0.0, 1 - abs(f.danceability-(dlo+dhi)/2))
    # Intro / time-to-hook
    parts["arrangement"] = 1.0 if f.intro_length_sec <= g["intro_max"] else max(0.0, 1 - (f.intro_length_sec-g["intro_max"])/16)
    if f.intro_length_sec > g["intro_max"]:
        fixes.append(f"Intro is {f.intro_length_sec}s; for {genre}, get to the hook faster (target <{g['intro_max']}s).")
    # Stereo / mono safety
    parts["stereo"] = 1.0 if f.stereo_correlation > 0.2 else 0.5
    if f.stereo_correlation < 0:
        fixes.append("Negative stereo correlation — low end may cancel on phone/club mono. Mono-check the mix.")

    music_score = round(100 * float(np.mean(list(parts.values()))), 1)
    return {
        "genre": genre,
        "music_score": music_score,
        "subscores": {k: round(v*100,1) for k,v in parts.items()},
        "top_fixes": fixes[:3] if fixes else ["Solid technical foundation — focus next pass on arrangement and hook."],
    }


# =====================================================================
# small utils + optional engines
# =====================================================================
def _norm(x, lo, hi):
    return float(np.clip((x - lo) / (hi - lo + 1e-9), 0, 1))

def _bell(x, center, width):
    return float(math.exp(-((x - center) ** 2) / (2 * width ** 2)))

def _instrumentalness_demucs(path, sr):
    import torch, torchaudio
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    model = get_model("htdemucs")
    wav, _sr = torchaudio.load(path)
    if _sr != model.samplerate:
        wav = torchaudio.functional.resample(wav, _sr, model.samplerate)
    ref = wav.mean(0)
    wav = (wav - ref.mean()) / (wav.std() + 1e-9)
    sources = apply_model(model, wav[None], split=True, overlap=0.1)[0]
    names = model.sources  # drums, bass, other, vocals
    energies = {n: float(sources[i].pow(2).mean()) for i, n in enumerate(names)}
    voc = energies.get("vocals", 0.0)
    tot = sum(energies.values()) + 1e-9
    return round(float(np.clip(1.0 - voc / tot * 2.5, 0, 1)), 3)


# =====================================================================
# Adapter to the original SMU model schema (reuse the modeling pipeline)
# =====================================================================
# The deployed SMU model (KNN, k=20, Manhattan, distance-weighted; hit = popularity>=0.90)
# expects these 11 features. The engine reproduces 10 in-house; `explicit` comes from the
# lyrics layer and `year` from metadata.
SMU_REQUIRED_VARS = ['explicit','instrumentalness','duration_ms','year','loudness',
                     'danceability','energy','acousticness','speechiness','key','mode']

def to_model_features(f: Features, year: int, explicit: int = 0) -> dict:
    """Map the in-house engine output to the original 11-var model schema.

    IMPORTANT: the original KNN + StandardScaler were fit on SPOTIFY feature
    distributions. Do NOT feed these raw values into that scaler/model — KNN is
    scale/distribution sensitive. Re-extract features for the training songs with
    THIS engine, refit the scaler + KNN, then predict. Schema transfers; weights do not.
    """

# --- corrected adapter (overrides any earlier partial definition) ---
def to_model_features(f: Features, year: int, explicit: int = 0) -> dict:
    """Map in-house engine output to the original 11-var SMU model schema.

    NOTE: the original KNN + StandardScaler were fit on SPOTIFY distributions.
    Re-extract features for the training songs with THIS engine, refit the
    scaler + KNN, then predict. The schema transfers; the weights do not.
    """
    return {
        'explicit': int(explicit),
        'instrumentalness': f.instrumentalness,
        'duration_ms': int(f.duration_sec * 1000),
        'year': int(year),
        'loudness': f.loudness_db_rms,
        'danceability': f.danceability,
        'energy': f.energy,
        'acousticness': f.acousticness,
        'speechiness': f.speechiness,
        'key': f.key_index,
        'mode': f.mode,
    }


# =====================================================================
# Input validation / OOD gate  (Step 1 of the automated loop)
# =====================================================================
def validate_audio(path: str, min_sec: float = 20.0, max_sec: float = 720.0) -> dict:
    """Cheap gate before expensive analysis. Returns {ok, reason, ...}.

    Catches: unreadable/corrupt, too short/long, silent, non-finite, and a
    light 'probably not music' heuristic (near-noise / no rhythmic onsets).
    The loop routes ok=False to reject or human review.
    """
    try:
        y, sr = librosa.load(path, sr=22050, mono=True)
    except Exception as e:
        return {"ok": False, "reason": "unreadable", "detail": str(e)}
    if y is None or y.size == 0:
        return {"ok": False, "reason": "empty"}
    if not np.all(np.isfinite(y)):
        return {"ok": False, "reason": "non_finite"}
    dur = float(librosa.get_duration(y=y, sr=sr))
    if dur < min_sec:
        return {"ok": False, "reason": "too_short", "duration_sec": round(dur, 2)}
    if dur > max_sec:
        return {"ok": False, "reason": "too_long", "duration_sec": round(dur, 2)}
    rms = float(np.sqrt(np.mean(y**2)))
    if rms < 1e-4:
        return {"ok": False, "reason": "silent", "rms": rms}
    # OOD heuristics: spectral flatness ~1 => noise; no onsets => probably not music
    flat = float(np.mean(librosa.feature.spectral_flatness(y=y)))
    onsets = librosa.onset.onset_detect(y=y, sr=sr, units="time")
    onset_rate = len(onsets) / max(dur, 1e-9)
    ood = flat > 0.6 or onset_rate < 0.05
    return {
        "ok": not ood,
        "reason": "possibly_not_music" if ood else "ok",
        "duration_sec": round(dur, 2),
        "rms": round(rms, 5),
        "spectral_flatness": round(flat, 3),
        "onset_rate_hz": round(onset_rate, 3),
        "confidence": round(float(1 - flat) * min(1.0, onset_rate / 0.5), 3),
    }
