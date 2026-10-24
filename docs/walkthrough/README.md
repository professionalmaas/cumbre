# Walkthrough

The local build, clicked through end to end on October 24, 2026, at phone width. Every image is a real screenshot taken by `web/scripts/verify-local-loop.mjs`. [`index.html`](index.html) is the same walkthrough as one self-contained page.

| Step | Screen | What happens |
| --- | --- | --- |
| 1 | [Home](01-home.jpg) | The pitch, the twelve holds the rubric scores, and two demo tracks with playable previews. No account needed. |
| 2 | [Sample report](02-sample-report.jpg) | A finished report: summit gauge, market fit, energy map, highlight with playback, Music and Lyrics grades, three things that work, the top three fixes, every subscore, mix and master readings, comparables, extracted features. |
| 3 | [Upload](03-upload.jpg) | Drop a track, pick the genre, the depth and the feedback lens, confirm the rights. |
| 4 | [Analyzing](04-analyzing.jpg) | The engine runs. Locally the Python worker runs inline; in production it is a Fargate task behind Step Functions. The page polls the job row and flips on its own. |
| 5 | [Teaser (production)](05-teaser-production.jpg) | In production every run yields a teaser; the full report sits behind one credit or a season pass. Locally the entitlement is auto-granted and this step is skipped. |
| 6 | [Full report](06-full-report.jpg) | Your own track, scored. The highlight plays your upload from memory during the session; the file itself is deleted after analysis. |
| 7 | [Share](07-share.jpg) | A public summit card per result, with an Open Graph image. |
| 8 | [Plans](08-plans.jpg) | Summit Pass ($9, one report) and Season Pass ($19 a month). Stripe hosted; not connected locally. |

## Reproduce it

```bash
node scripts/local.mjs                 # terminal 1: database, worker deps, app on :3000
cd web && npx playwright install chromium && npm run verify:local   # terminal 2
```

The script prints one line per check and writes its screenshots to `web/.verify/`.
