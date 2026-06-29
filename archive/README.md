# Cumbre archives

Read-only snapshots of work that is **not** on the live deploy path (`web/`, `worker/`, `.github/workflows/deploy.yml`).

## Fame-blind ML lineage (pre–AWS deploy)

| Location | What |
|----------|------|
| Branch **`archive/fameblind-prd`** | Full GitHub PRD as of 2026-06-29 (`dad5693`) — zip foundation, doctor scripts, `enrich_popularity.py`, training pipeline. |
| Folder **`archive/fameblind/`** | Same unique artifacts copied here for browse-without-checkout. |

```bash
git fetch origin
git checkout archive/fameblind-prd   # full frozen tree
# or browse archive/fameblind/ on PRD
```

Live site and deploy CI use **PRD** at repo root (`ml/` engine for scoring only; training helpers live under `archive/` or the archive branch).
