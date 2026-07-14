# ─────────────────────────────────────────────────────────────────────────────
# Multi-stage build for Next.js (standalone) + Prisma. Optional — Railway can
# also build via Nixpacks (nixpacks.toml). Kept here for portability.
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

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma schema + generated client + engine for `prisma migrate deploy`.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Prisma CLI launcher.
#
# We deliberately do NOT `COPY /app/node_modules/.bin/prisma`: that path is a
# symlink to ../prisma/build/index.js, and Docker dereferences single-file
# COPYs. The copy lands in .bin/ detached from the *.wasm engines the bundled
# CLI loads relative to its own location, so it dies with
# `ENOENT: ... .bin/prisma_schema_build_bg.wasm` before the server ever boots.
#
# A shim keeps the CLI where its engines are, and putting .bin on PATH means a
# bare `prisma` resolves too — so this works no matter which start command runs
# (the CMD below, Railway's, or a custom one set in the dashboard).
RUN mkdir -p node_modules/.bin \
 && printf '#!/bin/sh\nexec node /app/node_modules/prisma/build/index.js "$@"\n' > node_modules/.bin/prisma \
 && chmod +x node_modules/.bin/prisma
ENV PATH="/app/node_modules/.bin:${PATH}"

# Next's standalone package.json ships no scripts, so `npm run start` would fail
# with "Missing script". Point it at the standalone server (there is no `next`
# CLI in this image) so that start command works as well.
RUN node -e "const fs=require('fs'),f='/app/package.json';const p=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{};p.scripts={...(p.scripts||{}),start:'node server.js'};fs.writeFileSync(f,JSON.stringify(p,null,2))"

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Migrations must succeed before serving — a schema-less app would 500 on every
# report. Failing here fails the healthcheck, which is what we want.
CMD ["sh", "-c", "prisma migrate deploy && node server.js"]
