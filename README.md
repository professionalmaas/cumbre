# Cumbre

Get your song to the summit. Upload a track and get a fame-blind craft grade for music and lyrics, plus the top 3 fixes. No Spotify API. No rented model weights. The score comes from an owned feature pipeline. An optional language-model layer writes the notes, and a deterministic heuristic covers the same fields when no API key is set.

This is a portfolio build. It runs on your machine. It does not call a hosted account, and it cannot spend anyone else's cloud budget.

## Run it

You need Docker, Node 20+, and Python 3.10+.

```bash
cd web
npm install
# PowerShell
Copy-Item ..\.env.dev.example .env.local
# macOS or Linux
# cp ../.env.dev.example .env.local
npm run dev:all
```

Open http://localhost:3000 and choose **Continue as dev user**.

1. Play the two demo clips on the home page.
2. Open a sample report and play the highlight.
3. Open Plans. Checkout is not connected, so nothing is charged.
4. Upload `web/public/samples/ridge.wav`, tick the rights box, and watch a real report come back.

Step 4 needs `pip install -r worker/requirements.txt`. Leave `ANTHROPIC_API_KEY` empty. The notes then come from the heuristic in `worker/cumbre_report.py`. The loop is written out in `dev/README.md`.

`DEV_MODE` is forced off when `NODE_ENV=production` or the process is on ECS. A deploy cannot accidentally skip auth and billing.

## What you are looking at

| Layer | Where | What it shows |
|---|---|---|
| Product UI | `web/` | Next.js app. Local auth is a stub user. |
| Report contract | `docs/analysis-contract.json` | The shape the report screen renders. |
| Feature engine | `ml/` | Fame-blind audio and lyric features. Tests live in `ml/test_cumbre.py`. |
| Worker | `worker/cumbre_report.py` | Merges features, an optional model file, and the written notes. |
| Local harness | `dev/` | Docker Postgres, local files instead of S3, the worker inline instead of Step Functions. |
| Production shape | `infra/terraform/`, `docs/AWS_ARCHITECTURE.md` | The same loop on ECS, Cognito, RDS, S3, and Step Functions. Identifiers in that folder are examples. |

## Principles

Upload only. Lyrics are scored and not kept. No hit-probability is shown. A charge happens only after a clean analysis, and it is idempotent. The model weights are owned.
