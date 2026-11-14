# Storefront redesign

## Decisions that supersede the brief below (agreed 2026-11-14)

- **A super admin assigns the look, not the store owner.** A preset is a theme
  id chosen in the admin store detail, and the registry must stay open-ended:
  adding a look is one `STOREFRONT_PRESETS` entry plus its PHP allow-list id.
  Existing stores keep their accent theme until re-themed.
- **No server rendering.** `web/` stays a static export (`output: "export"`).
  The catalog list is fetched from the paginated `GET /storefront/{slug}/products`
  at runtime, with infinite scroll and debounced search, because stores can
  hold ~3,000 products. §5's "products in the HTML" goal is dropped.
- **No per-product pages or OG images.** A shared link previews the store, not
  the item.
- **Rebuilds are manual.** Saving a theme marks the store "Pending rebuild" but
  does not dispatch; a super-admin "Rebuild storefronts now" button fires the
  existing `storefront-changed` dispatch via Laravel.
- **i18n is deferred** (§7, Divamax only, later). Keep copy in one place.
- **The admin "Online Storefront" card moves to its own tab** in store detail,
  holding the preset picker with a live preview and the storefront settings.
- **Logo:** `storefront.logo_url` falls back to the store's own `logo_url`.
- **Owner-facing settings later:** the till's Settings > Business Information
  card (`client/components/settings/store/business-information-card.tsx`)
  currently holds the storefront slug and online-store toggle. When owners get
  to choose their own theme, the storefront controls move out into a separate
  "Online Storefront" card directly beneath it. Not built yet.
- **Local preview:** the till's slug field prefix comes from
  `NEXT_PUBLIC_STOREFRONT_BASE_URL` (default `dumosrx.com/store`), so set it in
  `client/.env.local` (e.g. `localhost:3000/store`) to see a local link.

Phases 1 (foundation), 2 (home page and product card), 3 (catalog) and 4 (admin tab) are built; 5 follow the order in §10, minus the dropped items. Phase 2 also moved the header to logo + search + cart (no nav links) and added `stock_quantity`/`in_stock` to the product payload.

---

# Storefront redesign brief

Save this file in the repo as `docs/storefront-redesign.md`. Put the design screenshots in `docs/storefront-redesign/`.

## How to use this with Claude Code

Start a session in the repo and paste:

> Read `docs/storefront-redesign.md` and look at every image in `docs/storefront-redesign/`. Then explore how the public storefront (`/store/[slug]` and `/store/[slug]/catalog`) and the storefront settings screen are built today: routes, components, data fetching, the current theme setting and how it is stored. Before writing any code, give me a plan that says which files change, what the data model changes are, and how existing stores move over without breaking. Wait for me to approve the plan. Then build it in the phases in the brief, one phase at a time, and stop after each phase so I can check it.

---

## 1. Why we're doing this

The storefront is a selling point for DumosRx. Right now every store looks like the same template with a different name: same blue, same hero with a pill label and a decorative circle, same text-only cards, same "Genuine products, ready when you are" section, same FAQ. The current theme picker only changes the accent colour.

What we want: each store looks like its own business, the page works on a phone, and a store owner would be proud to share the link on WhatsApp. It should look like a senior product designer made it, not like a generated template.

## 2. Core idea: style presets, not just colours

A store's look is made of:

- **Preset**: sets the structure and personality (fonts, corner radius, hero layout, card style, how dense things are). Ships with three: `workshop`, `clinic`, `studio`.
- **Accent colour**: one colour the owner picks. Keep the current swatches and add a custom hex input.
- **Logo**: optional upload.
- **Store details**: tagline, address, opening hours, phone, WhatsApp number, pickup time estimate.
- **Language and currency**: drive all text and number formatting (see §7).

Build presets as design tokens (CSS variables) plus a few layout variants for each section. Do **not** fork the page into three copies. Every preset uses the same components and the same data.

Existing stores: map them to the preset that best fits their store type (pharmacy → `clinic`, everything else → `workshop`) and keep their current accent colour. Nothing should break when this ships.

### Preset tokens

| Token | workshop (hardware, general retail) | clinic (pharmacy) | studio (beauty, spa, fashion) |
|---|---|---|---|
| Display font | Archivo 800 | Figtree 800 | Fraunces 500 (serif) |
| Body font | IBM Plex Sans | Figtree | DM Sans |
| Price font | IBM Plex Mono 600 | Figtree 700 | DM Sans 500 |
| Page background | #F7F5F0 | #F6F9F8 | #F6EEE9 |
| Ink (text) | #141412 | #0E2A25 | #33232A |
| Hero style | Dark, full-width band (ink background) with a store info panel on the right | Light tint of the accent, left-aligned | Centred text, no band, lots of space |
| Card radius | 10px | 14px | 4px |
| Button shape | 8px corners | Fully round (pill) | Fully round, outlined |
| Default accent | #F2B705 gold, with ink text on it | #0F6B58 | #7A4252 |

Load fonts with `next/font`, or self-host them, and load only the active preset's fonts.

Accent colour rule: if the accent is too light for white text (contrast below 4.5:1), use ink-coloured text on accent buttons instead. Work this out automatically.

## 3. Home page structure (`/store/[slug]`)

Top to bottom:

1. **Utility bar** (thin): "Store pickup · Local delivery" on the left. Language switch on the right, shown only if the owner has turned on more than one language.
2. **Header**: logo (if there's none, a square with the store's initial in the accent colour), store name, store type and city underneath, a search box, and a cart button with an item count.
3. **Hero**: things that are true about *this* store, not generic copy:
   - Open/closed status from opening hours: "Open · closes at 6:00 pm" with a green dot, or "Closed · opens tomorrow at 8:00 am".
   - The owner's tagline. If it's empty, fall back to a per-store-type default (§8).
   - Main button: "Browse products". Second button: "Message on WhatsApp" (`https://wa.me/<number>`), shown only if a WhatsApp number is set.
   - Store info panel: address, hours, phone, payment options, pickup time. Hide any row whose value is empty.
4. **Category chips** with an "All · N" first, then the categories. They filter the grid underneath without reloading the page.
5. **Product grid** (§4). Show up to 8 items on the home page, plus a "View all N products" link.
6. **How ordering works**: three numbered steps (Choose → Pay → Collect) laid out as a row with a top border, not as cards.
7. **Footer**: quiet. Logo, store name, address, hours, and a small "Powered by DumosRx" link.

**Remove:** the pill label with the sparkle icon, the decorative circle, the "Genuine products, ready when you are" section, the generic "About" text, the FAQ cards with "?" icons, and the full-width blue footer. If the FAQ stays at all, it becomes a short expandable list (`<details>`), written for the store type (§8), and it never mentions features that don't exist (branch switcher, Locations section).

Only mention branches ("your nearest branch") when the store has more than one.

## 4. Product card

- **Top:** a 4:3 image area. Until product photos ship, show a **category tile**: a soft background tint plus a simple line icon, with the category name in small uppercase in the top-left corner.
  - Tint colours are light shades of the accent, picked consistently per category (hash the category name so each category always gets the same tint). The grid should read as varied, not uniform.
  - Match icons to categories carefully, by keyword (bulb → lighting, breaker → electrical, pill → drugs, spray → sprays, jar → creams, droplet → serums/scrubs, wrench → tools, basket → provisions). If nothing matches, use a neutral box icon. A wrong icon looks worse than a neutral one.
  - The tile should be ready to switch to a real photo when product images ship, with nothing else about the card changing.
- **Below the image:** product name (up to 2 lines, then cut off with "…"), price, a stock hint ("In stock", or "Only 3 left" when stock is 5 or fewer, or "Out of stock" with the add button turned off), and a square or round **"+" add button** at least 44×44px with an aria-label like "Add to cart: {name}".
- **No full-width "Add to Cart" buttons.**
- **Price is 0 or missing:** show "Price on request" with an "Ask" button that opens WhatsApp with a ready-made message ("Hi, how much is {product}?"). Never show ₦0.
- Fix the category labels: Title Case for display, and fix typos where they come from our own seed data (e.g. "busicuit").

## 5. Catalog page (`/store/[slug]/catalog`)

- **Render products on the server** (SSR/SSG with revalidation). Right now the page sends "Loading products…" to search engines and link previews.
- Search filters as the user types. Remove the separate Search button.
- Categories: a sticky sidebar on desktop, a horizontal scrolling chip row on mobile.
- 53 products don't need pagination. Show them all, or load more as the user scrolls past 60.
- Every product gets its own URL (`/store/[slug]/p/[productSlug]`) with Open Graph tags (name, price, store name, and the category tile rendered as an OG image) so owners can share single products on WhatsApp.

## 6. Mobile (most shoppers are on phones)

- A 2-column product grid at phone width.
- A **sticky cart bar** at the bottom once the cart has items: "View cart · 2 · ₦4,500".
- The hero gets shorter: status line, tagline, two buttons side by side, and one line with address and hours.
- Every touch target is at least 44px.

## 7. Internationalisation

- All text the storefront itself shows (buttons, headings, steps, footer, cart, checkout, empty states, errors) comes from translation files. Start with `en` and `fr`.
- New store settings: `locale` (default from country), `currency` (already exists?), and optionally `enabledLocales` to show the language switch.
- Format prices with `Intl.NumberFormat(locale, { style: 'currency', currency })`. French + XAF gives `1 500 FCFA`; English + NGN gives `₦1,500`. Never build price strings by hand.
- Format opening hours and times with `Intl.DateTimeFormat`: `18h00` in French, `6:00 pm` in English.
- Set `<html lang>`, the page title and Open Graph tags from the store's locale.
- What the owner writes (tagline, product names) stays in whatever language they write it in. No machine translation.

## 8. Default copy by store type

Store type (pharmacy, beauty, hardware, general, supermarket…) chooses the default tagline, the "how ordering works" wording and the FAQ. Pharmacy-only text (prescriptions, pharmacists, returns on dispensed medicine) must only appear for pharmacy stores. Owners can override the tagline.

## 9. Storefront settings screen

Replace the colour-dots-only theme picker with:

- **Style preset:** three cards, each with a small live preview of that preset (header, hero and two cards), using this store's own name and products.
- **Accent colour:** the current swatches plus a custom hex input, with a warning if contrast is too low.
- **Logo upload**, plus the store detail fields (tagline, address, hours by day, phone, WhatsApp, pickup time).
- **Languages:** the default language, and whether to show the language switch.
- A **Preview** button that opens the live storefront.
- Fix the unstyled "Change address" button and slug text, which currently show in the browser's default serif font.

## 10. Phases

1. **Foundation:** data model and migration for preset, accent, logo, store details and locale; presets as design tokens; the i18n setup and number/date formatting. Existing stores render on the `workshop` preset without breaking.
2. **Home page and product card** as in §3, §4 and §6, with all three presets working.
3. **Catalog page:** server rendering, search, filters, product pages and OG images (§5).
4. **Settings screen** (§9).
5. **Polish:** empty states (no products, no categories, store closed), loading skeletons, an accessibility pass (contrast, focus states, labels, keyboard), and a Lighthouse check on mobile.

## 11. Done means

- Divamax (French, FCFA, hardware), Nest (English, ₦, pharmacy) and Cutis (English, ₦, beauty, mostly unpriced) each look clearly different, and none of them shows ₦0, pharmacy text in the wrong store, or English text on a French store.
- Viewing the catalog page's source shows the products in the HTML.
- A shared product link on WhatsApp shows the product name, price and store.
- Mobile Lighthouse: performance ≥ 90, accessibility ≥ 95.
- Text contrast is at least 4.5:1 everywhere, including grey labels.
