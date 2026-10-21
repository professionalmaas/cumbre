# Cumbre — Technical Build Spec

*Get your song to the summit.*
This file is the source of truth. It is written to be implemented
phase by phase. Keep it in the repo as `/docs/BUILD_SPEC.md` and reference it from `AGENTS.md`.

---

## 0. What we're building

A subscription web app where an independent artist uploads a song and gets a **two-part grade
(Music + Lyrics), genre-aware, with the Top 3 fixes** to improve it. Fully automated loop;
a human (the founder) is involved only for **high-risk** decisions. Monetized via
**pay-per-song + credit subscriptions**.

**Non-negotiables**
1. **No Spotify dependency.** All audio features are computed in-house from the uploaded file
   (engine already prototyped — see `cumbre_engine.py`). Revoke the old Spotify client_id.
2. **Ingest by direct upload only.** Never pull from YouTube/Spotify URLs (ToS + copyright).
3. **Analyze, never display lyrics.** Output scores/feedback, not lyric text. Transcripts are
   transient and per-user.
4. **Positioning = craft grading, not "hit prediction."** No public accuracy claims.

---

## 1. Stack (opinionated, lean, scale-to-zero)

| Layer | Choice |
|---|---|
| Frontend / host | Next.js (App Router) on Vercel |
| Auth + DB + storage | Supabase (Postgres + Auth + Storage + RLS) |
| Durable workflow | Inngest (queue + retries + DLQ + observability in one SDK) |
| ML worker | Modal (Python; Demucs/WhisperX/Essentia/librosa + LLM calls; scale-to-zero) |
| Payments | Stripe Checkout + self-managed credit ledger in Postgres |
| Copyright gate | ACRCloud Identification API |
| Moderation | OpenAI moderation endpoint (free) |
| LLM | Haiku-class for lyric analysis + feedback; stronger model only for hard cases |
| Evals + drift | Versioned golden set + LLM-eval harness; Evidently |

Direct-to-storage upload via Supabase presigned URL (never proxy big files through Vercel).

---

## 2. Data model (Postgres / Supabase)

```sql
-- users handled by Supabase auth.users; app profile:
create table profiles (
  id uuid primary key references auth.users(id),
  email text, display_name text,
  created_at timestamptz default now()
);

-- credit ledger (source of truth for balance = SUM(delta))
create table credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id),
  delta int not null,                 -- +purchased, -consumed
  reason text not null,               -- 'purchase','analysis','refund','grant'
  stripe_event_id text,               -- idempotency for purchases
  job_id uuid,
  created_at timestamptz default now()
);
create unique index on credit_ledger (stripe_event_id) where stripe_event_id is not null;

create table songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  storage_path text not null,
  original_filename text,
  genre text check (genre in ('pop','edm','hiphop')) not null,
  declared_year int,
  rights_warranty bool not null default false,  -- user attested they own rights
  created_at timestamptz default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references songs(id),
  user_id uuid references profiles(id),
  status text not null default 'queued',  -- queued|running|needs_review|done|failed|rejected
  stage text,                             -- validate|moderate|fingerprint|extract|score|feedback|charge|deliver
  model_version text,
  confidence numeric,
  flagged_reason text,                    -- why escalated to human
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table results (
  job_id uuid primary key references jobs(id),
  features jsonb,        -- full engine vector (store features, NEVER audio/lyrics text)
  music_score numeric,
  lyrics_score numeric,
  combined_grade text,   -- letter/band
  subscores jsonb,
  top_fixes jsonb,
  feedback_md text,      -- generated feedback (no verbatim lyrics)
  created_at timestamptz default now()
);

create table review_queue (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id),
  category text not null, -- 'copyright'|'moderation'|'low_confidence'|'ood'|'payment'|'drift'
  payload jsonb,
  resolved bool default false,
  resolution text,
  created_at timestamptz default now()
);
```
RLS: users can read only their own `songs/jobs/results/credit_ledger`. `review_queue` is
admin-only. Balance check before enqueue: `SELECT COALESCE(SUM(delta),0) FROM credit_ledger
WHERE user_id=$1` must be ≥ 1.

---

## 3. The automated loop (Inngest function)

One Inngest function `analyze.song`, triggered by event `song/uploaded`. Each `step.run` is
durable, retried, and idempotent. **Order is load-bearing: moderate + fingerprint BEFORE charge.**

```ts
inngest.createFunction(
  { id: "analyze-song", concurrency: { limit: 20 }, retries: 3 },
  { event: "song/uploaded" },
  async ({ event, step }) => {
    const { jobId, songId, userId } = event.data;

    // 1) VALIDATE + OOD  -> reject non-music/corrupt
    const v = await step.run("validate", () => validateAudio(songId));
    if (!v.ok) return escalateOrReject(step, jobId, v);          // ood/corrupt -> review or reject

    // 2) MODERATION (cheap, fast) -> block / review
    const mod = await step.run("moderate", () => moderate(songId));
    if (mod.block) return reject(step, jobId, "moderation");
    if (mod.review) return toReview(step, jobId, "moderation", mod);

    // 3) COPYRIGHT FINGERPRINT (ACRCloud) -> BlockAccess => human
    const fp = await step.run("fingerprint", () => acrFingerprint(songId));
    if (fp.policy === "BlockAccess") return toReview(step, jobId, "copyright", fp);

    // 4) EXTRACT (Modal: features + transcription)  [GPU step]
    const feat = await step.run("extract", () => modal.extract(songId)); // calls cumbre_engine

    // 5) SCORE (music + lyrics) -> low confidence => human
    const sc = await step.run("score", () => scoreSong(feat));
    if (sc.confidence < 0.7) return toReview(step, jobId, "low_confidence", sc);

    // 6) FEEDBACK (LLM, strict JSON schema, self-check)
    const fb = await step.run("feedback", () => generateFeedback(feat, sc));

    // 7) CHARGE (idempotent, circuit-broken)  -- only after success
    await step.run("charge", () =>
      consumeCredit(userId, jobId, { idempotencyKey: jobId }));

    // 8) DELIVER + capture feedback for active learning
    await step.run("deliver", () => deliverResult(jobId, feat, sc, fb));
  }
);
```

### Human-gate matrix (escalate → `review_queue`, everything else auto)
| Trigger | Action |
|---|---|
| Suspected copyright (ACRCloud BlockAccess) | HUMAN |
| Refund / chargeback / payment dispute | HUMAN |
| Abusive/illegal content (moderation high) | HUMAN (hard block) |
| Model confidence < 0.70 | HUMAN |
| Out-of-distribution / non-music upload | reject or HUMAN |
| Validated model/data drift | HUMAN (before retrain) |
| Normal, high-confidence, clean fingerprint | AUTO deliver + charge |

Start with the AUTO band tight (review more); widen as task types prove reliable.

---

## 4. The Modal worker (Python)

Wrap the prototyped engine. Module signatures to implement:

```python
# modal_app.py
import modal
app = modal.App("cumbre-engine")
image = (modal.Image.debian_slim()
         .apt_install("ffmpeg")
         .pip_install("librosa","soundfile","pyloudnorm","numpy","scipy",
                      "demucs","openai-whisper","scikit-learn"))

@app.function(image=image, timeout=600)        # CPU default; add gpu="A10G" for Demucs/Whisper
def extract(storage_url: str, genre: str, year: int) -> dict:
    path = download(storage_url)               # presigned GET to /tmp
    import cumbre_engine as ce
    f = ce.analyze(path, genre)                # Spotify-parity + enhancements
    model_vec = ce.to_model_features(f, year=year)  # 11-var schema for the KNN
    lyrics = transcribe(path)                  # Demucs -> WhisperX (vocal stem); transient
    return {"features": asdict(f), "model_vec": model_vec, "lyrics_meta": lyric_metrics(lyrics)}
```

- **Audio:** `cumbre_engine.analyze()` (already built & tested). Upgrade path: install
  Essentia/madmom/allin1 in the image to auto-activate the ML heads + structure.
- **Lyrics:** Demucs (isolate vocal) → WhisperX (transcribe + word timestamps). Compute
  deterministic metrics (repetition via compression, MTLD, rhyme density via CMUdict).
  **Discard the transcript after computing metrics; never store verbatim text.**
- **Cost:** ~1–2¢/song. Modal scales to zero between bursts.

---

## 5. Scoring & feedback contracts

### Music score
Reuse the SMU pipeline, refit on in-house features:
- Target: `hit = popularity ≥ 0.90` (unchanged definition).
- Model: start with the existing **KNN (k=20, Manhattan, distance-weighted)** + **StandardScaler**,
  **refit** on features extracted by `cumbre_engine` for the training corpus (the old weights
  were fit on Spotify distributions — schema transfers, weights do not).
- Keep F1-threshold tuning (old best ≈ 0.26) but re-tune on the refit model.
- Also produce the human-readable genre subscores (loudness, dynamics, tempo-fit,
  danceability, arrangement, stereo) from `cumbre_engine.score()` — these drive the fixes.

### Lyrics score (Phase 2)
Genre-weighted blend of deterministic metrics (repetition, MTLD, rhyme density, structure,
sentiment) + an LLM qualitative read. Lyrics weight: high for hiphop, medium pop, low edm.

### Feedback (LLM) — strict contract
```json
{
  "music_score": 0-100, "lyrics_score": 0-100, "combined_grade": "A-F",
  "top_fixes": ["...","...","..."],          // <=3, specific & genre-aware
  "confidence": 0-1
}
```
Rules: enforce JSON schema (strict), run a separate screening model, cap tokens, and run an
LLM-as-judge self-check before deliver. Lead the UI with **Top 3 Fixes**, not the bare number.

---

## 6. Payments & credits

- Sell credit packs via Stripe Checkout (`mode: payment`); webhook writes a `+delta` row to
  `credit_ledger` keyed by `stripe_event_id` (unique → idempotent; ignore duplicate webhooks).
- Subscriptions via Stripe Billing grant monthly `+delta` credits (capped rollover ≤3×).
- Consume 1 credit per analysis in `step.run("charge")` with `idempotencyKey = jobId`.
- Wrap charge in a **circuit breaker + kill switch** (env flag) so a bad model deploy can't
  auto-charge everyone. Verify webhook signatures; return 2xx fast; process async.

Pricing: free first song; $2.99 one-off; packs ~$2.00–$2.50/credit; subs $9.99 / $19.99 /
$39.99 per month (5 / 20 / 100 analyses).

---

## 7. Guardrails & ops

- **Rate limit** uploads/inference (token bucket); email verification + CAPTCHA; flag
  datacenter IPs against free-credit abuse.
- **Observability:** four golden signals + SLO burn alerts + DLQ alarms; online evals on
  5–10% of traffic.
- **Model rollout:** shadow → canary 1%→10%→50% → 100%; auto-revert on KPI breach. Store
  `model_version` on every job.
- **Quality loop:** versioned golden dataset; regression eval suite blocks any prompt/model/
  scoring change that regresses; Evidently for drift; capture user thumbs/edits →
  active-learning queue (uncertainty sampling).
- **Legal:** register DMCA agent ($6); enforce repeat-infringer policy; ToS rights-warranty;
  AI-feedback disclaimer; delete uploaded audio after analysis; store features not audio/lyrics.

---

## 8. Phased delivery (build in this order)

- **Phase 0 — Concierge.** Landing page + Stripe Payment Link; run `cumbre_engine` by hand;
  email reports. Validate willingness to pay. *(No worker yet.)*
- **Phase 1 — Audio-only MVP.** Next.js + Supabase + Stripe credit ledger; Inngest loop;
  Modal `extract`; refit KNN on in-house features; **Pop only**; human-review console.
- **Phase 2 — Lyrics.** Demucs→WhisperX transcription, lyric metrics + LLM lyrics score;
  add **Hip-hop**; golden-set evals + canary deploys.
- **Phase 3 — Scale + depth.** Add **EDM** (production-weighted rubric); Essentia/allin1/Demucs
  ML upgrades; drift monitoring; "V2 / re-score" retention feature; ops automation in Routines.

---

## 9. Repo layout (suggested)
```
/app                 Next.js (routes, UI from the design handoff)
/lib/inngest         analyze.song function + steps
/lib/stripe          checkout, webhooks, credit ledger
/worker              Modal app: modal_app.py, cumbre_engine.py, lyrics.py, scoring.py
/models              refit scaler + KNN artifacts (versioned)
/docs/BUILD_SPEC.md  this file
AGENTS.md            project instructions
```

## 10. First implementation tasks
1. Scaffold Next.js + Supabase (auth, schema from §2, RLS, presigned upload).
2. Stripe Checkout + credit ledger (idempotent webhook).
3. Inngest `analyze.song` skeleton with the human-gate matrix (§3), stubs for each step.
4. Modal `extract` wrapping `cumbre_engine` (§4); wire to the loop.
5. Refit script: extract features for training corpus → refit StandardScaler+KNN → save (§5).
6. Minimal results page rendering Top-3-Fixes + two scores (from the design handoff).
