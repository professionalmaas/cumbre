# Brain Enhancements — making the next Cumbre a point-and-shoot build

> Strategy doc. Recommends concrete additions to Christopher's own Cursor "brain"
> ecosystem (certus-brain skills, agents/subagents, hooks, plugins, memories) so that
> building a **consumer SaaS app like Cumbre** becomes reproducible, efficient, cost-mindful,
> lower-error, and hardened.
>
> Reference build throughout: **Cumbre** (AI song-coach — Next.js on ECS Fargate + dedicated
> Cognito pool + RDS Postgres + S3 + Step Functions + a Fargate worker wrapping a Python ML
> engine + an A&R layer + pay-first Stripe). See `docs/AWS_ARCHITECTURE.md`,
> `docs/AWS_RUNBOOK.md`, `docs/DEPLOY.md`, `docs/Cumbre_Build_Spec.md`.
>
> This is research + recommendations only — no code/Terraform changes proposed here are applied.

---

## 0. The thesis

Cumbre was built **twice in one day**: once as the spec's Supabase/Inngest/Modal stack, then
re-platformed AWS-native. That re-platform is exactly the kind of redo this doc is designed to
eliminate. The certus-brain ecosystem already nails the **data platform factory** (medallion,
dbt, Snowflake, pipeline-factory-orchestration). It does **not yet** have an equivalent factory
for **consumer-facing transactional SaaS** — the Cumbre shape: pay-first auth, async ML worker,
durable workflow with a human gate, and an LLM judgement layer. The gap is a small number of
**named, triggerable skills + a couple of agents + a few hooks** that turn "design → prod" from a
bespoke effort into a repeatable pipeline.

Christopher's own stated standard (memory `feedback-approach`): *"Harden ad-hoc fixes into
version-controlled standards, then verify they fire."* This doc applies that standard to the
Cumbre build itself.

---

## 1. Inventory — what exists now

### Custom subagents (`~/.claude/agents/`)
| Agent | Writes? | Role |
|---|---|---|
| `prod-launch-auditor` | read-only | PRR before first deploy; READY / ordered BLOCKERS / verdict. Pairs with `/go-live`. |
| `aws-platform-hardener` | Terraform | Applies A/B/C hardening + deploy-safety set to ECS/ALB/Cognito stacks. |
| `design-to-prod` | code+TF | Turns a designed app into a deployable service on the shared platform (container, module call, root CI, LAUNCH.md). Does **not** apply/push. |

### Global skills (`~/.claude/commands/`)
`/aws-prod-scaffold`, `/add-monitoring`, `/snowflake-route`, `/deploy-ready`, `/cognito-user`,
`/aws-cost-check`, `/go-live`, `/new-app`. (Plus the harness skills: `deep-research`, `verify`,
`code-review`, `update-config`, etc.)

### certus-brain skill library (`certus-home\brain\plugins\certus-brain\skills\`)
~55 SKILL.md standards, brain-router for first-load. Strong in: medallion-architecture, dbt-*
(model/testing/macros/replication), snowflake-* (sql/cost/rbac/git-deploy), ml-model-build-standards,
pipeline-factory-orchestration, the runtime skill, lean-platform-efficiency,
git-deploy-guardrails (O-15), targeted-llm-text-analytics, app-backend-mysql-snowflake-pipeline,
marketing-frontend-* (design handoff to the backend), naming-conventions, observability-and-runbooks.
**Gap:** no consumer-SaaS app factory; no "analysis contract → UI" standard; no "LLM judgement layer in
an app worker" standard; the app/AWS factory lives in **global commands + agents**, not in the
brain library (so it's not discoverable via brain-router or progressive disclosure).

### Hooks (git guardrails, version-controlled in `.githooks/` of home & certus-home)
`pre-commit` (junk-file guard: blocks `.claude/`, write-probe files, direct main/master commits),
`pre-push` (deploy-target allowlist, main/master + force-push block), `secret-scan.sh` (warn-only,
wired into pre-commit), certus-development other-team write-lock. **All are git-stage hooks.** There
are **no agent lifecycle hooks** (`settings.json` `hooks`) — no PreToolUse/PostToolUse/Stop
gates. `~/.claude/settings.json` is near-empty (theme + one bash allow). **Cumbre itself has no
`.githooks/`** — it's standalone and inherits none of the guardrails.

### Memories (`~/.claude/projects/.../memory/`)
`user-profile`, `feedback-approach`, `custom-subagents`, `global-skills-reference`,
`go-live-standard`, `prod-pipeline-patterns`, `alb-oidc-albeast`, `git-deploy-guardrails-standard`,
`cumbre-phase1`, plus Certus data-platform memories. Good coverage of *preferences* and *AWS
patterns*; **no "consumer SaaS app conventions" memory**, and the Cumbre memory is a status log, not
a reusable convention set.

---

## 2. New / updated SKILLS

Author these as certus-brain skills (so brain-router and progressive disclosure surface them) using
the existing `skill-authoring` + `skill-template` standards. Each is **metadata-only at rest** — the
body and bundled templates load just-in-time, so they cost ~0 tokens until triggered (Anthropic
"Agent Skills" progressive-disclosure model).

| Skill | Trigger (one line) | What it standardizes | Effort | Payoff |
|---|---|---|---|---|
| **`consumer-saas-app-factory`** | "build a consumer app / pay-first SaaS / app with signup + async job + Stripe" | The whole Cumbre shape end-to-end: design-handoff → contract → Next.js (App Router) + **dedicated** Cognito pool (self-signup, Lite tier) + RDS + S3 presigned + Step Functions durable loop + Fargate worker (`waitForTaskToken`) + pay-first Stripe credit ledger → deploy. Encodes the **decision records** that caused the Cumbre redo (dedicated vs shared Cognito; in-app authz on `sub` vs RLS; SFN vs Inngest). Routes to the existing agents. | **L** | Highest — kills the re-platform redo; one trigger reproduces a proven architecture. |
| **`analysis-contract-to-ui`** | "build the UI from the analysis/result contract" / "contract-first results page" | The contract-first pattern Cumbre used (`docs/analysis-contract.json` → typed report renderer). Standardizes: a single JSON contract is the source of truth for worker output **and** the UI; field names/enums/nesting match exactly (camelCase); a `sample` fixture renders the page with zero backend. Prevents the "column doesn't exist → silent sample fallback" class of bug (`feedback-approach`). | **M** | Eliminates frontend/worker drift; makes the results screen testable before any deploy. |
| **`ar-llm-layer`** | "add an LLM judgement layer to a worker/route" / "structured output with fallback" | The exact pattern in `worker/cumbre_report.py`: a **structured-output** LLM call (`claude-haiku-4-5`) for judgement fields the deterministic engine can't infer, with a **deterministic heuristic fallback** when the key is absent or the call fails — *never crashes the worker*. Standardizes: model tiering (Haiku for high-volume judgement, escalate only on low confidence), JSON-schema/tool-use output, prompt-caching the static system+rubric prefix, a golden-set eval before trusting it, and the positioning guardrail (no user-facing "hit probability"). Cross-links `targeted-llm-text-analytics`. | **M** | Reusable money-and-quality-critical pattern; bakes in cost control (Haiku + caching) and resilience (fallback). |
| **`pay-first-stripe-credits`** | "pay before the work / Stripe credit ledger / idempotent charge" | Cumbre's money-safety contract: entitlement = active sub OR credit≥1; charge is **idempotent** (Stripe idempotency key = jobId; unique index on `credit_ledger(job_id)`); charge happens **only after** moderation+fingerprint+success; behind a kill switch; webhook signature verified + event-id dedupe. | **M** | Money-safety is the highest-blast-radius area; one standard removes a whole bug class. |
| **`durable-job-with-human-gate`** | "async job / Step Functions loop / human review queue / task token" | The SFN-Standard + Lambda steps + Fargate `waitForTaskToken` + `review_queue` escalation pattern (copyright/abuse/low-confidence/OOD/drift). Standardizes ASL↔Terraform `templatefile` var alignment (a thing Cumbre had to verify by hand) and the terminal-vs-resumable review states. | **M** | Reproduces the hardest-to-get-right part of Cumbre; the ASL/TF alignment check alone prevents a deploy failure. |

> **Also:** promote the **global app commands into brain skills** (or at least register them in
> `brain-router`) so `/aws-prod-scaffold`, `/new-app`, `/go-live` are discoverable the same way the
> data skills are. Right now a fresh session only finds them via the `global-skills-reference`
> memory. **Effort S, payoff M.**

---

## 3. New / updated AGENTS & SUBAGENTS

Design rule (from Anthropic's subagent/context-engineering guidance): a subagent runs in its **own
context window** and returns only a summary, so the orchestrator's window stays clean. Use subagents
for **(a) fan-out search/audit that would flood the main window**, and **(b) specialized writers**
whose intermediate file-reads you don't want to keep.

| Agent | Writes? | Role & when | Effort | Payoff |
|---|---|---|---|---|
| **`consumer-saas-design-to-prod`** (variant of `design-to-prod`) | code+TF | Same job as the existing agent but knows the **consumer** profile cold: dedicated self-signup Cognito (not the admin/TOTP/PLUS shared pool), in-app authz on Cognito `sub`, RDS, S3 presigned, SFN+worker, pay-first Stripe. Prevents re-deriving the Cumbre decision records each time. | **M** | The Cumbre re-platform encoded once; next consumer app skips it. |
| **`worker-ml-ar-builder`** | code | Builds the Fargate worker that wraps an owned ML engine + an LLM A&R layer: `aws_entry.py` (`waitForTaskToken` read/`SendTaskSuccess`), engine reuse (no rewrite — Cumbre rule #6), the `ar-llm-layer` structured-output+fallback, S3 model-artifact load, Dockerfile. | **M** | The worker is the novel, error-prone surface; this makes it a template. |
| **`web-resilience-hardener`** | code | App-layer counterpart to the infra `aws-platform-hardener`: verifies presigned-URL flows, idempotent webhook handlers, kill-switch wiring, in-process TTL caches on every external-data route (`feedback-approach`), graceful SIGTERM, `output:'standalone'`. Read-then-edit. | **M** | Catches the app-code blockers the infra hardener can't see. |
| **`cost-auditor`** (read-only) | no | Static pass before deploy: flags Fargate sizing/always-on tasks vs scale-to-zero, missing AWS Budget hard-stop, NAT vs VPC-endpoint egress, RDS single-AZ always-on, **and LLM cost** (model tier, missing prompt-cache on a static prefix, un-batched calls). Complements `/aws-cost-check` (which reads the live bill) by auditing the *design* pre-spend. | **S** | Cost-mindfulness moved left, before money is spent. |

**Fan-out vs single:** keep the **happy-path build single-agent** (the orchestrator drives
scaffold → worker → infra sequentially — they share state). **Fan out** for the independent,
read-heavy phases: run `prod-launch-auditor` + `cost-auditor` + `web-resilience-hardener`'s
read pass **in parallel** at the pre-deploy gate, each returning a short verdict. **Keep output out
of the main window:** auditors are read-only and return a ranked blocker list, not file dumps;
writers report "what changed per file" summaries (the existing agents already do this). Use a
worktree (`isolation: worktree`) for a writer agent when you want its edits isolated until reviewed.

---

## 4. HOOKS

Two layers: **git-stage hooks** (already strong — extend) and **agent lifecycle hooks**
(`settings.json` `hooks` — currently absent, biggest opportunity). Lifecycle hooks are deterministic
gates the harness runs; exit code `2` on a `PreToolUse` hook **blocks** the tool call and feeds
stderr back to the model (Anthropic hooks reference).

| Hook | Type / event | What it does | Effort | Payoff |
|---|---|---|---|---|
| **build-must-be-green gate** | `PreToolUse` on `Bash` matching `git commit`/`git push` (or `Stop`) | Runs `web` `next build` (or `tsc --noEmit`) + `steps` typecheck/bundle; blocks commit if red. Encodes Cumbre's actual verify steps so "build green" can't be skipped. | **S** | Directly attacks the redo problem — no broken commit reaches the repo. |
| **pre-build verify** | `UserPromptSubmit` or a `/verify` skill the agent must run | Before claiming done: lint + typecheck + (where possible) a live happy-path fetch, per `feedback-approach` ("test with live data, not just build success"). | **S** | Turns "looks done" into "proven done." |
| **secret-scan (promote to blocking)** | `PreToolUse` on `Write`/`Edit` **and** keep the git `secret-scan.sh` | Today's `secret-scan.sh` is **warn-only** at commit. Add a `PreToolUse` scan that **blocks** writing `AKIA…`, PEM blocks, `STRIPE_SECRET`, `sk-…`, JWT secrets into tracked files; require Secrets Manager. | **S** | Secret hygiene enforced at write time, not after it's staged. |
| **junk-file guard → Cumbre** | git `pre-commit` (existing) | Install the existing `.githooks` guard set into Cumbre (it has none). Add `.tfvars`/state/`.env` to its ignore+block list. | **S** | Cumbre currently has zero guardrails; this closes that. |
| **cost / token guard** | `PreToolUse` on the Agent tool / `SessionStart` | Soft reminder when spawning many subagents or about to run an expensive batch; surface the model tier in use. Pair with a `SessionStart` note of the context budget. | **S** | Keeps cost discipline visible in-loop. |
| **context-budget reminder** | `PreCompact` / `SessionStart` | On `PreCompact`, ensure decision records are written to memory before history is summarized (so compaction doesn't lose the "why dedicated Cognito" type facts). | **S** | Prevents losing load-bearing context across long builds. |

> Adversarial-verify every hook (Christopher's own standard): run the **bad** case (blocked), the
> **good** case (allowed), and the **bystander** case (unaffected) before trusting it.

---

## 5. MEMORIES

Conventions that make rebuilds faster and reduce redos. Keep each memory **under ~200 lines**
(Anthropic loads the first 200 lines / 25KB of `MEMORY.md` at startup; topic files load on demand).

1. **`consumer-saas-conventions`** (new, type: reference) — the durable decisions, not the status:
   dedicated self-signup Cognito for consumers vs the admin shared pool; in-app authz on `sub`;
   pay-first entitlement = active sub OR credit≥1; idempotent charge keyed on jobId; contract-first
   UI; worker does heavy ML off the web task; LLM layer = Haiku + deterministic fallback. This is the
   *generalized* version of `cumbre-phase1` and is what a new app should read first.
2. **`feedback-approach`** (extend) — add the lessons this build surfaced: "design the contract
   before the screen," "the worker, not the route, runs heavy/LLM work," "model-tier by default to
   Haiku, escalate on low confidence."
3. **Project memories: status vs convention.** Keep `cumbre-phase1` as the *status log* (what's
   built / what's pending), but move the *reusable decisions* into `consumer-saas-conventions`. A
   project memory should answer "where is this and what's left"; a reference memory answers "how do
   we always do this."
4. **Memory vs skill discipline** — facts needed *every* session → memory; multi-step *procedures*
   → skills (loaded only when triggered). Don't put the app-factory steps in memory; put the
   *trigger to load the skill* in `global-skills-reference`.
5. **Cross-link** new memories to `prod-pipeline-patterns`, `alb-oidc-albeast`, `go-live-standard`
   so brain-router/`[[wikilinks]]` chain them.

---

## 6. Reproducible "point-and-shoot" pipeline

The end-to-end loop, each step mapped to a skill/agent/hook. Human touchpoints (keys, money,
DNS) are **isolated to one stage** so the rest is automatable.

```
1. SPEC + CONTRACT
   → skill: consumer-saas-app-factory (kickoff) + analysis-contract-to-ui
   → output: app spec + the single JSON contract (worker output == UI input)
   human: none (review only)

2. SCAFFOLD (web + Cognito + RDS + S3 + Stripe shells)
   → agent: consumer-saas-design-to-prod   (writes container, module call, root CI)
   → skill: pay-first-stripe-credits, /aws-prod-scaffold
   human: none

3. WORKER + LLM LAYER + DURABLE LOOP
   → agent: worker-ml-ar-builder  + skill: ar-llm-layer, durable-job-with-human-gate
   → reuse owned ml/ engine (never rewrite); ASL↔TF templatefile var check
   human: none

4. VERIFY (gate — fan out in parallel, each returns a short verdict)
   → hook: build-must-be-green + pre-build verify
   → agents (parallel): prod-launch-auditor + cost-auditor + web-resilience-hardener
   human: none

5. DEPLOY  ← the ONE human stage (keys/money/DNS)
   → runbook: docs/AWS_RUNBOOK.md / DEPLOY.md ; skill: /go-live, /new-app
   human: tf-state bucket, terraform.tfvars secrets (Stripe/OpenAI/ACRCloud/session),
          GitHub prd Environment + AWS role secrets, two-pass apply, model upload, ACM cert
   (everything else above this line is point-and-shoot)

6. AUTOMATED FEEDBACK + IMPROVE
   → live happy-path fetch (feedback-approach) ; capture user feedback for active learning
     (Cumbre's loop already does this) ; cost-auditor + /aws-cost-check post-deploy
   → loop back: a redo becomes "re-run skill", not "re-derive architecture"
```

The win: stages 1–4 are reproducible from skills+agents+hooks; stage 5 is the **only** place a human
must supply secrets/money/DNS, and it's already documented in `AWS_RUNBOOK.md`.

---

## 7. Cost & context discipline

Concrete levers and where each applies in this flow (grounded in Anthropic's prompt-caching,
pricing, and context-engineering docs):

| Lever | Where it applies | Mechanism |
|---|---|---|
| **Prompt caching** | `ar-llm-layer` A&R calls; long-running build sessions | Mark the **static prefix** (system prompt + rubric + contract schema + few-shot) with `cache_control:{type:"ephemeral"}`; only the per-song features change. Cache read ≈ 0.1× input. Per-song judgement on Cumbre is the textbook case — same rubric every call. |
| **Model tiering** | LLM layer = **Haiku 4.5** ($1/$5 MTok) for per-song judgement; **Opus** only for architecture/planning; agents already set `model: sonnet` | Default high-volume judgement to Haiku; escalate to a bigger model **only** on low confidence (Cumbre routes sub-0.70 to review anyway). |
| **Batch API (50% off)** | Offline fame-blind training, bulk re-scoring, eval golden-sets | Non-time-sensitive bulk → Batch API; stacks with caching. |
| **Background / async agents** | the parallel verify gate (step 4); scheduled `/aws-cost-check` | Run auditors in background subagents; schedule the cost check (mcp scheduled-tasks / `/loop`) instead of ad-hoc. |
| **Progressive disclosure** | the whole skill library | Author the new skills as metadata-light SKILL.md with bundled templates loaded on demand — they cost ~0 tokens until triggered. Move long reference out of AGENTS.md into skills. |
| **Sub-agent context isolation** | search/audit fan-out | Read-heavy work (auditing TF, searching the repo) runs in a subagent's own window and returns a summary — keeps the orchestrator window lean (`the runtime skill` already says this). |
| **Compaction + note-taking** | long multi-hour builds (Cumbre was a full day) | Write decision records to `consumer-saas-conventions` memory **before** `/compact` (the PreCompact hook in §4) so the "why" survives. |

---

## 8. HARDENING

A short, enforceable definition-of-done. Most controls already exist as agents/skills; the gap is
**making them a gate, not a suggestion.**

**Security**
- ALB-OIDC fully verified (signature + signer ARN + fail closed) **if** the app trusts the header —
  ALBeast (`alb-oidc-albeast`). Cumbre uses in-app Cognito OIDC: verify ID token (sig, `iss`, `aud`,
  `exp`) against JWKS, fail closed.
- Every route injects identity server-side from the session `sub`; no client-supplied tenant IDs.
- Secrets only in Secrets Manager, injected as ECS `secrets` — never in image/`environment`.
  (Enforced by the §4 secret-scan PreToolUse hook.)
- Private subnets, `assign_public_ip=false`, VPC endpoints, WAF + alarms (`aws-platform-hardener`,
  `/add-monitoring`).

**Money-safety**
- Idempotent charge (idempotency key = jobId; unique DB index); charge **after** success; kill
  switch; webhook signature verify + event-id dedupe (`pay-first-stripe-credits`).

**Secret hygiene**
- Cumbre gets the `.githooks` guard set (it has none today). `.tfvars`/state/`.env` git-ignored;
  `*.tfvars.example` kept.

**Error reduction**
- Contract-first (`analysis-contract-to-ui`) kills frontend/worker drift.
- LLM layer never crashes the worker (deterministic fallback).
- Live-data verify, not build-only (`feedback-approach`).
- ASL↔Terraform var alignment checked (`durable-job-with-human-gate`).

**Definition of Done (gate before "ship")**
1. `next build` + steps typecheck/bundle green (build-must-be-green hook).
2. Live happy-path fetch returns real data (`source:'live'`), not sample fallback.
3. `prod-launch-auditor` verdict = SAFE TO LAUNCH (0 blockers).
4. `cost-auditor` = no always-on/un-capped spend; AWS Budget hard-stop present.
5. No secret in any tracked file (secret-scan clean).
6. Money path: idempotent charge + kill switch + webhook dedupe verified.
7. Decision records written to memory (survives compaction).

---

## 9. Top 5 quick wins (do these first)

1. **`build-must-be-green` PreToolUse hook** (S) — blocks any commit/push when `web` build or
   `steps` typecheck is red. Directly kills the most common redo. *Highest payoff per hour.*
2. **Install the `.githooks` guard set into Cumbre** (S) — it's a standalone repo with **zero**
   guardrails today; copy the home/certus-home pre-commit/pre-push + secret-scan and add
   `.tfvars`/state to the block list.
3. **Write the `consumer-saas-conventions` memory** (S) — capture the Cumbre decision records
   (dedicated Cognito, in-app authz on `sub`, pay-first entitlement, idempotent charge, contract-first,
   Haiku+fallback) so the next consumer app reads them instead of re-deriving them.
4. **Author `ar-llm-layer` skill** (M) — generalize `worker/cumbre_report.py`'s structured-output
   + deterministic-fallback + Haiku + prompt-cache pattern; the single most reusable, cost-and-quality
   -critical piece, and it doubles as the cost lever.
5. **Author `consumer-saas-app-factory` skill + register the global app commands in brain-router** (M)
   — one trigger that reproduces the Cumbre architecture and routes to the existing agents; makes the
   app factory as discoverable as the data factory already is.

---

## Sources

Official model documentation consulted (2026):
- Effective context engineering for AI agents — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Subagents (context isolation, orchestrator-worker) — https://code.claude.com/docs/en/subagents
- Agent SDK overview (subagents, async, headless) — https://code.claude.com/docs/en/agent-sdk/overview
- Hooks reference (event names, exit-code/decision gating) — https://code.claude.com/docs/en/hooks
- Hooks guide (lint/test/secret-scan gating use cases) — https://code.claude.com/docs/en/hooks-guide
- Extend the model with skills (SKILL.md, progressive disclosure) — https://code.claude.com/docs/en/skills
- Memory & AGENTS.md (hierarchy, imports, auto-memory limits) — https://code.claude.com/docs/en/memory
- Prompt caching (`cache_control`, ephemeral TTL, cache-read pricing) — https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Pricing & models (Haiku/Sonnet/Opus tiers, Batch API 50%) — https://platform.claude.com/docs/en/about-claude/pricing
- Headless mode (`headless`, automation/CI) — https://code.claude.com/docs/en/headless-mode

Local sources: `cumbre/AGENTS.md`, `cumbre/docs/AWS_ARCHITECTURE.md`, `worker/cumbre_report.py`,
`Projects/AGENTS.md`, `~/.claude/agents/*`, certus-brain skill catalog, and the memory set
(`user-profile`, `feedback-approach`, `cumbre-phase1`, `custom-subagents`, `global-skills-reference`,
`git-deploy-guardrails-standard`).
