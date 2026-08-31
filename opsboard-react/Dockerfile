# Built from the REPO ROOT context (docker-compose: context ., dockerfile
# opsboard-react/Dockerfile) — same pattern as the portal and workers. The
# root context is what lets the image see shared/design-tokens.json, the
# single token source ui.jsx imports as ../../../../shared/… (Phase 1: one
# definition, no per-app copies).
FROM node:22-alpine AS builder

WORKDIR /app/opsboard-react

COPY opsboard-react/package*.json ./
RUN npm ci

# The shared token source sits one level above the app, exactly as in the
# repo, so the relative import resolves identically in and out of Docker.
COPY shared/ /app/shared/
COPY opsboard-react/ ./

# Frontend is served behind /digital-wall/timeline
ARG VITE_BASE_PATH=/digital-wall/timeline/
ARG VITE_API_BASE_URL=/digital-wall
ENV VITE_BASE_PATH=$VITE_BASE_PATH
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/opsboard-react/dist /usr/share/nginx/html
COPY opsboard-react/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
