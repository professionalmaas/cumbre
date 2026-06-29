"""
Cumbre — test suite (no pytest dependency; run: python test_cumbre.py)
Generates a synthetic ground-truth song (C major, 120 BPM) and asserts the
engine recovers it, plus lyrics/scoring/refit behavior. Exit 0 iff all pass.
"""
import os, sys, math, traceback
import numpy as np, soundfile as sf

PASS, FAIL = 0, 0
def check(name, cond, detail=""):
    global PASS, FAIL
    if cond: PASS += 1; print(f"  PASS  {name}")
    else:    FAIL += 1; print(f"  FAIL  {name}  {detail}")

def make_song(path, bpm=120, root=261.63, dur=8, sr=44100, clip=False, silent=False):
    t = np.linspace(0, dur, sr*dur, endpoint=False)
    if silent:
        sf.write(path, np.zeros((len(t),2)), sr); return
    notes = [root, root*5/4, root*3/2, root*2]  # C E G C (major)
    mel = sum(0.12*np.sin(2*np.pi*f*t)*(np.sin(2*np.pi*(i+1)*0.5*t)>0) for i,f in enumerate(notes))
    kick = np.zeros_like(t); step = 60.0/bpm
    for b in np.arange(0, dur, step):
        i=int(b*sr); env=np.exp(-np.linspace(0,1,int(0.12*sr))*30)
        seg=np.sin(2*np.pi*60*np.linspace(0,0.12,int(0.12*sr)))*env
        kick[i:i+len(seg)]+=seg[:len(kick)-i]
    mix = mel + 0.5*kick; mix/=np.max(np.abs(mix))*1.05
    if clip: mix = np.clip(mix*4, -1, 1)
    sf.write(path, np.vstack([mix, mix]).T, sr)

# ---------------------------------------------------------------- ENGINE
def test_engine():
    print("[engine]")
    import cumbre_engine as ce
    make_song("t_clean.wav", bpm=120, dur=8)
    make_song("t_silent.wav", silent=True)
    make_song("t_short.wav", dur=3)

    v = ce.validate_audio("t_clean.wav", min_sec=5)  # 8s test clip; prod floor is 20s
    check("validate ok on music", v["ok"] is True, v)
    check("validate flags silence", ce.validate_audio("t_silent.wav")["ok"] is False)
    check("validate flags too_short", ce.validate_audio("t_short.wav")["reason"]=="too_short")
    check("validate unreadable", ce.validate_audio("nope.wav")["ok"] is False)

    f = ce.analyze("t_clean.wav", "pop")
    check("tempo ~120", abs(f.tempo_bpm-120) <= 6, f.tempo_bpm)
    check("key C major", f.key.startswith("C") and f.mode==1, f.key)
    check("duration ~8s", abs(f.duration_sec-8) < 0.5, f.duration_sec)
    check("LUFS computed", f.lufs_integrated < 0, f.lufs_integrated)
    check("crest positive", f.crest_factor_db > 0, f.crest_factor_db)
    check("features 0..1 bounded",
          all(0<=getattr(f,k)<=1 for k in ["energy","danceability","acousticness","instrumentalness","speechiness","valence"]))

    mv = ce.to_model_features(f, year=2026, explicit=1)
    check("model schema == 11 vars", sorted(mv)==sorted(ce.SMU_REQUIRED_VARS), sorted(mv))
    check("explicit passthrough", mv["explicit"]==1)
    check("duration_ms int", isinstance(mv["duration_ms"], int) and mv["duration_ms"]>0)

    # clipping detection
    make_song("t_loud.wav", clip=True, dur=6)
    fl = ce.analyze("t_loud.wav", "edm")
    check("clipping detected on hot master", fl.clipping_pct > 0.5, fl.clipping_pct)

# ---------------------------------------------------------------- LYRICS
def test_lyrics():
    print("[lyrics]")
    import cumbre_lyrics as cl
    check("rhyme night==light", cl._rhyme_part("night")==cl._rhyme_part("light"))
    check("non-rhyme orange!=love", cl._rhyme_part("orange")!=cl._rhyme_part("love"))

    rep = cl.repetition_score("na na na na " * 20)
    var = cl.repetition_score("the quick brown fox jumps over the lazy dog every single morning without fail today")
    check("repetition: repeated > varied", rep > var, f"{rep} vs {var}")

    lf = cl.analyze_lyrics(cl.SAMPLE)
    check("chorus detected", lf.chorus_detected is True)
    check("8 lines", lf.n_lines==8, lf.n_lines)
    check("clean lyrics not explicit", lf.explicit==0)
    check("explicit detected", cl.analyze_lyrics("this shit is fire\nburn it down").explicit==1)

    sc = cl.lyrics_score(lf, "hiphop")
    check("lyrics_score 0..100", 0 <= sc["lyrics_score"] <= 100, sc["lyrics_score"])
    check("hiphop lyrics weight 0.5", abs(sc["weight"]-0.5) < 1e-6)
    check("instrumental -> None score", cl.lyrics_score(cl.analyze_lyrics(""), "pop")["lyrics_score"] is None)

# ---------------------------------------------------------------- SCORING
def test_scoring():
    print("[scoring]")
    import cumbre_scoring as cs
    check("grade A+ at 95", cs.grade_letter(95)=="A+")
    check("grade A at 90", cs.grade_letter(90)=="A")
    check("grade F at 30", cs.grade_letter(30)=="F")

    music = {"music_score": 80.0, "subscores": {"loudness":80}, "top_fixes":["m1","m2","m3"]}
    lyr   = {"lyrics_score": 60.0, "subscores": {"rhyme":60}, "fixes":["l1","l2"], "weight":0.5}
    comb = cs.combine(music, lyr, "hiphop")
    check("weighted summit between scores", 60 <= comb["summit_score"] <= 80, comb["summit_score"])
    check("summit == 0.5*music+0.5*lyrics", abs(comb["summit_score"]-70.0) < 0.6, comb["summit_score"])
    check("top_fixes <= 3", len(comb["top_fixes"]) <= 3)
    check("fixes interleaved", comb["top_fixes"][0]=="m1" and comb["top_fixes"][1]=="l1")

    inst = cs.combine(music, None, "edm")
    check("instrumental summit == music", inst["summit_score"]==80.0 and inst["lyrics_score"] is None)
    check("percentile", cs.percentile_vs_reference(80, [10,20,80,90])==75.0)

    # end-to-end
    import cumbre_engine as ce
    if not os.path.exists("t_clean.wav"): make_song("t_clean.wav", dur=8)
    out = cs.analyze_song("t_clean.wav", "pop", lyrics_text=__import__("cumbre_lyrics").SAMPLE, year=2026)
    r = out["report"]
    check("e2e summit 0..100", 0 <= r["summit_score"] <= 100, r["summit_score"])
    check("e2e grade valid", r["grade"] in [g for _,g in cs.GRADE_BANDS])
    check("e2e model_vector 11", len(out["model_vector"])==11)
    check("e2e top_fixes present", len(r["top_fixes"]) >= 1)

# ---------------------------------------------------------------- REFIT
def test_refit():
    print("[refit]")
    import refit_model as rm
    rm._selftest()  # asserts internally; raises on failure
    check("refit selftest completed", True)

def main():
    for fn in (test_engine, test_lyrics, test_scoring, test_refit):
        try:
            fn()
        except Exception as e:
            global FAIL
            FAIL += 1
            print(f"  ERROR in {fn.__name__}: {e}")
            traceback.print_exc()
    print(f"\n==== {PASS} passed, {FAIL} failed ====")
    sys.exit(0 if FAIL == 0 else 1)

if __name__ == "__main__":
    main()
