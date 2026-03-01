# AIP Data Portal

Clean, professional portal for looking up AIP (Aeronautical Information Publication) airport data.

## Features

- Search by ICAO code, IATA code, or airport name
- Search button + **Enter** key support
- Simulated “scraping” flow: **Loading up website** → **Reading info** → **Saving data** → results
- Shadcn-style UI (Input, Button, Card, Progress, Spinner)
- **Vercel-ready** (Next.js 14, Node.js)

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. Leave **Build Command**: `next build`, **Output Directory**: (default).
4. Deploy. No env vars required.

Or with Vercel CLI:

```bash
npm i -g vercel
vercel
```

## Your airport data

Replace or extend **`data/airports.json`** with your full dataset. Each object can include:

- `icao`, `iata`, `name`, `city`, `country`
- `elevation`, `lat`, `lon`
- `runways` (array), `freq`, `type`

The search API matches on ICAO, IATA, name, city, and country (min 2 characters).
