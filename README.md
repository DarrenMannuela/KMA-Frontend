# KMA Frontend — Kreasi Makmur Abadi

Admin dashboard for KMA's internal operations: orders, production, delivery, and financials.

## Stack

| Tool | Purpose |
|------|---------|
| React 18 + TypeScript | UI framework |
| Vite | Build tool + dev server |
| Tailwind CSS | Styling with custom design tokens |
| TanStack Query v5 | Data fetching, caching, mutations |
| Axios | HTTP client (proxied to Go backend) |
| React Router v6 | Client-side routing |
| react-hot-toast | Toast notifications |
| date-fns | Date formatting |

## Getting Started

### 1. Start the KMA Go backend

```bash
# From KMA repo root
go run main.go    # API runs on :8000
```

### 2. Run the frontend

```bash
npm install
npm run dev
# → http://localhost:5173
```

Vite proxies `/api/v1/*` → `http://localhost:8000` automatically.

---

## Backend Route Status

Based on `main.go` at time of generation. Update `status` in `Sidebar.tsx` as you wire handlers.

| Route | Methods | Status |
|-------|---------|--------|
| `/api/v1/supplier` + `/:id` | GET, POST, PATCH, DELETE | ✅ Live |
| `/api/v1/order` + `/:id` | GET, POST | 🟡 Stub |
| `/api/v1/items` + `/:id` | GET, POST | 🟡 Stub |
| `/api/v1/order-recap` + `/:id` | GET, POST | 🟡 Stub |
| `/api/v1/delivery` + `/:id` | GET, POST | 🟡 Stub |
| `/api/v1/delivery-order` + `/:id` | GET, POST | 🟡 Stub |
| `/api/v1/surat-jalan` + `/:id` | GET, POST | 🟡 Stub |
| `/api/v1/production-entry` + `/:id` | GET, POST | 🟡 Stub |
| `/api/v1/operation-entry` + `/:id` | GET, POST | 🟡 Stub |

### Wiring a new route (example for Items):

```go
v1.GET("/items",        handler.GetItems)
v1.POST("/items",       handler.PostItems)
v1.PATCH("/items/:id",  handler.UpdateItems)
v1.DELETE("/items/:id", handler.DeleteItems)
```

Then flip `status: 'stub'` → `status: 'live'` in `src/components/layout/Sidebar.tsx`.

---

## Supplier Category Enum (from kma.yaml)

`sablon` | `embroidery` | `merchandise_supplier` | `uniform_supplier` | `general_supplier`

---

## Build for Production

```bash
npm run build   # outputs to dist/
```

Serve `dist/` with nginx, proxy `/api` → Go backend on `:8000`.
