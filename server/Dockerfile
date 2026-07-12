# HeyHomie orders backend. Build context = repo root (needs the workspace packages).
#   docker build -f server/Dockerfile -t heyhomie-orders .
FROM node:20-alpine
WORKDIR /app

# Manifests + lockfile first (better layer caching), then workspace sources.
COPY package.json package-lock.json ./
COPY packages ./packages
COPY server ./server

# H5 — reproducible install from the lockfile (npm ci), scoped to the server
# workspace + its linked deps (@heyhomie/api → transitively /domain, fastify, pg, tsx).
RUN npm ci --include-workspace-root --workspace @heyhomie/server

# H3 — run as the unprivileged built-in `node` user. Own /app so tsx's cache is
# writable; the process then has no root privileges at runtime.
RUN chown -R node:node /app
USER node

ENV NODE_ENV=production
EXPOSE 8090

# Use 127.0.0.1 (not localhost): the app binds IPv4 0.0.0.0, but `localhost`
# resolves to IPv6 ::1 first on node:alpine → false "unhealthy" (found Build 11).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8090/health/ready || exit 1

# Run node AS PID 1 (tsx as a loader via --import) — NOT `npx tsx`, whose npx
# wrapper is PID 1 and exits early on SIGTERM, killing the graceful drain mid-way
# (exit 137, found Build 14). node PID 1 receives SIGTERM and controls its exit.
CMD ["node", "--import", "tsx", "server/src/index.ts"]
