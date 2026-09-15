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

## Build for Production

```bash
npm run build   # outputs to dist/
```

Serve `dist/` with nginx (see `nginx.conf` for the exact routing this app expects: `/api` and `/uploads` → the Go backend, `/auth` → the auth service, everything else → the SPA), or build the Docker image directly with `docker compose build frontend`.
