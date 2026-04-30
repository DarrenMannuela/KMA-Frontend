# KMA Frontend

A React + TypeScript frontend for the [KMA](https://github.com/DarrenMannuela/KMA) knowledge management backend.

## Stack

- **React 18** + **TypeScript**
- **Vite** — dev server with API proxy to Go backend
- **Tailwind CSS** — utility-first styling with custom design tokens
- **TanStack Query** — data fetching and caching
- **Axios** — HTTP client
- **React Router v6** — client-side routing
- **react-hot-toast** — toast notifications

## Getting Started

### 1. Start the KMA backend

```bash
# From the KMA repo root
docker-compose up -d     # starts SQLite container
go run ./cmd/server      # starts API on :8080
```

### 2. Install & run the frontend

```bash
cd kma-frontend
npm install
npm run dev
# → http://localhost:5173
```

The Vite dev server proxies `/api/*` → `http://localhost:8080/api` automatically.

## Project Structure

```
src/
├── api/          # Axios client + all endpoint functions
├── components/   # Reusable UI (Sidebar, NoteCard, NoteEditor)
├── hooks/        # React Query hooks for data fetching & mutations
├── pages/        # Route-level pages (Notes, Categories, Tags, Settings)
├── styles/       # Global CSS + Tailwind config
├── types/        # TypeScript interfaces matching Go DTOs
├── App.tsx       # Root layout + routing
└── main.tsx      # Entry point
```

## API Assumptions

The frontend expects these REST endpoints on the backend (adjust in `src/api/index.ts` if your routes differ):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notes` | List notes (supports `?search=`, `?category_id=`, `?tag=`, `?page=`, `?limit=`) |
| GET | `/api/notes/:id` | Get single note |
| POST | `/api/notes` | Create note |
| PUT | `/api/notes/:id` | Update note |
| DELETE | `/api/notes/:id` | Delete note |
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create category |
| PUT | `/api/categories/:id` | Update category |
| DELETE | `/api/categories/:id` | Delete category |
| GET | `/api/tags` | List all tags |

## Production Build

```bash
npm run build   # outputs to dist/
```

Serve `dist/` with nginx or any static host, and point your API proxy at the Go backend.
# KMA-Frontend
