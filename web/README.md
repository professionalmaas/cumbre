# web/ — Cumbre Next.js app

The Next.js (App Router, TypeScript) app lives here, per
`docs/Cumbre_Build_Spec.md` and `docs/PHASE1_CHECKLIST.md`.

Expected structure once scaffolded:
```
web/
  package.json
  app/                    # routes + UI (results page from the design handoff)
    page.tsx              # upload + genre picker (Pop locked in Phase 1)
    report/[jobId]/page.tsx
    api/inngest/route.ts  # serves the Inngest function
    api/stripe/webhook/route.ts
  lib/
    inngest/              # <- analyze-song.ts (already provided at repo root lib/inngest/)
    supabase/  stripe/
```
Contracts already provided in the repo:
- DB: `../supabase/schema.sql`
- Loop: `../lib/inngest/analyze-song.ts`
- Scoring worker: `../worker/modal_app.py`
- Env: `../.env.example`

Kickoff: open the repo root in Cursor and follow `docs/PHASE1_CHECKLIST.md`.
