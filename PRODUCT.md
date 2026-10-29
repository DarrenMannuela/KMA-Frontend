# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are Kreasi Makmur Abadi's own people: the founder, Fifi Lesmana (the invoice/kwitansi signatory), plus a small staff team doing bookkeeping, production/operations spend entry, order admin, and delivery tracking. All accounts are admin-provisioned — there's no self-signup — and sessions are single-device, so this is a small, known, trusted user base rather than a broad public one. It's used daily, often installed as a PWA on a phone or desktop, reached over the shop's Tailscale tailnet HTTPS address.

## Product Purpose

An internal ops dashboard covering the whole order lifecycle for an Indonesian apparel manufacturer: clients and their catalogues, orders, production and operations spend (Kas Bon tracking), deliveries (DO/Surat Jalan), invoicing and receipts (Kwitansi), yearly financial reporting, and staff/admin user management. Success is the same bookkeeping and production-tracking work that used to run on paper and Excel now happening in one place, faster and with less room for error (in-place cell editing with undo, Excel import/export that still accepts their existing sheet formats, print output that matches the paper documents they already use).

## Positioning

Most of this replaced paper and Excel, not another piece of software — Production/Operations spend tracking in particular came from "a continuous Excel sheet where a single month can have multiple Kas Bons," and invoices/kwitansi/DO-SJ came from paper forms. The app's own print views (Invoice, Kwitansi, Delivery, Finance Report, Kas Bon) are deliberately built to match those existing paper conventions rather than invent new ones, and Import/Export round-trips through the same Excel layout staff already know — the mechanism is "keep the paper-era workflow and vocabulary, remove the paper and the manual arithmetic," not a generic off-the-shelf ERP replacement.

## Operating Context

- Two separate Go backend services behind one origin: `kma_backend` (orders/items/invoices/deliveries/production/operations/clients/suppliers) and `kma_auth_backend` (login, sessions, user provisioning), reverse-proxied by nginx so the browser never deals with cross-port cookies.
- Deployed via Docker on a Mac on the shop's network, reachable only through `127.0.0.1` locally and the Tailscale tailnet's HTTPS address otherwise — there is no public internet exposure.
- Bilingual: Indonesian and English (`src/i18n/locales/{id,en}`), with Indonesian business terminology used throughout (Kas Bon, Bahan, Kwitansi, Surat Jalan, bilyet giro) rather than translated-away English equivalents.
- Supplier categories are a fixed enum shared with the backend (`kma.yaml`): `sablon`, `embroidery`, `merchandise_supplier`, `uniform_supplier`, `general_supplier` — labels/colors live in `src/constants/supplierCategories.ts` and should stay centralized there.
- Light and dark mode are both real, used surfaces, not a cosmetic toggle — the navy/gold/slate design tokens in `tailwind.config.js` are shared across both.
- Print views (Invoice, Kwitansi, Delivery, Finance Report, Kas Bon) render outside the app shell (no sidebar/topbar), always light-themed regardless of the app's dark mode setting (a printed page stays white the way paper does), and are reachable only from in-app navigation, not direct URLs.

## Capabilities and Constraints

- Every destructive/bulk edit (cell edits, moves, deletes) in Production/Operations and the catalogue supports undo (toast action or Ctrl+Z) — this is a load-bearing trust feature for a bookkeeping tool, not a nicety.
- Import accepts the business's existing .xlsx/.csv formats (Indonesian or English headings, "30.000"/"2,5"-style numbers, DD/MM/YYYY dates) rather than requiring a specific template.
- An existing CI pipeline runs axe-core accessibility checks; no formally adopted accessibility standard beyond that (confirmed as not needed for now — those checks are the working floor).
- Mobile and tablet matter as real, regularly used contexts, not an edge case — staff use this on phones day to day, including in landscape orientation.

## Brand Commitments

Navy/gold/slate as the identifying palette (`tailwind.config.js`), "Sora" display/body font and "DM Mono" for monospace/data, the KMA logo (`public/Logo.png`). Printed documents carry the company's real letterhead details (name, address, phone, email) — these are factual business records, not placeholder content, and must stay accurate rather than templated.

## Evidence on Hand

- `README.md` documents the full feature set, deploy model, and architecture in detail — treat it as a living source of truth alongside this file.
- Real company details already appear in print templates (KREASI MAKMUR ABADI, Muara Karang address, phone/email, Fifi Lesmana as founder/signatory) — do not replace these with placeholders.
- No design system file (DESIGN.md) exists yet; the incumbent navy/gold/slate implementation across the codebase is the current visual authority until one is written.

## Product Principles

1. **Paper-era vocabulary and documents stay intact.** Kas Bon, Bahan, Kwitansi, Surat Jalan, and the printed layouts tied to them are the product's actual language, not internal jargon to clean up.
2. **Every number stays correctable without fear.** In-place editing only works as a workflow if undo is everywhere it's needed — this outranks almost any other editing-UX convenience.
3. **Mobile is not an afterthought.** Staff genuinely work from phones (including landscape), so navigation and data views need to hold up there, not just degrade gracefully.
4. **Print output is a real deliverable, not a preview.** Invoices, kwitansi, delivery notes, and reports are physical documents staff hand to other people — they're held to paper-document standards (letterhead accuracy, correct pagination, light-themed regardless of app theme), not just screen-reading standards.
5. **Small, trusted user base; admin-gated changes.** No self-signup, single-device sessions, admin-provisioned accounts — the product can assume good faith among its users but should still make destructive admin actions (deactivate/delete a user, batch deletes) deliberate and guarded.

## Accessibility & Inclusion

No formally adopted standard. An existing CI pipeline runs axe-core checks on the E2E suite; treat that as the working accessibility floor rather than a named target like WCAG AA.
