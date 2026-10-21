# Handoff: Cumbre — AI Song Coach (mobile web app)

## Overview
Cumbre is a dark, premium, mobile-first web app that gives musicians an AI "climbing guide"
critique of a song: a 0–100 **summit score**, Music & Lyrics cards, **Top 3 Fixes**, subscores,
extracted features, a **market-fit** benchmark, **mix & master** metrics, comparable artists,
and a **highlight** (the best 15–30s of the track). Tagline: *Get your song to the summit.*

Flow (6 screens):
**Sample/how-it-works → Pay (Stripe) → Upload → Analyzing (ascent) → Report → Build profile.**

## About the design files
The files in this bundle are a **design reference built in HTML** (a single streaming
"Design Component" prototype). They show the intended look, copy, and behavior — **they are
not production code to ship directly.** Your job is to **recreate this UI in the target
codebase's environment** (React/Next, Vue, SwiftUI, native, etc.) using its established
patterns, component library, and design system. If no app exists yet, pick the most appropriate
stack (a React/Next.js + a small API backend is the natural fit) and build it there.

The prototype simulates everything client-side (hardcoded analysis data, a fake "analyzing"
animation, localStorage entitlement, an "I've completed payment" button). Production must
replace those simulations with real services — see **Production integration** below. That is
the bulk of the remaining work; the design/UX itself is final.

## Fidelity
**High-fidelity.** Colors, typography, spacing, motion, and copy are final. Recreate the UI
pixel-accurately, then wire the real backends. Design tokens and per-screen specs are below.

---

## Screens / Views

### 0. Sample / How it works  (entry screen)
- **Purpose:** Show a new user what they get before paying; play two real example reports.
- **Layout:** Single scrolling column, max-width 440px, 26px side padding.
- **Components:**
  - Eyebrow `AI SONG COACH` (Space Mono, 11px, letter-spacing 3px, color `#c98a4e`, uppercase).
  - H1 "See how your song *climbs.*" — Newsreader 39px/500, "climbs." italic with orange→gold
    gradient text fill.
  - Body copy (Hanken Grotesk 14.5px, `#a89a82`).
  - "How it works" — 3 numbered steps (Newsreader gradient numerals, title + note), separated by
    1px hairlines `rgba(246,198,74,0.12)`.
  - **Sample reports** — two cards (Ridge Line, Lantern Pocket), each: mini 180° tick-gauge (score 81 / 66),
    band label, artist · genre meta, a one-line takeaway, and a **▶ Preview** pill that plays the
    track audio (pausing the other). Pill: gold text, 1px gold-30% border, pill radius.
  - Privacy chip (summit-triangle icon + "Your audio is never stored…").
  - Primary CTA "See plans & start climbing →" (orange→gold gradient, dark text) → Pay screen.

### 1. Checkout / Pay
- **Purpose:** Choose a plan and pay before uploading.
- **Components:**
  - Eyebrow `REACH THE SUMMIT`, H1 "Choose your pass".
  - Two selectable plan cards:
    - **Summit Pass** — one-time, $9 ("this song"), feature bullets.
    - **Season Pass** — subscription, $19/mo, "Most popular" ribbon, feature bullets.
    - Selected state: gold inset ring `box-shadow: inset 0 0 0 1.5px #f6c64a` + warm fill.
  - Pay button (anchor): label reflects plan ("Continue — pay $9 once" / "Continue — subscribe $19/mo").
    `href` = the plan's Stripe URL, `target="_blank"`.
  - "Secure checkout powered by Stripe" line.
  - Secondary: "I've completed payment — start climbing" (prototype shortcut) + "Back".

### 2. Upload
- **Purpose:** Add a track, pick genre, tune the analysis.
- **Components:**
  - Upload dropzone (dashed gold-26% border) → loaded state shows filename, size, and a
    decorative waveform.
  - Genre chips (single-select pills; selected = orange gradient).
  - **Tune your climb:** Depth segmented control (Quick read / Deep climb) + Feedback lens
    (Listener / Producer / A&R). Both carry into the report as "Reviewed as …" and Depth changes
    analysis time.
  - Privacy line ("We analyze your track, then delete it — your audio file is never stored.").
  - Primary CTA "Begin ascent →" (enabled once a file is loaded).

### 3. Analyzing / Ascent
- **Purpose:** Progress state while the song is analyzed.
- **Components:** Animated climber dot ascending a mountain ridge (SVG path, JS rAF), a large
  percentage, a progress bar, and 4 staged checklist items (Listening to the mix → Reading the
  lyrics → Charting the melody → Scoring the route) that tick from todo→active→done. Encouraging
  guide copy. Auto-advances to Report on completion.

### 4. Report  (the core deliverable)
Vertical scroll. In order:
1. Header: eyebrow `YOUR ROUTE REPORT`, song title (Newsreader 32px), meta row (genre chip, key,
   BPM, duration), "Reviewed as · {lens} lens · {depth}".
2. **Summit gauge** — 180° tick gauge (46 ticks, lit ticks colored ember→orange→gold by
   position), big score (78), band label (ASCENDING), one-line verdict.
3. **Market fit** card — horizontal bar: your score fill, genre-average dot, chart-ready threshold
   marker; legend "You 78 / Genre avg 71 / Chart-ready 82".
4. **Readiness** — three tiles: Playlist (Ready), Radio (Close), Sync (Ready) with status dots.
5. **How the song climbs** — section energy graph drawn as a mountain area chart; peak flag at
   Chorus 1, dashed "lift" ring at Chorus 2; section labels INTRO·V1·PRE·CH·V2·CH·BR·OUT.
6. **Your highlight** — "best moment" card: timestamp range (1:48–2:12 · 24s), a 56-bar waveform
   with the highlight window lit gold, and a **▶ Play highlight** button that plays only that
   window of the track (clamped via `timeupdate`).
7. **Music / Lyrics** score cards (82 / 74).
8. **What's working (Keep)** — 3 strengths to protect.
9. **Top 3 Fixes** (hero) — ranked, each with title, guide note, and an impact pill (e.g.
   "+6 Music"). (Has a lock-overlay variant for an unpaid teaser — unused in the pay-first flow.)
10. **The full pitch** — Music & Lyrics subscore bars.
11. **Mix & master** — tiles: Integrated loudness (−7.2 LUFS vs −14 target), Dynamic range (DR 8),
    True peak (−0.8 dBTP), Stereo width (78%) + plain-English note.
12. **Climbs alongside** — comparable artist chips + best-fit playlists + core audience.
13. **Extracted features** — 2-col grid: Key, Tempo, Energy, Danceability, Loudness, Valence,
    Time sig, Duration.
14. Footer: "Save my results →" (→ Profile), "Re-climb with these fixes", Export PDF + Share.

### 5. Profile / Summit log
- **Purpose:** Create an account to persist aggregated results across songs.
- **Components:**
  - "Continue with Google" button (neutral light button; **wire to real OAuth**).
  - Divider "or sign up manually".
  - Manual form: Name/artist, Email, Password → "Create my profile".
  - Privacy reassurance ("We keep your scores, fixes and notes… Your audio files are never stored.").
  - Success state: confirmation + a mini "log" card (avg summit, best climb, one logged song) +
    "Climb another track" / "Back to report".

---

## Interactions & behavior
- **Navigation:** internal screen state machine (no router in the prototype — use the target
  app's router). Top-bar back button is context-aware. CTA buttons advance screens.
- **Entitlement:** prototype uses `localStorage['cumbre_unlocked']='1'` and a `?paid=1` URL param
  on return from Stripe. **Production must verify entitlement server-side** (see below).
- **Audio:** sample cards and the report highlight use `<audio>`; only one plays at a time; the
  highlight clamps playback to its window and resets on end.
- **Animation:** ascent is rAF-driven; ambient gl/pulse via CSS `@keyframes`. Respect
  `prefers-reduced-motion` in production.
- **Export PDF:** calls `window.print()` (replace with a real report export if desired).

## State management
Prototype state (recreate as app state/store): `screen`, `genre`, `fileLoaded`, `progress`,
`plan` (summit|season), `unlocked`, `depth` (fast|deep), `lens` (listener|producer|ar),
`playing` (which audio), `highlightPlaying`, profile fields. Replace the hardcoded report content
with data fetched from the analysis API (see contract).

## Design tokens
- **Background:** page `#0d0a06`; app gradient `#1c140b → #130d07 → #0c0905`.
- **Surfaces:** card fills `rgba(255,255,255,0.022)`; warm card gradients over
  `rgba(232,85,45,0.10–0.16)`. Hairline/border `rgba(246,198,74,0.10–0.22)`.
- **Text:** primary `#f7efe2` / `#f3ece0`; muted `#a89a82` / `#9a8b71`; faint `#7f7259` / `#6f6450`.
- **Accents:** ember `#e8552d`, orange `#fb7a3c`, gold `#f6c64a`, amber `#d99a4a`.
  Primary gradient `linear-gradient(135deg,#e8552d,#fb7a3c,#f6c64a)`. Gauge ticks interpolate
  ember→orange→gold by position.
- **Type:** Newsreader (serif headlines/numerals), Hanken Grotesk (body/UI), Space Mono
  (labels/data, uppercase + letter-spacing). All from Google Fonts.
- **Radius:** chips/pills 999px; cards 13–22px; inputs 13px. **Shadows:** warm orange glows,
  e.g. `0 12px 32px -10px rgba(251,122,60,0.6)`.
- **Score bands:** <60 Base camp · 60–79 Ascending · 80+ Summit.
- **Frame:** mobile-first, content max-width 440px, full-height column.

## Assets
- `assets/*.mp3` — design-handoff reference only. Those recordings are not in the repo.
  The app ships original clips at `web/public/samples/ridge.wav` and `lantern.wav`.
- These are the user's uploaded sample tracks. **Confirm licensing/rights before using public
  previews in production**; otherwise swap for cleared/owned demo clips.
- No raster images or icon fonts: all marks (summit triangle, gauges, ridge, waveform, energy
  graph) are inline SVG/CSS and should be recreated as components.

---

## Production integration (the remaining work)

> The user wants to "move to production and assign server and Stripe URLs." Everything below is
> what makes that real. Treat the data contract in `analysis-contract.json` as the source of truth
> for the Report screen.

### A. Configuration (server + Stripe URLs)
The prototype exposes these as component props (also the editor "Tweaks"):
- `oneTimeUrl` — Stripe URL for the one-time Summit Pass.
- `subscriptionUrl` — Stripe URL for the Season Pass subscription.
In production, move these to environment config (e.g. `NEXT_PUBLIC_STRIPE_ONETIME_URL`,
`NEXT_PUBLIC_STRIPE_SUB_URL`, `API_BASE_URL`) — do **not** hardcode. Add `API_BASE_URL` for the
analysis/auth backend.

### B. Stripe (payments)
- Simplest: **Stripe Payment Links** (one for the one-time price, one for the recurring price);
  set each link's success URL to return to the app with `?paid=1` (or `?checkout=success`).
- Better/long-term: **Checkout Sessions** created server-side + **webhooks**
  (`checkout.session.completed`, `customer.subscription.*`) to fulfill and persist entitlement.
- **Verify webhook signatures.** Grant access server-side; never trust the client/localStorage.
- Map products: Summit Pass = one-time entitlement for one analysis; Season Pass = active
  subscription = unlimited analyses. Enforce on the analysis endpoint.

### C. Analysis backend
- `POST /analyze` (multipart audio + `{ genre, depth, lens }`) → returns the JSON in
  `analysis-contract.json`. Replace every hardcoded number on the Report with these values.
- The "Analyzing" screen should reflect real progress (poll a job or stream SSE) rather than a
  fixed timer.
- Feature extraction (key, BPM, LUFS, true peak, dynamic range, stereo width, energy/valence,
  section/structure energies) is standard MIR work (e.g. librosa/Essentia or a vendor API).
  Scores, fixes, market-fit, comparables, and copy are the LLM/A&R layer on top.

### D. Highlight (best 15–30s)
- Backend returns `highlight.startSec` / `endSec` (and an optional label). The player streams the
  user's track and clamps to that window. Prototype hardcodes `HL_START=108`, `HL_END=132`,
  `SONG_LEN=204` — drive these from the response and the real audio duration.

### E. Auth + profile (aggregated results)
- Replace simulated `googleSignIn` with real **Google OAuth**; replace the manual form with real
  signup (validate + hash passwords or use a managed auth provider).
- Persist per-user **scores, fixes, notes, and song log** server-side (the "summit log"). The
  audio file itself must **not** be persisted (see F).

### F. Zero-storage privacy (legal-sensitive)
- The UI promises in multiple places that the **audio file is never stored** ("we analyze your
  track, then delete it"). Production must actually **stream-and-discard**: process in memory /
  ephemeral storage and delete immediately; keep only derived scores/metadata.
- Make the privacy policy / ToS match this claim. If you cannot guarantee it, change the copy.

### G. Hardening checklist
- [ ] **Uploads:** enforce type allow-list (mp3/wav/flac/aac/m4a/ogg), max size, max duration;
      validate server-side; scan/transcode safely; use signed/expiring URLs if you buffer.
- [ ] **AuthZ:** gate `/analyze` and result endpoints behind auth + entitlement; rate-limit.
- [ ] **Stripe:** webhook signature verification; idempotency; reconcile subscription state.
- [ ] **Entitlement source of truth = server**, not `localStorage`/`?paid=1`.
- [ ] **Errors/edge states:** upload failure, unsupported file, analysis failure/timeout, payment
      failure/cancel, expired subscription, empty library. The prototype omits these.
- [ ] **Accessibility:** keyboard focus order, visible focus rings, ARIA on the gauge/charts and
      audio controls, color-contrast pass, `prefers-reduced-motion` for the ascent/pulses.
- [ ] **Responsive:** prototype is 440px mobile; add tablet/desktop layouts as needed.
- [ ] **Performance:** lazy-load audio (`preload="none"`/`metadata`), code-split the report.
- [ ] **Analytics/observability:** funnel events (sample→pay→upload→report→profile), error logging.
- [ ] **Legal:** Privacy Policy, ToS, cookie/consent, and the "never stored" guarantee.
- [ ] **Secrets/env:** Stripe keys, OAuth secrets, API keys in env/secret manager — never client.
- [ ] **Testing:** unit (scoring mappers), integration (Stripe webhooks), e2e (full flow).

## Files
- `Cumbre.dc.html` — the full prototype (all 6 screens + logic). Open in a browser to interact.
  The markup is between `<x-dc>…</x-dc>`; the logic is the `class Component` script block. Treat
  both as reference for layout, copy, tokens, and behavior.
- Design-handoff mp3s are not shipped. Public previews are `web/public/samples/ridge.wav` and `lantern.wav`.
- `analysis-contract.json` — the data shape the Report expects from `/analyze`. Align backend +
  frontend to this.
- `support.js` — prototype runtime (NOT for production; the component framework that renders the
  `.dc.html`). Included only so the prototype runs locally.
- `screenshots/` — reference captures of every screen (sample, checkout, upload, analyzing, report
  top/climb+highlight/fixes/mix+comparables, profile form + saved state). Use these for visual
  fidelity when recreating the UI.
