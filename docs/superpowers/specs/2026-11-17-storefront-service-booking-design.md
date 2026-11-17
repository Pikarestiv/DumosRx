# Storefront service booking and home/POS polish (design)

Date: 2026-11-17. Status: awaiting approval.

## Intent
Store owners selling services (e.g. Cutis dental/aesthetics) need customers to book and pay online, or book and pay at the store, from the same cart as products. Alongside, the storefront home and POS service views should match the product ones.

## Goals
- Mixed cart: products and services in one storefront order.
- Payment: existing methods apply to services too (`in_store`, `transfer`, `paystack`).
- A booking is an order: it gets an order code, printable confirmation, customer phone/email (feedback contact), optional note via the existing order note.
- Orders with service lines show in the till's Online Orders view.
- Storefront copy ("How ordering works", services subtitle) describes booking and pay-now / pay-at-store.

## Non-goals / anti-goals
- No date/time slots, availability or double-booking rules (owner decision 2026-11-17). Revisit if a store asks.
- No separate bookings table or second cart (approach B rejected: breaks mixed cart, duplicates order UI).
- Must not break old tills/PWA bundles (AGENTS.md §11).

## Approach (picked: A)
Extend the existing storefront order. Checkout accepts service lines beside product lines; order items gain a `service_id` field beside `product_id` (add, don't repurpose). Services carry no stock, so stock, backorder and refund-unfulfillable logic skip them. Old clients ignore the unknown field; the compatibility note and retirement condition go in `laravel-server/AGENTS.md`.

## Storefront home
- Desktop products and services grids: 2 rows, last tile is a "+ N more" card linking where "View all" goes.
- Mobile services: 2-3 rows, same more-card, matching products.
- Services get category chips and an item count like products; category icons on service cards.
- Check every storefront theme, not just one.

## Client (till)
- Inventory services table: click-header sorting like products.
- POS services tab: category chips match products (outlined when inactive); service cards get category icons.
- Recent Sales: sale-type filter supports product and service.
- Recent Sales row: capitalize customer names (display only).
- Audit that service create/update/delete/price changes write to the activity log everywhere they should; fix gaps or log them in `docs/KNOWN_BUGS.md`.

## Constraints
- Files under 350 lines, no inline explanatory comments, no hardcoded colours/URLs, DD/MM/YYYY HH:mm timestamps.
- New user-facing feature needs a guide in `web/lib/guides/`; docs and tests updated in the same change; schema changes mirrored across SQLite, MySQL migration and sync.

## Left to the builder
Exact order-item schema/migration, confirmation-page layout, till Online Orders rendering of service lines, tests.
