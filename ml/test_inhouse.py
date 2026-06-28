"""
Cumbre — in-house ML tests (fame-blind harness + owned audio model).
Run: python test_inhouse.py
Fame-blind tests always run (pandas only). AudioNet tests run only if torch is
installed (skipped, not failed, otherwise).
"""
import sys, traceback
PASS = FAIL = SKIP = 0
def check(name, cond, detail=""):
    global PASS, FAIL
    if cond: PASS += 1; print(f"  PASS  {name}")
    else: FAIL += 1; print(f"  FAIL  {name}  {detail}")

def test_fameblind():
    print("[fameblind]")
    import cumbre_fameblind as fb, numpy as np, pandas as pd
    rng = np.random.default_rng(1); rows = []
    for a in range(25):
        fame = rng.normal(0, 1)
        for s in range(rng.integers(2, 6)):
            craft = rng.normal(0, 1)
            rows.append({"song_id": f"{a}_{s}", "artist": f"a{a}",
                         "popularity": 0.8*fame + 0.3*craft + rng.normal(0, .1),
                         "true_craft": craft})
    df = pd.DataFrame(rows)
    rep = fb.contamination_report(df)
    check("detects fame domination", rep["variance_explained_by_artist"] > 0.5, rep)
    out = fb.build_fameblind_target(df, method="within_artist")
    v = out.dropna(subset=["fameblind_target"])
    craft_raw = np.corrcoef(df["popularity"], df["true_craft"])[0,1]
    craft_fb = np.corrcoef(v["fameblind_target"], v["true_craft"])[0,1]
    check("fame-blind target tracks craft better than raw popularity", craft_fb > craft_raw + 0.2,
          f"{craft_fb:.2f} vs {craft_raw:.2f}")
    lab = fb.make_binary_label(out, top_quantile=0.3)
    check("binary label created", lab["hit_fameblind"].notna().any())
    tr, te = fb.artist_stratified_split(df)
    check("no artist leaks across split", len(set(tr['artist']) & set(te['artist'])) == 0)
    clean, dropped = fb.drop_fame_features(pd.DataFrame({"energy":[1],"followers":[9],"streams":[5]}))
    check("fame features stripped from X", "followers" not in clean and "streams" not in clean)

def test_audionet():
    print("[audionet]")
    try:
        import torch  # noqa
    except Exception:
        global SKIP; SKIP += 1
        print("  SKIP  torch not installed (run `pip install torch`; module is syntax-validated)")
        return
    import cumbre_audionet as an
    an._selftest()  # asserts val_acc>0.6 and embedding shape internally
    check("audionet selftest passed", True)

def main():
    for fn in (test_fameblind, test_audionet):
        try: fn()
        except Exception as e:
            global FAIL; FAIL += 1
            print(f"  ERROR in {fn.__name__}: {e}"); traceback.print_exc()
    print(f"\n==== {PASS} passed, {FAIL} failed, {SKIP} skipped ====")
    sys.exit(0 if FAIL == 0 else 1)

if __name__ == "__main__":
    main()
