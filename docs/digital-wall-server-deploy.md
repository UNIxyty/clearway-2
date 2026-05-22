# Digital Wall Server Deploy (Docker)

This deploy wires:

- `digital-wall-backend` (Leon adapter/API)
- `digital-wall-frontend` (opsboard React)
- `digital-wall-gateway` (path router)

under one internal port, then you expose it on your domain path:

- `https://clearway.verxyl.com/digital-wall/timeline`
- `https://clearway.verxyl.com/digital-wall/aircrafts`
- `https://clearway.verxyl.com/digital-wall/limitations`

Backend paths are also available via prefix, for example:

- `https://clearway.verxyl.com/digital-wall/api/timeline/flights`
- `https://clearway.verxyl.com/digital-wall/operators`
- `https://clearway.verxyl.com/digital-wall/backend-test`

## 1) Start stack on server

From repo root:

```bash
docker compose -f docker-compose.digital-wall.yml build
docker compose -f docker-compose.digital-wall.yml up -d
```

This exposes gateway on `127.0.0.1:8088`.

## 2) Publish to internet

### Option A: Cloudflare Tunnel (recommended in your setup)

If you already use `cloudflared`, point `/digital-wall/*` to local gateway `127.0.0.1:8088`.

Use this ingress in your tunnel config (example):

```yaml
tunnel: <YOUR_TUNNEL_ID>
credentials-file: /etc/cloudflared/<YOUR_TUNNEL_ID>.json

ingress:
  - hostname: clearway.verxyl.com
    path: /digital-wall/.*
    service: http://127.0.0.1:8088
  - hostname: clearway.verxyl.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Then restart tunnel:

```bash
sudo systemctl restart cloudflared
```

Or, if you run `cloudflared` in Docker on the same compose network, target service directly:

- `service: http://digital-wall-gateway:80`

### Option B: Host Nginx rule for domain

In your existing `server_name clearway.verxyl.com` block:

```nginx
location /digital-wall/ {
  proxy_pass http://127.0.0.1:8088;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

Then reload nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Notes

- Frontend is built with base path `/digital-wall/timeline/`.
- API calls are prefixed via `VITE_API_BASE_URL=/digital-wall`.
- If you update env values in `digital-wall/.env`, restart backend stack:

```bash
docker compose -f docker-compose.digital-wall.yml up -d --build
```
