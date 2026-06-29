"""
Cumbre — Lyrics Layer
=====================
Deterministic, phonetics-first lyric analysis (the research-backed approach):
the LLM is NOT used as the rhyme/syllable engine. We measure what is reliably
measurable and reserve LLM judgment for theme/feedback elsewhere.

What it scores
--------------
  repetition        compression-based (zlib) — robust, language-agnostic
  lexical_diversity MTLD (length-robust; NOT raw type-token ratio)
  rhyme_density     CMUdict (via `pronouncing`) end-rhyme detection, vowel fallback
  structure         chorus/section detection from repeated line blocks
  sentiment         small lexicon valence (soft signal)
  explicit          profanity flag -> feeds the SMU model's `explicit` var

Genre weighting (lyrics matter most in hip-hop, least in EDM) is applied in
`lyrics_score()`.  Privacy: operates on a transient transcript string; callers
must NOT persist verbatim lyrics — store these derived metrics only.
"""
from __future__ import annotations
import re, zlib, math
from dataclasses import dataclass, field, asdict
from collections import Counter

try:
    import pronouncing  # CMUdict-backed
    _HAVE_PRON = True
except Exception:
    _HAVE_PRON = False

_WORD = re.compile(r"[a-z']+")
_VOWELS = "aeiouy"

# small, non-exhaustive profanity set for the `explicit` flag (extend as needed)
_PROFANITY = {
    "fuck","shit","bitch","ass","asshole","dick","pussy","cunt","nigga","nigger",
    "motherfucker","cock","whore","slut","fag","damn","bastard","hoe",
}

# tiny valence lexicon (soft sentiment signal only)
_POS = {"love","happy","light","shine","dream","dance","free","hope","smile","gold",
        "alive","bright","high","fly","heaven","sweet","beautiful","good","joy","up"}
_NEG = {"pain","cry","alone","dark","hate","lost","broken","fall","die","death",
        "tears","cold","fear","hurt","empty","down","blood","goodbye","sad","gone"}


@dataclass
class LyricFeatures:
    n_lines: int = 0
    n_words: int = 0
    n_unique: int = 0
    repetition: float = 0.0        # 0..1  (1 = very repetitive)
    lexical_diversity: float = 0.0 # MTLD (raw; ~higher = more diverse)
    rhyme_density: float = 0.0     # 0..1  fraction of lines that end-rhyme
    avg_syllables_per_line: float = 0.0
    chorus_detected: bool = False
    n_repeated_blocks: int = 0
    sentiment: float = 0.0         # -1..1
    explicit: int = 0
    words_per_minute: float = 0.0  # if duration provided
    rhyme_engine: str = "none"
    notes: list = field(default_factory=list)


# ---------------------------------------------------------------- helpers
def _lines(text: str):
    return [ln.strip() for ln in text.splitlines() if ln.strip()]

def _words(text: str):
    return _WORD.findall(text.lower())

def _syllables(word: str) -> int:
    if _HAVE_PRON:
        ph = pronouncing.phones_for_word(word)
        if ph:
            return max(1, pronouncing.syllable_count(ph[0]))
    # vowel-group fallback
    groups = re.findall(r"[aeiouy]+", word)
    n = len(groups)
    if word.endswith("e") and n > 1:
        n -= 1
    return max(1, n)

def _rhyme_part(word: str):
    """Return the rhyming tail (phonemes from last stressed vowel) or vowel fallback."""
    if _HAVE_PRON:
        ph = pronouncing.phones_for_word(word)
        if ph:
            return pronouncing.rhyming_part(ph[0])
    # fallback: last vowel cluster + trailing consonants
    m = re.search(r"[aeiouy]+[^aeiouy]*$", word)
    return m.group(0) if m else word


def mtld(tokens, threshold=0.72) -> float:
    """Measure of Textual Lexical Diversity (length-robust). Returns ~ factor count."""
    if len(tokens) < 10:
        return float(len(set(tokens)))  # too short for MTLD; report unique count
    def _factor(seq):
        factors, types, n = 0.0, set(), 0
        for t in seq:
            types.add(t); n += 1
            ttr = len(types) / n
            if ttr <= threshold:
                factors += 1; types, n = set(), 0
        if n > 0:
            factors += (1 - len(types)/n) / (1 - threshold)
        return len(seq) / factors if factors else len(seq)
    return round((_factor(tokens) + _factor(tokens[::-1])) / 2, 2)


def repetition_score(text: str) -> float:
    """Compression ratio -> repetition. More compressible = more repetitive."""
    data = re.sub(r"\s+", " ", text.strip().lower()).encode("utf-8")
    if len(data) < 40:
        return 0.0
    comp = len(zlib.compress(data, 9))
    ratio = 1 - comp / len(data)            # 0..~1
    return round(float(min(max(ratio, 0), 1)), 3)


def _repeated_blocks(lines):
    """Count line-blocks that repeat (chorus proxy)."""
    norm = [re.sub(r"[^a-z ]", "", ln.lower()).strip() for ln in lines]
    counts = Counter(n for n in norm if len(n.split()) >= 3)
    repeated = {k: v for k, v in counts.items() if v >= 2}
    return len(repeated), sum(repeated.values())


def rhyme_density(lines) -> float:
    if len(lines) < 2:
        return 0.0
    last = []
    for ln in lines:
        ws = _words(ln)
        last.append(_rhyme_part(ws[-1]) if ws else None)
    rhymed = 0
    for i in range(len(last)):
        if not last[i]:
            continue
        # rhymes with neighbor within 2 lines (couplet/alternate)
        for j in (i-1, i-2, i+1, i+2):
            if 0 <= j < len(last) and j != i and last[j] and last[j] == last[i]:
                rhymed += 1; break
    return round(rhymed / len(lines), 3)


# ---------------------------------------------------------------- main
def analyze_lyrics(text: str, duration_sec: float | None = None) -> LyricFeatures:
    f = LyricFeatures()
    f.rhyme_engine = "cmudict" if _HAVE_PRON else "vowel-fallback"
    if not text or not text.strip():
        f.notes.append("empty lyrics")
        return f
    lines = _lines(text)
    words = _words(text)
    f.n_lines = len(lines)
    f.n_words = len(words)
    f.n_unique = len(set(words))
    f.repetition = repetition_score(text)
    # MTLD on de-duplicated lines so a repeated chorus doesn't deflate vocabulary
    seen, dedup_lines = set(), []
    for ln in lines:
        key = re.sub(r"[^a-z ]", "", ln.lower()).strip()
        if key not in seen:
            seen.add(key); dedup_lines.append(ln)
    f.lexical_diversity = mtld(_words(" ".join(dedup_lines)))
    f.rhyme_density = rhyme_density(lines)
    syl = sum(_syllables(w) for w in words)
    f.avg_syllables_per_line = round(syl / max(len(lines), 1), 2)
    f.n_repeated_blocks, _ = _repeated_blocks(lines)
    f.chorus_detected = f.n_repeated_blocks >= 1
    pos = sum(1 for w in words if w in _POS)
    neg = sum(1 for w in words if w in _NEG)
    f.sentiment = round((pos - neg) / max(pos + neg, 1), 3) if (pos + neg) else 0.0
    f.explicit = int(any(w in _PROFANITY for w in words))
    if duration_sec and duration_sec > 0:
        f.words_per_minute = round(len(words) / (duration_sec / 60.0), 1)
    return f


# Genre-weighted 0..100 lyrics score + fixes
LYRIC_GENRE = {
    # ideal rhyme density, ideal MTLD, weight of lyrics in the combined grade
    "hiphop": dict(rhyme=(0.45, 0.95), mtld=(60, 200), weight=0.50, wpm=(200, 460)),
    "pop":    dict(rhyme=(0.30, 0.70), mtld=(40, 120), weight=0.35, wpm=(80, 240)),
    "edm":    dict(rhyme=(0.20, 0.60), mtld=(20, 90),  weight=0.20, wpm=(40, 160)),
}

def lyrics_score(lf: LyricFeatures, genre: str = "pop") -> dict:
    g = LYRIC_GENRE.get(genre, LYRIC_GENRE["pop"])
    parts, fixes = {}, []
    if lf.n_words == 0:
        return {"lyrics_score": None, "subscores": {}, "fixes": ["No lyrics detected — instrumental, or transcription failed."]}

    # rhyme vs genre band
    rlo, rhi = g["rhyme"]
    parts["rhyme"] = 1.0 if rlo <= lf.rhyme_density <= rhi else max(0.0, 1 - min(abs(lf.rhyme_density-rlo), abs(lf.rhyme_density-rhi))/0.4)
    if lf.rhyme_density < rlo:
        fixes.append(f"Rhyme density {lf.rhyme_density} is light for {genre} (aim {rlo:.2f}-{rhi:.2f}); add internal/end rhymes.")

    # lexical diversity vs genre
    mlo, mhi = g["mtld"]
    parts["vocabulary"] = 1.0 if lf.lexical_diversity >= mlo else max(0.2, lf.lexical_diversity/mlo)
    if lf.lexical_diversity < mlo:
        fixes.append(f"Vocabulary is narrow for {genre} (MTLD {lf.lexical_diversity}); vary word choice in the verses.")

    # chorus / hook
    parts["hook"] = 1.0 if lf.chorus_detected else 0.4
    if not lf.chorus_detected:
        fixes.append("No repeated chorus detected — a memorable, repeated hook lifts retention.")

    # repetition sweet spot (too low = no hook, too high = filler)
    parts["repetition_balance"] = 1.0 - abs(lf.repetition - 0.35) / 0.65
    parts["repetition_balance"] = max(0.0, min(1.0, parts["repetition_balance"]))

    score = round(100 * sum(parts.values()) / len(parts), 1)
    return {"lyrics_score": score, "subscores": {k: round(v*100,1) for k,v in parts.items()},
            "fixes": fixes[:3], "weight": g["weight"]}


# ---------------------------------------------------------------- ASR
def _isolate_vocals(audio_path: str) -> str:
    """Demucs -> isolated vocal stem (big WER win on sung audio). Falls back to original."""
    try:
        import subprocess, os, glob, tempfile
        outdir = tempfile.mkdtemp(prefix="cumbre_demucs_")
        subprocess.run(["python", "-m", "demucs", "--two-stems", "vocals",
                        "-o", outdir, audio_path], check=True, capture_output=True)
        hits = glob.glob(os.path.join(outdir, "**", "vocals.wav"), recursive=True)
        return hits[0] if hits else audio_path
    except Exception:
        return audio_path


def transcribe(audio_path: str, use_api: bool = True, isolate_vocals: bool = True,
               api_model: str = "whisper-1") -> str:
    """Transcribe sung vocals. Returns transient text — DO NOT persist verbatim lyrics.

    Pipeline: (optional) Demucs vocal isolation -> Whisper.
      use_api=True  -> OpenAI Whisper API  (needs OPENAI_API_KEY; api_model
                       'whisper-1' or 'gpt-4o-transcribe' for higher accuracy)
      use_api=False -> local openai-whisper / faster-whisper
    """
    path = _isolate_vocals(audio_path) if isolate_vocals else audio_path
    if use_api:
        from openai import OpenAI               # pip install openai
        client = OpenAI()                        # reads OPENAI_API_KEY from env
        with open(path, "rb") as fh:
            resp = client.audio.transcriptions.create(model=api_model, file=fh)
        return getattr(resp, "text", "") or ""
    import whisper                               # local fallback
    return whisper.load_model("base").transcribe(path).get("text", "")


SAMPLE = """I was running through the night chasing city light
Holding to the dream, holding to the fight
Tell me are we gonna be alright
Take me to the summit, take me to the height

We climb, we climb, we never gonna stop
We climb, we climb, all the way to the top
We climb, we climb, we never gonna stop
All the way up, all the way to the top"""

if __name__ == "__main__":
    import sys, json
    txt = open(sys.argv[1]).read() if len(sys.argv) > 1 else SAMPLE
    g = sys.argv[2] if len(sys.argv) > 2 else "pop"
    lf = analyze_lyrics(txt)
    print(json.dumps(asdict(lf), indent=2))
    print(json.dumps(lyrics_score(lf, g), indent=2))
