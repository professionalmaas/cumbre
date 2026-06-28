# Cumbre — Phase 1 Checklist (audio-only MVP, Pop)

Goal: a working loop — sign up → buy credits → upload a Pop song → get a Music score + Top 3
fixes — with the human involved only on flagged items. Drop this in the repo; check items off
in PRs. Full detail in `docs/Cumbre_Build_Spec.md`.

## 0. Project setup
- [ ] Next.js (App Router, TypeScript) on Vercel; repo + CI; `CLAUDE.md` at root.
- [ ] Env scaffolding: `.env.example` with `SUPABASE_*`, `STRIPE_*`, `OPENAI_API_KEY`,
      `ACRCLOUD_*`, `MODAL_*`, `INNGEST_*`. Never commit real secrets.

## 1. Auth + database (Supabase)
- [ ] Supabase project; Auth (email/OAuth).
- [ ] Tables from spec §2: `profiles`, `credit_ledger`, `songs`, `jobs`, `results`, `review_queue`.
- [ ] Row-Level Security: users read only their own rows; `review_queue` admin-only.
- [ ] Balance helper: `SUM(credit_ledger.delta)` ≥ 1 required before enqueue.

## 2. Upload (upload-only, rights-gated)
- [ ] Presigned-URL direct upload to Supabase Storage (never proxy big files through Vercel).
- [ ] Upload form: file + **genre = Pop** (locked for Phase 1) + release year + rights-warranty checkbox.
- [ ] On upload, insert `songs` + `jobs(status=queued)` and emit `song/uploaded`.

## 3. Payments (Stripe + credit ledger)
- [ ] Stripe Checkout for credit packs (`mode: payment`) + free-first-song grant.
- [ ] Webhook: verify signature, dedupe by `stripe_event_id` (unique index), write `+delta` row.
- [ ] Consume 1 credit per analysis with idempotency key = `jobId`. Return 2xx fast; process async.

## 4. The Modal worker (wraps the existing engine)
- [ ] `modal_app.py` image: ffmpeg + `librosa soundfile pyloudnorm numpy scipy scikit-learn pandas`.
- [ ] `extract_and_score(storage_url, genre, year)`:
      download → `cumbre_scoring.analyze_song(path, "pop", year=year)` →
      load `CUMBRE_fameblind_model.pkl`, predict hit-score from `to_model_features` →
      return `{report, model_vector, hit_score, confidence}`. Delete temp audio.
- [ ] Scale-to-zero; CPU is fine for Phase 1.

## 5. The automated loop (Inngest `analyze.song`)
- [ ] Steps in order (each durable, retried): validate → moderate → fingerprint →
      extract+score (Modal) → (LLM feedback optional in P1) → **charge** → deliver.
- [ ] `validate`: call `cumbre_engine.validate_audio`; not-ok → reject or `review_queue(ood)`.
- [ ] `moderate`: OpenAI moderation; high → block; mid → `review_queue(moderation)`.
- [ ] `fingerprint`: ACRCloud; `BlockAccess` → `review_queue(copyright)`.
- [ ] `score`: if `confidence < 0.70` → `review_queue(low_confidence)`.
- [ ] `charge`: idempotent (key=jobId), wrapped in circuit breaker + kill-switch env flag.
- [ ] `deliver`: write `results`, mark `jobs.done`, notify user.

## 6. Results page (from the Claude Design handoff)
- [ ] Render: summit/Music score gauge, score, **Top 3 Fixes** (hero), subscore bars,
      extracted-features grid, AI-feedback disclaimer footer.
- [ ] Poll/subscribe `jobs`/`results` for completion. Show the "analyzing" state meanwhile.
- [ ] "Upload a new version" CTA (sets up the re-score retention loop).

## 7. Human-review console (admin)
- [ ] List `review_queue` (copyright / moderation / low_confidence / ood); approve / reject /
      refund actions; resolving updates the job.

## 8. Legal + safety (before any public launch)
- [ ] Register DMCA agent ($6); publish contact; enforced repeat-infringer policy.
- [ ] ToS (rights warranty, narrow processing license, AI-feedback disclaimer, no-guarantee),
      privacy policy, data-retention (delete audio post-analysis; store features/metrics only).

## 9. Quality gate
- [ ] `python test_cumbre.py` green in CI.
- [ ] End-to-end smoke: upload a real Pop track you own → report renders → 1 credit charged once.
- [ ] Kill switch verified (flip off → scoring/charge halts cleanly).

## Definition of done (Phase 1)
A new user can sign up, get the free first analysis, upload a Pop song, and receive a Music
score + Top 3 fixes; a second upload charges exactly one credit; flagged items land in the
review queue instead of auto-charging. Then proceed to Phase 2 (lyrics + Hip-hop).
