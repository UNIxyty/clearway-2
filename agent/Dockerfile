# Agent service image. Mirrors the wall's container shape (node + app dir), but
# installs production deps only and runs the real entry point rather than a dev
# server — this one is on the request path for signed-in users.
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 5175

# Prove the deployed image answers before the gateway sends traffic to it.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5175)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
