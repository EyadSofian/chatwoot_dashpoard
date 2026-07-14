# ─────────────────────────────────────────────────────────────────────────────
# Multi-stage build for Next.js (standalone) + Prisma.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* .npmrc* ./
COPY prisma ./prisma
RUN npm ci || npm install

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Prisma CLI ───────────────────────────────────────────────────────────────
# A self-contained install, purely so `prisma migrate deploy` can run at boot.
#
# We can't just copy node_modules/prisma + node_modules/@prisma out of the
# builder: the CLI's real dependency tree reaches beyond them. `prisma` needs
# `@prisma/config`, which needs `effect`, `c12`, `deepmerge-ts`, `empathic` —
# and npm hoists those to the TOP of node_modules, outside both directories.
# Cherry-picking paths meant `Cannot find module 'effect'` at container start.
#
# Letting npm resolve the tree here keeps this correct across Prisma upgrades
# instead of hard-coding today's transitive deps. Pinned to the lockfile's
# version so the CLI always matches the generated client.
FROM node:20-alpine AS prismacli
WORKDIR /cli
RUN apk add --no-cache openssl
COPY package-lock.json ./
RUN PRISMA_VERSION="$(node -p "require('./package-lock.json').packages['node_modules/prisma'].version")" \
 && rm -f package-lock.json \
 && npm init -y > /dev/null \
 && npm install --omit=dev --no-audit --no-fund "prisma@${PRISMA_VERSION}"

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Migration SQL + schema (`migrate deploy` reads prisma/schema.prisma from CWD).
COPY --from=builder /app/prisma ./prisma

# The generated client + query engine for the running server. Next's standalone
# trace already pulls these in; copying them explicitly keeps the runtime from
# depending on that tracing staying correct.
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# The CLI, with its full dependency tree, isolated from the app's node_modules.
COPY --from=prismacli /cli/node_modules ./prisma-cli/node_modules

# Launch prisma via a shim rather than COPYing node_modules/.bin/prisma: that
# path is a symlink, and Docker dereferences single-file COPYs, which strands
# the CLI away from the *.wasm engines it loads relative to its own location.
# Putting .bin on PATH also means a bare `prisma` resolves, so this holds up
# whichever start command runs (the CMD below, or one set in the dashboard).
RUN mkdir -p node_modules/.bin \
 && printf '#!/bin/sh\nexec node /app/prisma-cli/node_modules/prisma/build/index.js "$@"\n' > node_modules/.bin/prisma \
 && chmod +x node_modules/.bin/prisma
ENV PATH="/app/node_modules/.bin:${PATH}"

# Next's standalone package.json ships `next start`, but there is no `next` CLI
# in a standalone image. Point `start` at the server it actually emits.
RUN node -e "const fs=require('fs'),f='/app/package.json';const p=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{};p.scripts={...(p.scripts||{}),start:'node server.js'};fs.writeFileSync(f,JSON.stringify(p,null,2))"

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Migrations must land before serving — a schema-less app 500s on every report,
# so failing here (and failing the healthcheck) is the correct outcome.
CMD ["sh", "-c", "prisma migrate deploy && node server.js"]
