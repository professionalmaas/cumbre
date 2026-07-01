# ── Stage 1: deps ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install only production-shaping deps (package-lock.json respected)
COPY package.json package-lock.json ./
RUN npm ci --frozen-lockfile

# ── Stage 2: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next build reads NEXT_PUBLIC_* at build time only, and inlines them into statically
# generated pages (canonical/OG metadata included). Pass the public site URL as a build-arg
# so SSG pages bake the real domain, not a fallback. Defaults to the prod domain so a plain
# `docker build` is still correct; CI can override with --build-arg for another environment.
# Runtime secrets are injected by ECS at task start — never bake them.
ARG NEXT_PUBLIC_SITE_URL=https://getcumbre.com
ARG NEXT_PUBLIC_APP_URL=https://getcumbre.com
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: runner (production) ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# PORT and HOSTNAME are injected by the ECS task definition (module sets them).
# Default them here for local docker run.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Standalone output — only what the server needs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static assets (JS, CSS, images) — served by the standalone server
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Public assets (favicon, robots.txt, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# next.js standalone ships server.js at the root
CMD ["node", "server.js"]
