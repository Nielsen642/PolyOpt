# PolyOpt — Polymarket Portfolio Analytics & Hedge Toolkit

**PolyOpt** is a self-hosted web app for **Polymarket traders** who want a single place to view positions, live market context (prices + order book), **correlation-style similarity** across markets, **CVaR-based hedge suggestions**, optional **CLOB order signing**, and **operational alerts** — without relying on a third-party SaaS for your workflow.

> **Disclaimer:** Analytics, correlations, and optimizer output are **model-based decision support**, not investment advice. Polymarket trading involves risk; verify execution, fees, and settlement on your own.

---

## Why traders care

| Capability | What you get |
|------------|----------------|
| **Unified book view** | Positions and exposures derived from Polymarket **Data API** + **Gamma** metadata + **CLOB** top-of-book where available. |
| **Hedge ideation** | Run a **Python CVaR optimizer** against your book and scenario presets; preview hedges without a full optimize pass. |
| **Linkages** | **Correlation matrix** (feature similarity, not classical return correlation) and **Hedge Map** graph to spot clusters and concentration. |
| **Execution path** | Connect a wallet (**Reown AppKit / Wagmi**), **EIP-712** sign orders, relay via your backend to Polymarket CLOB (with optional **server-side L2 headers** in Pro). |
| **Risk & ops** | **Alerts** (rules + channels), **health checks**, **Market Scan** (crypto / sports / politics), exports and audit-style trails on portfolio pages. |
| **Pro tier** | Rate limits, security headers, **Postgres-backed alert sync**, enriched **feed metadata**, **institutional-style risk report** API — for production deployments. |

---

## How the system works (high level)

1. **Backend (Node.js + Express)** — Auth (sessions + Passport local), REST API, WebSocket market polling, and **spawned Python** for `server/optimize.py`.
2. **Database (PostgreSQL)** — Users, portfolios/positions (demo path), sessions (`connect-pg-simple`), and **Pro** `user_alert_state` for durable alerts.
3. **Frontend (React + Vite)** — Dashboard, portfolio detail, live markets, correlations, hedge map, alerts, integrations, market scan.
4. **Polymarket** — Positions from **Data API**; market text/slugs from **Gamma**; books and orders via **CLOB**. Retries/timeouts are configurable.
5. **Wallet split** — Set **`POLYMARKET_WALLET_ADDRESS`** for **read/analytics**; the **in-app connected wallet** is used for **signing** when you place orders.

---

## Feature map (UI)

| Area | Route | Purpose |
|------|--------|---------|
| Portfolios | `/` | Overview of linked Polymarket-style portfolio and summaries. |
| Portfolio strategy | `/portfolio/:id` | Positions, **RUN ALGORITHM**, hedge results, presets, risk attribution, Pro risk report (if enabled). |
| Live markets | `/markets` | Per-market cards: probability, exposure-style metrics, spread/depth, mini trends, links to map/correlations/alerts. |
| Market scan | `/market-scan` | Category scan (crypto / sports / politics) for active, liquid markets. |
| Correlations | `/correlations` | Weighted matrix, top pairs, drilldown, hedge preview API. |
| Hedge map | `/hedge-map` | Graph of linkages, thresholds, node rankings. |
| Alerts | `/alerts` | Rule types, severity, channels; Pro persists rules/events in DB. |
| Integrations | `/integrations` | PWA, **system health** (API reachability, Pro tier, uptime). |

---

## Tech stack

- **Runtime:** Node 20+ (recommended), TypeScript, Express 5  
- **UI:** React 18, Wouter, TanStack Query, Tailwind, Radix, Recharts  
- **Wallet:** Reown AppKit, Wagmi, Viem (Polygon)  
- **DB:** PostgreSQL, Drizzle ORM  
- **Optimizer:** Python 3.12+ (`cvxpy`, `numpy`, …) via `uv` or plain `python`  
- **Build:** Vite (client → `dist/public`), esbuild (server → `dist/index.cjs`)

---

## Prerequisites

- **Node.js** 20+ and **npm**
- **PostgreSQL** (URL in `DATABASE_URL`)
- **Python 3.12+** with optimizer deps — easiest: install **[uv](https://github.com/astral-sh/uv)** and run from repo root:  
  `uv sync` (uses `pyproject.toml`)  
  *Or* install `numpy`, `cvxpy` (see `pyproject.toml`) and set `OPTIMIZER_CMD=python` if you don’t use `uv`.
- **Git**

Optional:

- **`VITE_WALLETCONNECT_PROJECT_ID`** — wallet modal / QR connect  
- **Polymarket `POLYMARKET_WALLET_ADDRESS`** — populate dashboards from a specific address  

---

## Quick start (local development)

### 1. Clone and install

```bash
git clone <your-fork-or-repo-url> Market-Hedge-Bot
cd Market-Hedge-Bot
npm install
```

### 2. Database

Create a database and set:

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL, SESSION_SECRET (long random string)
```

Apply schema (Drizzle):

```bash
npm run db:push
```

If you use **Pro** (`APP_TIER=pro`), ensure migration for alerts exists or `db:push` picked up `user_alert_state` (see `migrations/`).

### 3. Environment essentials

Minimum for a working app:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Session signing (use a long random value) |
| `POLYMARKET_WALLET_ADDRESS` | *(Recommended)* Address whose Polymarket positions power analytics |

See **`.env.example`** for Pro, CLOB relay, timeouts, and frontend keys.

### 4. Run (dev)

```bash
npm run dev
```

Open the URL printed in the terminal (default **http://127.0.0.1:5000** or your `PORT`). Register a user, sign in, connect wallet as needed.

---

## Production deployment (step-by-step)

These steps fit a **VPS** (Ubuntu), **bare metal**, or any host that can run Node + PostgreSQL + Python. There is **no Dockerfile** in-repo; add your own if you prefer containers.

### Step 1 — Provision PostgreSQL

- Create a database and user.
- Note the connection string:  
  `postgresql://USER:PASSWORD@HOST:5432/DATABASE`

### Step 2 — Provision the application server

- **Node 20+** installed (`node -v`).
- **Python 3.12+** and either **`uv`** or **`python`** with `cvxpy` / `numpy` installed.
- Clone the repo to `/opt/polyopt` (or similar).

### Step 3 — Configure environment

On the server:

```bash
cd /opt/polyopt
cp .env.example .env
```

Edit `.env`:

1. **`DATABASE_URL`** — production Postgres URL.  
2. **`SESSION_SECRET`** — **cryptographically strong** secret (32+ random bytes).  
3. **`NODE_ENV=production`** — usually set by your process manager / `npm start` (see below).  
4. **`POLYMARKET_WALLET_ADDRESS`** — wallet to analyze.  
5. **`PORT` / `HOST`** — e.g. `PORT=5000`, `HOST=0.0.0.0` behind a reverse proxy.  
6. **Pro (optional):** `APP_TIER=pro` or `PRO_MODE=1`  
   - **Required in production Pro:** `SESSION_SECRET` must **not** be the dev default (`polyopt-dev-session-secret`). The app **exits on boot** if that check fails.  
   - Optional: `POLY_*` headers for server-side CLOB relay (see `.env.example`).  
7. **Frontend build-time:** set **`VITE_WALLETCONNECT_PROJECT_ID`** (and any `VITE_*` vars) **before** `npm run build` — they are baked into the client bundle.

### Step 4 — Install dependencies and migrate

```bash
npm ci
npm run db:push
```

(Or run SQL migrations manually if you use a migration runner.)

### Step 5 — Install Python optimizer dependencies

With **uv** (recommended):

```bash
uv sync
```

Default optimizer command in code paths is effectively **`uv run python server/optimize.py`**. To use system Python instead:

```env
OPTIMIZER_CMD=python
OPTIMIZER_ARGS=server/optimize.py
```

Ensure `cvxpy` and `numpy` are importable.

### Step 6 — Build the application

```bash
npm run build
```

This produces:

- **`dist/public/`** — static SPA (Vite)  
- **`dist/index.cjs`** — bundled Node server entry  

### Step 7 — Run the server

```bash
npm start
```

`npm start` runs **`NODE_ENV=production node dist/index.cjs`**. The server serves the API **and** static files from `dist/public`.

### Step 8 — Reverse proxy & TLS (recommended)

- Put **Nginx**, **Caddy**, or **Traefik** in front.  
- Terminate **HTTPS**, proxy to `http://127.0.0.1:PORT`.  
- With **Pro**, `trust proxy` is enabled so secure cookies and client IPs work correctly behind the proxy.

### Step 9 — Process manager

Use **systemd**, **PM2**, or **Docker Compose** (your own file) to:

- Restart on failure  
- Set env vars or point to `.env`  
- Log stdout/stderr  

Example **PM2**:

```bash
npm install -g pm2
cd /opt/polyopt
pm2 start dist/index.cjs --name polyopt --interpreter node
pm2 save
```

(Ensure `NODE_ENV=production` and the same env as in `.env`.)

### Step 10 — Smoke test

1. `curl https://your-domain/api/health` — JSON with `ok`, Polymarket reachability flags, `proMode`, etc.  
2. Open the site, register/login, confirm **Live Markets** / **Portfolio** load.  
3. Run **RUN ALGORITHM** once — confirms Python optimizer path on the server.

---

## Pro vs standard (production)

| | Standard | Pro (`APP_TIER=pro` / `PRO_MODE=1`) |
|---|----------|-------------------------------------|
| **NODE_ENV=production** | Normal startup | Requires **non-default** `SESSION_SECRET` |
| **Alerts** | Browser `localStorage` | Synced to **`user_alert_state`** table |
| **API** | No app rate limits | Per-IP rate limits on auth + API |
| **Headers** | Baseline security | Extra production security headers |
| **Feed** | Markets list | Envelope with lineage / fingerprint metadata |
| **Risk** | UI attribution | **`GET /api/pro/risk-report`** |

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| **`npm start` exits immediately with SESSION_SECRET error** | Pro + `NODE_ENV=production` + default dev secret. Set a real `SESSION_SECRET`. |
| **DB error on boot** | Missing or wrong `DATABASE_URL`. |
| **Optimizer / RUN ALGORITHM fails** | Python or `cvxpy` not installed; set `OPTIMIZER_CMD` / `OPTIMIZER_ARGS`; check server logs. |
| **Empty portfolio / markets** | `POLYMARKET_WALLET_ADDRESS` unset or wrong; Polymarket API blocked from server; check `/api/health`. |
| **502 / static not found** | Forgot `npm run build` or `dist/public` missing. |
| **Wallet works in dev, not prod** | Rebuild with correct `VITE_WALLETCONNECT_PROJECT_ID`; use HTTPS origin; check browser console. |

---

## Scripts reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server + Vite HMR (`NODE_ENV=development`). |
| `npm run build` | Client → `dist/public`, server → `dist/index.cjs`. |
| `npm start` | Production server (`NODE_ENV=production`). |
| `npm run check` | TypeScript check. |
| `npm run db:push` | Push Drizzle schema to Postgres. |

---

## License

MIT — see `package.json`. Polymarket is a third-party service; this project is not affiliated with Polymarket.

---

## Contributing

Issues and PRs welcome: clearer copy for traders, deployment templates (Dockerfile, compose), and hardened production defaults are especially valuable.
