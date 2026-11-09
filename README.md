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

- **Who can reach it.**
  - Without a `.env`, port 80 is open on every network the Mac is on, the shop's Wi-Fi included, over plain HTTP. Browsers mark that "Not secure" and won't install the app from it.
  - The recommended `.env` is `KMA_WEB_BIND=127.0.0.1` and `KMA_WEB_PORT=8088` (see `.env.example`), with `tailscale serve --bg 8088`. Then it's reachable from this Mac and through the HTTPS tailnet address only.
  - Use a port above 1023: Docker Desktop can't bind port 80 to 127.0.0.1 without its privileged helper.
- **Staying up.** The container restarts after a crash while Docker Desktop runs; turn on Docker Desktop's **Start Docker Desktop when you sign in** so that also holds after the Mac restarts. Docker checks it every 30s, and its logs rotate (5 × 10 MB).
- **When a backend is down** (stopped, restarting, being rebuilt), nginx answers `/api`, `/uploads` and `/auth` with a 503 and a JSON message the app shows ("The server is starting up or restarting. Try again in a moment."), instead of an HTML error page that reached the screen as "Request failed with status code 502". The topbar's health badge shows it as offline.
- **After an update**, a tab that was open from before reloads itself once when it asks for a page from the old build, instead of showing the error screen (`src/main.tsx`). Built files under `/assets/` are cached for a year (their names change with every build); `index.html` and the manifest are checked for a new version every time.

## Features

What each part of KMA is for and how to use it. Every screen except the printed documents follows the language setting (English or Indonesian); Kas Bon, Bahan, Bukti Kas, Kwitansi, Surat Jalan, DO/SJ, DP, Pelunasan and PO stay as they are in both.

### Things that work everywhere

- **Edit in place.** On most tables, click a cell (or move to it with the arrow keys and start typing) to change it; Enter saves, Esc cancels. "click to fill" marks an empty cell that can take a value.
- **Undo.** Edits, moves and deletes show a toast with **Undo**, and **Ctrl+Z** on the same screen undoes the last one. Deleting an order, invoice, delivery, client or supplier can be undone for 30 days, and it comes back with everything the delete removed (an order's items, invoices and deliveries; a client's contacts and catalogue).
- **Lists.** Every list page has one toolbar: search on the left, the record count and **Add New** on the right. Long lists show 100 rows at a time with **Show more**; the Actions column stays pinned on the right when a table scrolls sideways.
- **Light and dark mode** from the moon/sun button in the top bar. The badge beside it shows whether the server is reachable ("Backend live"), so "can't save" and "the server is down" don't look the same.
- **Phones.** Tables turn into cards and pop-ups open as sheets from the bottom. The menu (☰) opens the sidebar.

### Dashboard

The first screen: what needs doing and how the month is going.

- **Top row:** money owed to you (AR receivable, with how much of it is overdue), orders and deliveries this month, and production and operations spending. Each shows a six-month sparkline and a comparison with last month up to the same day, coloured by meaning (more orders is green, more cost is red).
- **Unpaid invoices:** every unpaid invoice, overdue ones first, with how many days late. The WhatsApp button beside an overdue invoice opens a reminder message to the client's primary contact, ready to read over before sending. Click an invoice to open it.
- **Recent orders:** the latest five with their payment status. Click one to open it.
- **Last 6 months chart:** for each month, a bar for what was invoiced (solid = paid, striped = still unpaid) beside a bar for costs (production and operations), and that month's profit underneath. Hover, tap or keyboard-focus a month for the full breakdown. **Yearly** opens the Finance overview.
- **Quick actions:** start a new order, delivery, Kas Bon or supplier in one click.

### Clients

Company records, their contacts, and what each client buys at what price.

- **Clients** lists every company; open one for its page. Notes about the client show in a yellow strip at the top.
- **Points of Contact** tab: names, roles, phones, emails and locations. Mark one as **Primary**: WhatsApp reminders go to that contact, and the delivery form labels it when you choose who receives a delivery.
- **Catalogue & Pricing** tab: the client's items grouped by name with their sizes, and each size's price for a year next to the year before (edited in place).
  - **Raise prices** for a year in one go, by % or by Rp, rounded up.
  - **Add an item** in all its sizes at once, **copy** another client's items, or **add items that were ordered but never listed**.
  - **Excel export and import** in the same layout.
  - Every change can be undone. `/` jumps to the catalogue's search.
- Open an item for its prices year by year and every order of it next to that year's catalogue price.
- **Print Price List** prints the client's price list for a chosen year, with each item's price next to the one before (for handing out when prices go up).
- Orders pick the catalogue price for the order's own year, so prices already set for next year don't leak into this year's orders.

### Orders

- **All Orders** lists orders newest first with their value and payment status: grey "Not invoiced", blue while waiting for a payment, red once a payment is overdue ("DP overdue", "Pelunasan overdue"), green "Fully paid". The building icon beside a company opens its client record.
- **Add New** creates an order for a client (or a one-off company typed in), suggesting the next number in the `NNN/KMA/YY` sequence.
- **An order's page:**
  - **Payment** at the top: one tile for the DP invoice and one for the Pelunasan (or one tile for a single full invoice), each with its number (click to open it), amount, and whether it's paid, when it's due, or how many days late. Each tile has its own button to make or update that invoice. With no invoice yet, choose **Generate DP Invoice**, or **Generate COD Invoice** for one invoice covering the full amount.
  - **Order Items:** what was ordered, by item and size. Items with several sizes fold into one row (expand it for the sizes). Prices come from the client's catalogue for the order's year. Copy, Edit and Delete sit on each row.
  - **Costs & margin:** the order's value, the Kas Bon costs linked to it, and the profit. Costs count only once a production or operations line is linked to the order (the sheet's Order column); **Bahan lines** and **Operation lines** open those lines.
- **Order Items** lists every item across all orders, for searching and editing in one place.

### Invoices and Kwitansi

- **Invoice** lists invoices, with Unpaid / Paid / All filters. Each row shows the amount due, the type (Down Payment or Pelunasan) and its status; overdue ones are red.
- Invoices are made from an order's page (see Orders). The invoice number follows `NNN/KMA/YY`.
- Opening an invoice shows the print-ready layout on the company letterhead. Page breaks are predicted (shown faint) and can be placed by hand before an item group; printing uses the real page count.
- The receipt icon opens the matching **Kwitansi** for printing.

### Delivery (DO and Surat Jalan)

- **Delivery** lists Delivery Orders (DO, `NN/KMA/DO/YY`) and Surat Jalan (SJ, `NN/KMA/SJ/YY`); each type keeps its own numbering, restarting every year.
- A delivery is tied to an order and one of the client's contacts; choosing the contact fills in the phone number.
- On a delivery's page, items are packed **per box**: add items to a box, and the recap at the top totals every item and size across boxes.
- A new SJ for an order suggests the documents travelling with it: the original Kwitansi and invoice for each invoice raised, plus **COPY PO** when the order has a PO.
- **Print** prints the DO or SJ.

### Finance

One area with tabs: **Overview · Production · Operations · Bukti Kas · Budgets & recurring · Suppliers**.

#### Overview

Choose a month, a year, all time or a date range at the top; **Print Report** and **Excel** download the same figures.

- **Needs attention:** overdue invoices, budgets near their limit, recurring costs not added this month, and Bahan not linked to an order (so missing from order profits). Each has a button that goes straight to fixing it.
- **Totals:** invoiced, spent, profit and margin, cash in minus out, and what's owed.
- **Month by month:** invoiced and spent per month as bars, profit as a line, last year's profit dashed behind it. Click a month to look at just that month.
- **Where the money goes:** spending by supplier, by Bahan, or by operations category. Click a row to open those lines.
- **Cash in and out:** money paid in against money spent, with the running balance.
- **Owed to you:** unpaid invoices by how late they are, with a WhatsApp reminder on overdue ones.
- **Clients** and **Orders:** value, linked costs, profit and what's still owed or paid, per client and per order. Click through to the client or order.

#### Production and Operations (the Kas Bon sheet)

Spending recorded the way the paper Kas Bon does it: Production holds Bahan (materials, by supplier); Operations holds operating costs (by category). Each opens straight on its sheet for the current month.

- **Top bar:** the period's total, the comparison and the budget; the coloured pills below show spend per supplier or category and filter the sheet when clicked.
- **Find things:** search across all months (`/` jumps to the search), filter by supplier, category or order, group by Kas Bon, supplier/category or order, and sort any column.
- **Edit:** click a cell or use the arrow keys and type; the sheet is a single Tab stop, so Tab moves on to the next control instead of through every cell. **Comfortable / Compact** rows at the bottom changes the row height (remembered in this browser).
- **Select lines:** Shift+Space, the checkboxes, or shift-click for a range. Then move them to another Kas Bon, set a supplier, category or order, copy, export or delete them.
- **Colour chip:** a Bahan line from a supplier with a catalogue shows a chip ("● 01 ▾", or "+ Colour ▾"). Click it to pick from the material's colours; colours the supplier no longer has are greyed out and can't be picked.
- **New Kas Bon** (or `n`) enters a whole Kas Bon at once, production and operation lines together. Each line starts with its supplier, so the supplier's catalogue is ready by the time you type the Bahan, and picking a catalogued material fills in its price. Enter adds the next line.
- **From Excel:** copy rows in Excel and press Ctrl+V on the sheet (or into a line of the form). **Import** reads .xlsx or .csv with Indonesian or English headings and local number and date formats ("30.000", "2,5", 05/10/2026), lets you check how columns match up, adds unknown suppliers, and skips lines already saved. **Export** writes an .xlsx of what's shown or selected.
- **Print** prints the Kas Bon.
- Fill a line's **Order** column to count its cost against that order's profit.

#### Bukti Kas

Cash **received**, grouped by Bukti Kas the way Kas Bon groups spending: one card per Bukti Kas with its lines and total. Add a Bukti Kas, add lines to one, and link a line to an order.

#### Budgets and recurring costs

- **Budgets:** a monthly limit for all operations, all production, or one operations category, each with a bar showing how much is used. **Set budgets** changes them. The Overview warns when one gets close.
- **Recurring costs:** costs that repeat every month (rent, electricity), added with **Add**. Tick the ones due and the button under the list ("Add November 2026's 1 cost") puts them into Operations for that month in one click; each shows when it was last added.

#### Suppliers

Supplier records by category (Sablon, Embroidery, Merchandise, Uniform, General). **Catalogue** on a supplier's row opens its catalogue:

- **Catalogue and price-list documents:** upload the supplier's PDF, or photos for a supplier with nothing cleaner (PDF, JPG or PNG, up to 20 MB). The server checks what the file really contains: a file renamed to look like a PDF or photo, a PDF cut off while downloading, an empty file, or a damaged photo is refused with a message saying what to do.
- **Materials:** name, brand, composition, what it's used for, width and roll length, and the current price (which fills in a new Kas Bon line's price).
- **Colours** of each material (expand a material): a code, an optional category and the swatch colour.
  - **Available** switch: turn it off when the supplier no longer has the colour. It stays in the catalogue (old Kas Bon lines still name it) but can't be picked for a new line.
  - **Pick from photo** (pipette icon): take the colour from one of the supplier's photos, or a photo on the device, corrected for the light it was taken in. Tap something white in the photo first (the paper of a swatch card, a label), then the middle of the fabric; a small patch is averaged, and "as photographed" shows beside "corrected" before you save. For the closest colours, take the photo in daylight, without flash, with a white card in the frame. A screen still shows colours slightly differently from the fabric, so check the real thing before promising a colour to a client.
- Every supplier's catalogue feeds the Kas Bon colour picker and swatch in Production.

### Users (admins only)

- **Invite** a staff member by email: they get a link to set their own password (the link expires after a couple of days). There's no self-signup.
- Set each account's **role** (admin or staff), **reset** a password, **deactivate** an account (signed out everywhere at once, and can be turned back on), or **permanently delete** it.
- Everyone can change their own password and turn on **two-factor sign-in** from the account menu (top right).

### Language

The account menu switches between English and Indonesian. Strings live in `src/i18n/locales/{en,id}/`; besides `translation.json`, each screen area has its own file there, merged by `src/i18n/config.ts`. Printed documents (invoice, kwitansi, delivery, price list, finance report, Kas Bon) stay in their paper-form wording.

## Supplier Category Enum (from kma.yaml)

`sablon` | `embroidery` | `merchandise_supplier` | `uniform_supplier` | `general_supplier`

Display labels and colors for these live in `src/constants/supplierCategories.ts` — reuse that shared constant rather than redefining labels/colors locally (see `SuppliersPage.tsx` for the intended pattern).

## Closing KMA logs you out

Closing the last KMA tab or window — or the browser, or the installed app — signs you out: the next time KMA is opened, it's the login screen. A reload doesn't, and neither does closing one KMA tab while another is still open. It's in `src/utils/tabSession.ts` (with `POST /closing` on the auth service):

- **On closing**, a tab tells the auth service, and the session ends 20 seconds later unless something uses it again. A reload does, at once; so do other KMA tabs that are still open, which hear about the close over a `BroadcastChannel`.
- **On opening**, a tab works out whether KMA was closed in between: its `sessionStorage` mark survives a reload but not a close; a new tab asks the other KMA tabs whether one is open; and since browsers that reopen their tabs on start bring `sessionStorage` back too, open tabs note the time in `localStorage` every 30s, and a mark more than 2 minutes stale counts as closed. If KMA was closed, any leftover session is ended on the server (for closes that went unreported, like a phone app swiped away) and the login screen shows.

Limits: a browser that reopens its tabs within 2 minutes of being closed keeps you signed in; and a KMA tab the browser has frozen in the background (phones, battery saver) can't answer, so opening a second KMA tab then signs out both.

## Signed in somewhere else

The auth service allows one session per account. When a login is refused because the account is signed in on another device, the login page says when that session ends by itself and offers **Sign out the other device and sign in here** (`src/pages/auth/LoginPage.tsx`), so a phone that died signed in doesn't lock its owner out for hours.

## Install it as an app (phone or computer)

KMA can be installed like an app, with its own icon, opening full screen without the browser's address bar (`public/manifest.webmanifest`, icons in `public/icons/` made from `public/Logo.png`). Open the HTTPS address the tailnet serves it on (`https://<mac-name>.<tailnet>.ts.net`), then:

- **Android:** Chrome's menu (⋮) → **Install app** (or **Add to Home screen**).
- **iPhone / iPad:** Safari's Share button → **Add to Home Screen**.
- **Mac / PC:** Chrome or Edge, the install icon at the right of the address bar.

Browsers only install from an `https://` address (or `localhost`), so this doesn't work from `http://<ip>`. It's still the website underneath: updates show up the next time it's opened, and it needs the Mac (and Tailscale on the phone) to be on. It isn't in an app store; a store app would need a wrapper such as Capacitor, and the same HTTPS address, for no real gain here.

## Security

- **This repository is public**, history included. Nothing secret belongs in the frontend anyway (all of it is sent to every browser), and `.gitignore` keeps `.env` files, keys and certificates out regardless; `.dockerignore` keeps `.env`, `node_modules` and `.git` out of image builds.
- nginx adds `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` (other sites can't frame KMA) and `Referrer-Policy: same-origin` (KMA addresses, with order numbers in them, aren't sent to other sites) to every response (`security-headers.conf`).
- The image is built with Node 22 (Node 20 stopped getting security fixes in April 2026), and Vite 6: Vite 5's esbuild let any website read the dev server's responses while `npm run dev` ran. `npm audit` still lists `braces`, which every version is affected by, through Tailwind 3's file watcher at build time; it goes with a move to Tailwind 4.

## Build for Production

```bash
npm run build   # outputs to dist/
```

Serve `dist/` with nginx (see `nginx.conf` for the exact routing this app expects: `/api` and `/uploads` → the Go backend, `/auth` → the auth service, everything else → the SPA), or build the Docker image directly with `docker compose build frontend`.
