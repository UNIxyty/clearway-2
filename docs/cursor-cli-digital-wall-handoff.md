# Cursor CLI Handoff: Digital Wall Container Integration

This file is for Cursor CLI to understand what was added for Digital Wall (frontend + backend), and how to integrate it into the **existing server docker stack** using the same technologies/patterns already used in this repo.

## Goal

Deploy Digital Wall under:

- `https://clearway.verxyl.com/digital-wall/timeline`
- `https://clearway.verxyl.com/digital-wall/aircrafts`
- `https://clearway.verxyl.com/digital-wall/limitations`

using:

- Docker Compose (same as existing services)
- Nginx for path routing
- Cloudflare Tunnel path mapping

without breaking current services.

## Existing Stack Pattern (must follow)

Current root stack is in `docker-compose.yml` and uses:

- multiple named services
- `restart: unless-stopped`
- internal service networking via compose
- local bind/exposed ports for internal reverse-proxying

Keep this style for Digital Wall integration.

## Files already created for Digital Wall

### Compose and routing

- `docker-compose.digital-wall.yml`
  - `digital-wall-backend` (Node backend from `digital-wall/server.mjs`, port 5174 internal)
  - `digital-wall-frontend` (React static build from `opsboard-react`, served by nginx)
  - `digital-wall-gateway` (nginx path router on `127.0.0.1:8088`)

- `deploy/digital-wall/nginx-gateway.conf`
  - routes `/digital-wall/timeline*` + `/digital-wall/aircrafts` + `/digital-wall/limitations` to frontend
  - routes other `/digital-wall/*` paths (including `/api/*`, `/operators`, `/backend-test`) to backend

### Frontend containerization

- `opsboard-react/Dockerfile`
  - builds Vite app with:
    - `VITE_BASE_PATH=/digital-wall/timeline/`
    - `VITE_API_BASE_URL=/digital-wall`
  - serves static app via nginx

- `opsboard-react/nginx.conf`
  - SPA fallback to `/index.html`

### Frontend path behavior

- `opsboard-react/vite.config.js`
  - supports `base` from `VITE_BASE_PATH`

- `opsboard-react/src/App.jsx`
  - reads URL tail and opens matching tab:
    - `/digital-wall/timeline`
    - `/digital-wall/aircrafts`
    - `/digital-wall/limitations`
  - keeps URL synced with selected tab

### Deploy docs

- `docs/digital-wall-server-deploy.md`
- `deploy/digital-wall/cloudflared-config.example.yml`

## Required work for Cursor CLI

1. **Integrate Digital Wall services into root `docker-compose.yml`** (instead of separate compose file), preserving style of existing services.
   - Keep same service names unless conflicts:
     - `digital-wall-backend`
     - `digital-wall-frontend`
     - `digital-wall-gateway`
   - Keep `restart: unless-stopped`.
   - Keep gateway exposed only on localhost (e.g. `127.0.0.1:8088:80`).

2. **Do not change existing portal/worker services behavior**.

3. **Keep technology consistency**:
   - Node-based backend container
   - nginx static serving for frontend
   - nginx gateway for path routing
   - Cloudflare Tunnel path rule for `/digital-wall/*`

4. **Cloudflare Tunnel ingress update**
   - Add path rule:
     - `hostname: clearway.verxyl.com`
     - `path: /digital-wall/.*`
     - `service: http://127.0.0.1:8088`
   - Ensure fallback/default route for `clearway.verxyl.com` main app remains intact.

5. **Verify end-to-end**
   - `docker compose config` passes
   - containers up and healthy
   - URLs reachable:
     - `/digital-wall/timeline`
     - `/digital-wall/aircrafts`
     - `/digital-wall/limitations`
   - API path works through same prefix:
     - `/digital-wall/api/timeline/sync-status`

## Backend env source

Use env file:

- `digital-wall/.env`

The backend container command should keep:

- `node --env-file=.env server.mjs`

and port:

- `PORT=5174`

## Notes

- Current Digital Wall backend is a custom Node server (`digital-wall/server.mjs`), not Next.js.
- Current frontend is `opsboard-react` built as static assets and served via nginx.
- Public entry is intended through Cloudflare Tunnel, not direct public docker port exposure.
