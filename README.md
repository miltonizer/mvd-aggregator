# mvd-aggregator

A web app for searching and aggregating statistics across QuakeWorld MVD demo games. Search games by player, team, map, mode, or date range, select a subset of matches, then compute aggregated per-player stats across all selected demos.

## Architecture

- **Frontend** — React + Vite (port `5173` in dev)
- **Backend** — Express API server (port `3001`)
- **Data sources**
  - Game index: QuakeWorld Hub (hub.quakeworld.nu) — read-only PostgREST API
  - Demo parsing: [`mvd-api`](../mvd_analyzer/mvd-api/) (must be running separately)

## Prerequisites

- Node.js 20+
- A running `mvd-api` instance (see `../mvd_analyzer/mvd-api/`)

## Running locally

1. **Install dependencies**

   ```sh
   npm install
   ```

2. **Configure environment variables**

   Copy `.env.example` to `.env` and fill in the values:

   ```sh
   cp .env.example .env
   ```

   Set `MVD_API_URL` to point at your local `mvd-api` instance (default: `http://localhost:7890`).

3. **Start the development servers**

   ```sh
   npm run dev
   ```

   This starts both the Express backend (`localhost:3001`) and the Vite frontend (`localhost:5173`) concurrently. Open [http://localhost:5173](http://localhost:5173) in your browser.

## Building for production

```sh
npm run build
```

Output is written to `dist/` (`dist/client/` for the frontend, `dist/server/` for the backend).

To run the production build:

```sh
npm start
```

The Express server will serve the compiled client files.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start frontend + backend in watch mode |
| `npm run dev:client` | Start Vite dev server only |
| `npm run dev:server` | Start Express server only (with hot reload) |
| `npm run build` | Compile TypeScript and bundle the client |
| `npm start` | Run the compiled production server |

## Docker / production deployment

The app is served under a configurable base path (default `/mvd_aggregator/`) behind Caddy, alongside `mvd-api` from [mvd_analyzer](../mvd_analyzer/).

Both services join the external Docker `web` network so Caddy can proxy to them by service name.

**Build and start:**
```sh
docker compose up -d --build
```

**Configuration (`.env`):**

| Variable | Description |
|---|---|
| `QUAKEWORLD_HUB_API_URL` | Supabase PostgREST endpoint for the game index |
| `QUAKEWORLD_HUB_API_ANON_KEY` | Supabase anon JWT for the game index |
| `MVD_API_URL` | URL of mvd-api — use `http://mvd-api:8080` in Docker, `http://localhost:7890` locally |
| `PORT` | Port the Express server listens on (default `3001`) — must match Caddy snippet |
| `VITE_BASE_PATH` | URL path prefix (default `/mvd_aggregator/`) — must match Caddy `handle_path` and requires rebuild |

**To change the base path:** update `VITE_BASE_PATH` in `.env` and `handle_path` in `caddy/snippets/mvd_aggregator.caddy`, then `docker compose up -d --build` and reload Caddy.

**To change the port:** update `PORT` in `.env` and `reverse_proxy` in `caddy/snippets/mvd_aggregator.caddy`, then `docker compose up -d` and reload Caddy.
