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

- **Menu.** The sidebar has one link per area: Dashboard, Orders, Delivery, Finance (and Users for admins). An area with several pages has a tab bar at the top of them: **Orders** has All Orders · Order Items · Invoice · Clients, and **Finance** has its six. A client's or an order's own page keeps its tab lit. On phones every page of the area shows at once at the top, as a grid of tiles with an icon and name and the current one filled (Finance two rows of three, Orders one row of four), so none is hidden behind a menu (`src/components/layout/SectionTabs.tsx`).
- **Keyboard.** Press **?** anywhere for the full list (also under the account menu).
  - **Ctrl+K** (⌘K on a Mac), or **Jump to…** in the top bar: type part of a page's name, an order or invoice number, a client or a company, then Enter. Pages and a few actions (dark mode, language, shortcuts) show before anything is typed.
  - **1–4** go to Dashboard, Orders, Delivery, Finance (**5** Users, for admins); **[** and **]** step through the tabs of Orders or Finance.
  - On list pages **/** jumps to the search box (the "/" in the box shows it) and **N** is Add New; **Ctrl+Z** undoes the last change.
  - On print pages **L** opens or closes Layout, and **Esc** closes it.
  - Single-key shortcuts pause while typing, while a table cell is selected (typing there edits the cell) and while a window is open. Pages mark their search box, New button, tab bar and Layout button with `data-kbd`, and one handler serves them all (`src/components/shortcuts/`).
- **Edit in place.** On most tables, click a cell (or move to it with the arrow keys and start typing) to change it; Enter saves, Esc cancels. "click to fill" marks an empty cell that can take a value.
- **Undo.** Edits, moves and deletes show a toast with **Undo**, and **Ctrl+Z** on the same screen undoes the last one. Deleting an order, invoice, delivery, client or supplier can be undone for 30 days, and it comes back with everything the delete removed (an order's items, invoices and deliveries; a client's contacts and catalogue).
- **Lists.** Every list page has one toolbar: search on the left, the record count and **Add New** on the right. Long lists show 100 rows at a time with **Show more**; the Actions column stays pinned on the right when a table scrolls sideways.
- **Light and dark mode** from the moon/sun button in the top bar. The badge beside it shows whether the server is reachable ("Backend live"), so "can't save" and "the server is down" don't look the same.
- **Phones.** Tables turn into cards and pop-ups open as sheets from the bottom. The menu (☰) opens the sidebar. Everything you tap is at least 44px (buttons, icons, filters, the period picker's Month / Year / All / Dates and arrows, links like **View all**): the shared button styles grow on a phone, and the `tap` / `tap-square` classes do the same for links and small text buttons (`src/styles/globals.css`). Toolbars that were only icons get their names on a phone, e.g. a Kas Bon ledger shows **New Kas Bon** across the card with **Import · Export · Print** under it.
- **If a page breaks.** An unexpected error shows a "Something went wrong" card instead of a blank page: **Reload page**, or **Go to dashboard** when reloading breaks it again. **Technical details** under it shows the error message, to pass on when reporting it (`src/components/ErrorBoundary.tsx`).

### Dashboard

The first screen: what needs doing and how the month is going.

- **Top row:** money owed to you (AR receivable, with how much of it is overdue), orders and deliveries this month, and production and operations spending, each with a comparison with last month up to the same day, coloured by meaning (more orders is green, more cost is red).
- **Each card's small chart** covers the last six months, with the months labelled underneath. Orders, deliveries and spending are monthly totals, so they show as bars; AR is a running balance, so it's a line. The current month is still running, so its bar is striped and its point hollow: a low bar early in the month means "so far", not a drop. Point at a month to see its figure ("October 2026: Rp 12.300.000"); it shows in the card where the comparison usually is, so a finger never covers it. On a phone each card takes the full width and its chart stretches across it: tap a month (again to let go) or drag a finger sideways across the months. On a computer, hover, or tab to a chart and step through the months with the arrow keys.
- **Unpaid invoices:** every unpaid invoice, overdue ones first, with how many days late. The WhatsApp button beside an overdue invoice opens a reminder message to the client's primary contact, ready to read over before sending. Click an invoice to open it.
- **Recent orders:** the latest five with their payment status. Click one to open it.
- **Last 6 months chart:** for each month, a bar for what was invoiced (solid = paid, striped = still unpaid) beside a bar for costs (production and operations), and that month's profit underneath. Hover or keyboard-focus a month for the full breakdown. On a phone the breakdown sits in a panel under the chart, showing the current month until you tap another or drag across them. **Yearly** opens the Finance overview.
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
- Opening an invoice shows the print-ready layout, laid out like KMA's own Excel invoices: the logo centred over the company name at the top left, a blue serif **INVOICE**, the client (KEPADA YTH, UNTUK with the address, Telp, Email) on the left and TANGGAL, INVOICE No., PO No., LAMA PRODUKSI and MULAI PRODUKSI on the right; a framed table (ITEM, KETERANGAN, SIZE, QTY / SET, HARGA NET / PCS, JUMLAH) with each item's name bold and centred, and a blank "-" row after each item; then TOTAL, the D/P (in brackets with LUNAS once it's paid, on a Pelunasan) and PELUNASAN with its terms (J/T, or e.g. CASH ON DELIVERY); a numbered CATATAN ending with the bank details; the signatures; who keeps which copy; and the company's address at the foot. Amounts print as 1,000,000. A normal invoice fits on one page.
- **The invoice works like an Excel sheet** on screen, and prints as plain text:
  - Click a cell (or move to it with the arrow keys or Tab) and type to replace it; Enter saves and moves down, Tab moves right, Esc cancels, a double-click or F2 edits what's there. On a phone, a tap edits.
  - KETERANGAN, SIZE, QTY and HARGA are the order's real items, so a change is saved to the order. A KETERANGAN typed on an item's first line renames all its sizes. JUMLAH and TOTAL recalculate, and every invoice of the order is brought in line: an unpaid D/P keeps its percentage, a paid D/P keeps its amount, and PELUNASAN is the total less the D/P and any discount (the same sums as the invoice form). The order page, kwitansi and finance figures stay in step with what's printed.
  - The blank row under each item takes a new line: a size typed there adds that size of the item, a KETERANGAN typed there adds a new item. The **×** at the left of a line (on hover) deletes it, after asking.
  - Rows copied from Excel (KETERANGAN, SIZE, QTY, HARGA; an item number in front and a JUMLAH at the end are ignored, a blank KETERANGAN belongs to the item above) can be pasted onto the table with Ctrl+V; the notice has an Undo.
  - The details at the top are typed in place too: KEPADA YTH, UNTUK and the address, Telp, Email, TANGGAL (e.g. 25/02/2026), LAMA PRODUKSI, MULAI PRODUKSI (saved to the invoice) and PO No. (saved to the order). An empty one doesn't print.
  - **Columns** start fitted to their contents, as narrow as they can be (long headings like HARGA NET / PCS wrap onto two lines). Drag the line between two headings to make a column wider or narrower, like Excel; KETERANGAN takes whatever width is left. A double-click on that line fits the column to its contents again, and **Reset column widths** undoes every drag. Widths are remembered for that invoice in this browser, and print as set. KETERANGAN always keeps at least 160px for the item names: a column can't be dragged wider than leaves that, and if saved widths would squeeze it (on a narrower paper, say), all the columns give way in proportion.
  - **Folding sizes:** the ▾ beside an item with several sizes folds them into one line (its sizes, e.g. "S, M, L, XL", the total quantity, the price or price range, and the total); ▸ unfolds it. **Fold all items** / **Unfold all items** in the toolbar does every item. A folded item prints as that one line, which shortens a long invoice a lot. Its name can still be typed over, and when all its sizes share one price, so can the price (every size takes it). Which items are folded is remembered for that invoice in this browser.
  - "Saving…" shows in the toolbar while a change is being saved. Notices on screen never print.
- On screen, the CATATAN lines, the bank details, the LUNAS mark, the payment terms, a note beside TOTAL and the signatory can be typed over for that print only (they aren't saved). The signature blocks leave room to sign. **Fit to 1 page** (on by default) makes everything on the invoice smaller (text, rows, gaps, logo, title, signing space) by exactly what it takes when it's too tall for one page, measured as it will print; the toolbar shows the percentage. Real sizes are changed rather than the page zoomed, so the preview and the printout lay out the same. Once a size has turned out too tall it only shrinks from there until the invoice changes, so text that wraps differently at each size can't make it switch back and forth (that used to crash the page). It never goes below 70% (about 20 to 24 lines with their blank rows, depending on long names): a longer invoice prints on more pages at full size, and the toolbar says so. It's off while a page break is placed by hand. The preview's page count and page-break hints follow the same measurement, so an invoice that prints on one page never shows a page 2. **Highlight** colours rows, **Add Row** adds an item to the order, + adds blank rows. Page breaks are predicted (shown faint on screen) and can be placed by hand before an item group; "(continued on next page)" prints only at a break placed by hand.
- The receipt icon opens the matching **Kwitansi** for printing.

### Delivery (DO and Surat Jalan)

- **Delivery** lists Delivery Orders (DO, `NN/KMA/DO/YY`) and Surat Jalan (SJ, `NN/KMA/SJ/YY`); each type keeps its own numbering, restarting every year.
- A delivery is tied to an order and one of the client's contacts; choosing the contact fills in the phone number.
- On a delivery's page, items are packed **per box**: add items to a box, and the recap at the top totals every item and size across boxes.
- A new SJ for an order suggests the documents travelling with it: the original Kwitansi and invoice for each invoice raised, plus **COPY PO** when the order has a PO.
- **Print** prints the DO or SJ: one slip per box, two slips to an A4 sheet with a cut line between them, and for a DO a Rekap page at the end. Each slip's header (logo, KREASI MAKMUR ABADI, the DO/SJ number) is the same size as the Rekap's, and the details under it (date, name, untuk, box code, address) print at 12px.

### Print layouts (invoice, kwitansi, Surat Jalan, DO)

- **What:** each kind of printed document has one layout, saved on the server for everyone, so every computer prints it the same way. Until someone changes it, a document prints exactly as before.
- **How:** **Layout** in the print page's toolbar opens a panel beside the page (a sheet from the bottom on phones). Changes show on the page as they're made:
  - **Font** for the whole document. "Document's own" is Arial, plus Cambria for the invoice's title, notes and signatures.
  - **Logo:** left, centre, right, or hidden (the company name stays), and its size. On the invoice the logo and name sit at the left, centre or right of the page; on the kwitansi "centre" puts them above KWITANSI; on the SJ and DO the logo goes beside the name or centred above it, and the DO's Rekap page follows.
  - **Text sizes:** company name, document title (on the kwitansi also the RP. amount), details (client, dates, numbers), table and text, signatures and notes.
  - **Spacing** between the parts of the page, 50% to 200%.
- **Save for everyone** keeps the changes; **Discard changes** drops them; **Reset to default** goes back to the built-in layout (then Save). An unsaved change is marked with a dot on Layout, and it's what prints if you print before saving, so a change can be tried on paper first. Leaving the page drops it.
- On the invoice, **Fit to 1 page** still shrinks everything together when larger sizes make it too tall.
- **Print pages on a phone** (invoice, kwitansi, Surat Jalan/DO, reports, Kas Bon print) share one short bar: back arrow, the document's name, **Layout** (or **Tools** on the invoice, where Layout is the first tool, then Fit to 1 page, Fold all, Highlight, Add Row, paper size, Kwitansi and page breaks, in a sheet from the bottom) and **Print**. The page fills the screen width, with **Actual size** at the bottom right to see it at its real size and scroll around it (**Fit to screen** goes back). The Layout panel takes the lower half of the screen so the page stays visible above it (`src/components/print/PrintToolbar.tsx`).
- Saved by `PUT /api/v1/print-layout/:type` (`invoice`, `kwitansi`, `sj`, `do`); `src/utils/printLayout.ts` holds the defaults and limits, `src/components/print/PrintLayoutPanel.tsx` the panel.

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
- **Colour chip:** a Bahan line whose Bahan is one of its supplier's catalogue materials shows a chip ("● 01 ▾", or "+ Colour ▾"). Click it to pick from the material's colours; colours the supplier no longer has are greyed out and can't be picked.
- **Design chip:** a line whose supplier has designs (bordir, sablon) shows a **Design ▾** chip in the Bahan cell, or the design's photo once one is picked. Click it for the supplier's gallery of photos; picking one sets the Bahan to the design, the unit to pcs and (with **Also use the design's price per piece** ticked) the price, as one change with one Undo. New Kas Bon has a **Pick a design** button on such lines (typing the Bahan also suggests the designs), and so does a line's edit window on a phone; the phone's line list shows each design's photo.
- **Catalogue chip:** when a line's supplier has a catalogue but its Bahan isn't one of the materials in it (it was typed by hand, or the wrong supplier was picked and then changed), the Bahan shows a dashed **Catalogue ▾** chip instead. Click it, choose the material, then its colour: the Bahan becomes the catalogue's "BRAND - MATERIAL - CODE", and with **Also use the catalogue's price** ticked, the price changes to the catalogue's too. It's one change, so one Undo puts both back. On a phone, tap the line: its edit window has the Supplier above the Bahan, and a **Pick from … catalogue** button when the Bahan isn't in that supplier's catalogue.
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

Supplier records by category (Sablon, Embroidery, Merchandise, Uniform, General). **Catalogue** on a supplier's row opens its catalogue.

- **On a phone** the catalogue rearranges for a finger: the add-material form stacks full width, each material is a card (tap its name to open it) with every field labelled and full size, and each colour is a card with a big swatch (tap it to change the colour), its code and category, a large Available switch, **Pick from photo** and a delete button, all at least 44px. A computer keeps the compact table.

**Bordir and sablon suppliers** work from designs, not fabrics, so their catalogue is a **Designs** gallery: each logo, slogan or name tag the supplier makes for KMA, with a photo of the stitched or printed sample, its placement (e.g. DADA KIRI), its size (e.g. 7 CM), the price per piece and an optional note. **Add a design** takes the photo and details together; click a design to edit it or replace its photo. A Kas Bon line for that supplier then picks a design the way a fabric line picks a colour (see the sheet's **Design** chip): the Bahan becomes "DESIGN - PLACEMENT - SIZE", the unit pcs, and the price the design's price per piece. Their catalogue still holds uploaded files, but without **Read colours**.

For every other supplier the catalogue is:

- **Catalogue and price-list documents:** upload the supplier's PDF, or photos for a supplier with nothing cleaner (PDF, JPG or PNG, up to 20 MB). The server checks what the file really contains: a file renamed to look like a PDF or photo, a PDF cut off while downloading, an empty file, or a damaged photo is refused with a message saying what to do.
- **Read colours** (beside an uploaded file): reads the colour swatches off a catalogue PDF or photo instead of typing them in. Each page is shown with every swatch found boxed and labelled; pages that aren't swatch cards (covers, info pages, model photos) are left out. It works two ways, chosen for you:
  - **A digital PDF** (one made on a computer, like SAI's): each swatch takes the code printed beside it, exactly as printed ("023 - T", "145-T"), and a word in brackets by the code ("(SATPAM)") becomes its category. The colours are the file's own, so they're used as they are, with no lighting correction.
  - **A scan or a photo** (like Gayatex's): the codes are part of the picture, so they're numbered in reading order from the first code you give (e.g. 001, down columns or across rows, carrying on across pages), and the colours are corrected for the scan's lighting using the white of the paper. Check the numbers against the card.
  - **A phone photo** of a thread colour card (bordir) or an ink chart (sablon) works the same as a scan: set **Colour codes** to *Numbered from a first code*, type the card's first code (e.g. B-101 or S-01), and pick **Across rows** or **Down columns** to match how the card counts. The paper or card around the swatches is the white reference, even when the lamp makes it look cream or blue. For a good photo: the whole card flat in the frame, taken straight on, daylight or one even light, no flash or glare.

  Either way, check the result before adding: tap a swatch to remove it (it simply disappears from the page; **Bring back** beside the page's heading restores what you removed, and tapping the same spot again does too), tap the spot of one it missed to add it (a pure-white swatch with no outline can't be seen on white paper, so it always needs this; a digital PDF still fills in its printed code), and change any code in the list beside the page. Then pick the material, or name a new one, and **Add**. Codes the material already has are skipped, so reading the same file twice doesn't duplicate anything.
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
