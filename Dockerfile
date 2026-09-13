# syntax=docker/dockerfile:1
FROM node:24.21.0-bookworm-slim AS builder
WORKDIR /app
ENV HUSKY=0
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM node:24.21.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production DISABLE_BACKGROUND_WORKERS=true HUSKY=0
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/build/server ./build/server
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health/live',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "build/server/server.js"]
