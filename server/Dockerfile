# HeyHomie orders backend. Build context = repo root (needs the workspace packages).
#   docker build -f server/Dockerfile -t heyhomie-orders .
FROM node:20-alpine
WORKDIR /app

# Manifests + workspace sources (tsx runtime — no compile step).
COPY package.json ./
COPY packages ./packages
COPY server ./server

# Install the server workspace + its linked deps (@heyhomie/api, /domain, fastify, pg, tsx).
RUN npm install --include-workspace-root --workspace @heyhomie/server

ENV NODE_ENV=production
EXPOSE 8090

# Use 127.0.0.1 (not localhost): the app binds IPv4 0.0.0.0, but `localhost`
# resolves to IPv6 ::1 first on node:alpine → false "unhealthy" (found Build 11).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8090/health/ready || exit 1

CMD ["npx", "tsx", "server/src/index.ts"]
