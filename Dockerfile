# syntax=docker/dockerfile:1.4
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install curl for healthchecks
RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts

EXPOSE 3000

# Start server using tsx in production is usually avoided, but since our start script currently uses ts-node or dist/server, 
# let's assume we run the build output. Wait, we use esbuild or tsx? Let's check how start is configured. 
CMD ["npm", "run", "start"]
