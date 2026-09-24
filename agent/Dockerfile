# Agent service image. Mirrors the wall's container shape (node + app dir), but
# installs production deps only and runs the real entry point rather than a dev
# server — this one is on the request path for signed-in users.
# Playwright's chromium is needed for PDF generation (the platform's
# established HTML->PDF route). The Playwright base image ships the browser and
# its system libraries; alpine + a manual chromium install drifts from what
# scripts/generate-airport-sheets.mjs is tested against.
FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

COPY agent/package*.json ./
RUN npm install --omit=dev

COPY agent/ ./

# The platform's single Resend client, not a copy of one. Kept at the path the
# agent imports it from (../../digital-wall/lib/mailer.mjs) so the module reads
# the same in the image as in the repo.
COPY digital-wall/lib/mailer.mjs /digital-wall/lib/mailer.mjs

EXPOSE 5175

# Prove the deployed image answers before the gateway sends traffic to it.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5175)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
