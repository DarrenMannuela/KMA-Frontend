# KMA Frontend — Kreasi Makmur Abadi

Internal ops dashboard for KMA, an apparel manufacturer. Covers the whole order lifecycle — clients and their catalogues, orders, production and operations spend (Kas Bon tracking), deliveries, invoicing/receipts, and yearly financial reporting — plus staff/admin user management.

## Stack

| Tool | Purpose |
|------|---------|
| React 18 + TypeScript | UI framework |
| Vite 5 | Build tool + dev server |
| Tailwind CSS | Styling — custom navy/gold design tokens, see `tailwind.config.js` |
| TanStack Query v5 | Data fetching, caching, mutations |
| Axios | HTTP client (proxied to the Go backend and the auth service) |
| React Router v6 | Client-side routing |
| react-hot-toast | Toast notifications |
| date-fns | Date formatting |
| lucide-react | Icons |

## Architecture

This frontend is a static SPA that talks to **two separate backend services**, both reverse-proxied through the same origin so the browser never deals with CORS or cross-port cookies:

- **`kma_backend`** (Go, port 8000) — the main API: orders, items, invoices, deliveries, production/operations spend, clients, suppliers. Routes live under `/api/v1/*`.
- **`kma_auth_backend`** (Go, port 8001) — a standalone auth service: login/logout, sessions, password management, user provisioning. Routes live under `/auth/api/v1/auth/*`. Sessions are single-device — signing in on a new device signs out any other active session for that account.

In production (see `nginx.conf`), nginx proxies `/api/` and `/uploads/` to `kma_backend` and `/auth/` to `kma_auth_backend`, and serves the built SPA for everything else. In dev, `vite.config.ts` only proxies `/api` and `/uploads` — see the note below if you need real login while running `npm run dev`.

## Getting Started

### 1. Start the backends

You need both `kma_backend` (the Go API) and `kma_auth_backend` (the auth service) running — see their own repos. By default the frontend expects them on `localhost:8000` and `localhost:8001`.

### 2. Run the frontend

```bash
npm install
npm run dev
# → http://localhost:5173
```

Vite proxies `/api/*` and `/uploads/*` → `http://localhost:8000` automatically (see `vite.config.ts`).

**Note — auth in local dev:** `vite.config.ts` doesn't currently proxy `/auth`, so `npm run dev` alone can't complete a real login (see the comment at the top of `src/api/authApi.ts`). To exercise login locally, add a matching proxy entry:

```ts
// vite.config.ts, inside server.proxy
'/auth': { target: 'http://localhost:8001', changeOrigin: true },
```

Otherwise, use the Docker setup below, where nginx already handles this.

## Running with Docker

```bash
docker compose build frontend
docker compose up -d frontend
```

This builds the SPA and serves it via nginx on port 80 (see `Dockerfile`, `nginx.conf`). It expects `kma_backend` and `kma_auth_backend` to already be running as containers named exactly that, reachable on the external `kma_network` Docker network (see `docker-compose.yaml`) — this repo doesn't define those services itself.

Start the three stacks in order: KMA (it creates `kma_network`), KMA-Auth, then this one. After a code change, `docker compose up -d --build` again; there's no data here, so no backup is needed first.

- **Who can reach it.** Port 80 is open on every network the Mac is on (the shop's Wi-Fi included) unless `.env` sets `KMA_WEB_BIND=127.0.0.1` (see `.env.example`). With that, it's reachable from this Mac and through `tailscale serve` only, which is the recommended setting: the tailnet address is HTTPS, while port 80 is plain HTTP.
- **Staying up.** The container restarts after a crash while Docker Desktop runs; turn on Docker Desktop's **Start Docker Desktop when you sign in** so that also holds after the Mac restarts. Docker checks it every 30s, and its logs rotate (5 × 10 MB).
- **When a backend is down** (stopped, restarting, being rebuilt), nginx answers `/api`, `/uploads` and `/auth` with a 503 and a JSON message the app shows ("The server is starting up or restarting. Try again in a moment."), instead of an HTML error page that reached the screen as "Request failed with status code 502". The topbar's health badge shows it as offline.
- **After an update**, a tab that was open from before reloads itself once when it asks for a page from the old build, instead of showing the error screen (`src/main.tsx`). Built files under `/assets/` are cached for a year (their names change with every build); `index.html` and the manifest are checked for a new version every time.

## Features

- **Dashboard** — AR receivable, recent orders, overdue invoices, this-month orders vs. costs.
- **Clients** — company records, contacts, and a per-client catalogue (items + year-by-year price history, with a printable price list).
- **Orders** — order + item management, linked to a client or freeform company info.
- **Invoices** — DP/Pelunasan generation off an order, a print-ready invoice layout with manual/predicted page breaks, and a matching Kwitansi (receipt) print view.
- **Delivery** — Delivery Order (DO) and Surat Jalan (SJ) tracking with per-box item packing, and a print view for both document types.
- **Production / Operations** — Kas Bon–based spend tracking (materials by supplier, operating costs by category), with a monthly dashboard + spend bars and a full spreadsheet-style editor.
- **Suppliers** — supplier records by category (Sablon, Embroidery, Merchandise, Uniform, General).
- **Reports** — yearly orders/invoicing/cost breakdown with a profit/loss chart.
- **Users (admin only)** — staff account provisioning, deactivation, and password resets. No self-signup — accounts are created by an admin and invited by email.

## Supplier Category Enum (from kma.yaml)

`sablon` | `embroidery` | `merchandise_supplier` | `uniform_supplier` | `general_supplier`

Display labels and colors for these live in `src/constants/supplierCategories.ts` — reuse that shared constant rather than redefining labels/colors locally (see `SuppliersPage.tsx` for the intended pattern).

## Install it as an app (phone or computer)

KMA can be installed like an app, with its own icon, opening full screen without the browser's address bar (`public/manifest.webmanifest`, icons in `public/icons/` made from `public/Logo.png`). Open the HTTPS address the tailnet serves it on (`https://<mac-name>.<tailnet>.ts.net`), then:

- **Android:** Chrome's menu (⋮) → **Install app** (or **Add to Home screen**).
- **iPhone / iPad:** Safari's Share button → **Add to Home Screen**.
- **Mac / PC:** Chrome or Edge, the install icon at the right of the address bar.

Browsers only install from an `https://` address (or `localhost`), so this doesn't work from `http://<ip>`. It's still the website underneath: updates show up the next time it's opened, and it needs the Mac (and Tailscale on the phone) to be on. It isn't in an app store; a store app would need a wrapper such as Capacitor, and the same HTTPS address, for no real gain here.

## Security

- **This repository is public**, history included. Nothing secret belongs in the frontend anyway (all of it is sent to every browser), and `.gitignore` keeps `.env` files, keys and certificates out regardless; `.dockerignore` keeps `.env`, `node_modules` and `.git` out of image builds.
- nginx adds `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` (other sites can't frame KMA) and `Referrer-Policy: same-origin` (KMA addresses, with order numbers in them, aren't sent to other sites) to every response (`security-headers.conf`).
- The image is built with Node 22 (Node 20 stopped getting security fixes in April 2026).

## Build for Production

```bash
npm run build   # outputs to dist/
```

Serve `dist/` with nginx (see `nginx.conf` for the exact routing this app expects: `/api` and `/uploads` → the Go backend, `/auth` → the auth service, everything else → the SPA), or build the Docker image directly with `docker compose build frontend`.
