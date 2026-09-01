# Multi-stage build for the Next.js app (local test stack). Vercel builds via
# its own pipeline and ignores this file.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Skip the postinstall asset prep here (no source yet); the build stage runs it.
RUN npm ci --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prepare-assets (copy-celestial + build-art) runs via prebuild.
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# `output: 'standalone'` produces .next/standalone with a minimal server + only
# the node_modules it needs, plus static assets we copy alongside.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
