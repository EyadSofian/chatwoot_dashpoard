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

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run the CLI via its real file, not the node_modules/.bin/prisma symlink:
# `COPY --from=... /app/node_modules/.bin/prisma ...` dereferences that symlink
# into a standalone copy sitting in .bin/, so the bundled CLI's __dirname-relative
# lookup of its own *.wasm engines (which live beside build/index.js) resolves to
# the wrong directory and fails with ENOENT. Invoking build/index.js directly
# keeps it next to its wasm files, where it was copied intact above.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
