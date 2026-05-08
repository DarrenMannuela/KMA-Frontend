# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Serve ───────────────────────────────────────────────────────────
FROM nginx:alpine AS runner

# Copy the built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config: serve the SPA and proxy /api to the backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
