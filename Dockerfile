# syntax=docker/dockerfile:1

FROM node:24.11-bullseye AS builder
WORKDIR /app

# Enable pnpm via Corepack and install dependencies with locking
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Compile TypeScript sources
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

# Remove devDependencies to shrink runtime layer
RUN pnpm prune --prod

FROM node:24.11-bullseye-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000
VOLUME ["/state", "/data"]
CMD ["node", "dist/index.js"]
