FROM node:22-alpine

# BRANCH GUARD: refuses to build unless the checkout is on main (scripts/branch-guard.sh says why). This image's
# context is ./digital-wall, so the repo root is passed as the named context "repo" (docker-compose.yml,
# additional_contexts). Build it through compose; a bare `docker build ./digital-wall` has no "repo" context.
ARG ALLOW_NON_MAIN_BUILD=0
COPY --from=repo scripts/branch-guard.sh .git/HEAD /tmp/branch-guard/
RUN sh /tmp/branch-guard/branch-guard.sh /tmp/branch-guard/HEAD "$ALLOW_NON_MAIN_BUILD" && rm -rf /tmp/branch-guard

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# Permissions (docs/permissions.md): the catalogue and grants shared with the portal and the agent, at the path the
# server imports them from (../lib/permissions from /app).
COPY --from=repo lib/permissions /lib/permissions

EXPOSE 5173

CMD ["npm", "run", "dev"]
