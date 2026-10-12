FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Permissions (docs/permissions.md): no write endpoint without an entry in lib/permissions/catalogue.mjs, in the portal,
# the agent or the wall — or the image is not built.
RUN node lib/permissions/check.mjs --code
# The build context has no .env (.dockerignore): the only values the build needs are the public ones Next compiles into
# the browser bundle, passed as build arguments (docker-compose.yml). They are declared in this stage only, so they
# appear in no final image's settings or history. Everything else is configuration at run time (env_file).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_AGENT_BASE_URL=""
RUN NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
    NEXT_PUBLIC_SITE_URL="$NEXT_PUBLIC_SITE_URL" NEXT_PUBLIC_AGENT_BASE_URL="$NEXT_PUBLIC_AGENT_BASE_URL" npm run build

FROM node:20-bookworm-slim AS base-runtime
WORKDIR /app
# BRANCH GUARD: refuses to build unless the checkout is on main (scripts/branch-guard.sh says why).
ARG ALLOW_NON_MAIN_BUILD=0
COPY scripts/branch-guard.sh .git/HEAD /tmp/branch-guard/
RUN sh /tmp/branch-guard/branch-guard.sh /tmp/branch-guard/HEAD "$ALLOW_NON_MAIN_BUILD" && rm -rf /tmp/branch-guard
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    ca-certificates \
    dumb-init \
    python3 \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libnspr4 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    poppler-utils \
 && rm -rf /var/lib/apt/lists/*

FROM base-runtime AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV STORAGE_ROOT=/storage
ENV CACHE_ROOT=/cache
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# No secret in the image, or no image (docs/security-image-secrets.md).
COPY scripts/check-image-secrets.mjs /tmp/check-image-secrets.mjs
RUN node /tmp/check-image-secrets.mjs /app && rm /tmp/check-image-secrets.mjs
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]

FROM base-runtime AS worker-runner
WORKDIR /app
ENV NODE_ENV=production
ENV STORAGE_ROOT=/storage
ENV CACHE_ROOT=/cache
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=builder /app ./
RUN node scripts/check-image-secrets.mjs /app
RUN npx playwright install chromium
ENTRYPOINT ["dumb-init", "--"]
