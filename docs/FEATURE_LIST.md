# DumosRx — Feature List

A plain list of what the app can do. Grouped by section, no walkthroughs.
Consolidated from the former `docs/features/` per-section walkthrough docs —
see git history for the original narrative detail (live-verification notes,
bug investigations, test-coverage gaps) if it's ever needed; this file only
tracks current behavior.

## Dashboard
- Today's Sales (net of refunds, with a "vs yesterday" comparison), Total Products, Inventory Value, and Orders Today stat cards
- Action Center (admin only): trial days remaining, low-stock count, oversold count, batches missing expiry, profile completeness, "Get the App," no cloud account, subscription expiring, no staff accounts, and unsynced-changes count — each a clickable card linking to the relevant screen
- Recent Activity feed (5 most recent), each row opening a details dialog scoped to its type (sale, expense, purchase order, prescription, stock movement, product)
- Quick Actions shortcuts, role-filtered
- Notifications bell — a raw activity-log feed, distinct from the curated Recent Activity card

## Point of Sale
- Barcode scanning: a USB/Bluetooth scanner set to send Enter (or Tab) after the code works from anywhere on the POS screen, not just the search box (ignored while a dialog is open or another field has focus); the camera scanner starts on its own once camera access has been granted; matching is exact on barcode or batch number, and an unmatched code shows "No product found" without touching the cart
- Search-based product lookup, category filter pills, "goes well with cart" smart suggestions, a "recently sold" row once a sale completes this session
- Cart with quantity adjustment (click-to-type or +/- buttons), per-item discounts, manual price override, swipe-to-delete on touch
- Hold/park a transaction and resume it later (survives item renames/deactivation by re-matching against the live product list on recall)
- Split payments (Cash, Card, Transfer, Credit, Mixed) with automatic change calculation; Card/Transfer can require a destination account, filtered by account type
- Printable/shareable receipts, with separate Receipt, Proforma Invoice, and Tax Invoice variants (tax invoice adds the store's tax number to the header)
- Proforma quote: preview a price breakdown for the current cart before checkout, no sale recorded and no stock deducted
- Reseller Sale toggle: mark a sale as sold through an independent reseller at a marked-up price. The store-wide commission percentage is computed against the markup at checkout; later, from the sale's transaction details (admins, or the cashier who made the sale), either **Redeem** (pays the reseller their configured commission cut) or **Store Claims Markup** (the store keeps the entire markup instead, paying the reseller nothing) — whichever is chosen is what actually reduces reported profit
- Redeem Reward: spend a customer's loyalty points against an active redemption option as a line discount at checkout — gated by plan tier AND the store's own Loyalty Program on/off toggle, hidden entirely (not just disabled) when either is off
- Request-item flow for products not yet in the catalog, logged for Procurement to review
- Recent Sales: date range filter (presets + custom range, not just Today/This week), fuzzy search by receipt number, customer, or item name; reseller and store-markup sales carry a badge and a "Sale Type" filter
- Online Orders: orders placed on the store's online storefront are listed at the till, and "Fulfill & Deduct Stock" records them as an ordinary sale (stock leaves at fulfilment, not at online checkout)

## Inventory
- Overview: stock health stat cards, a "Needs attention" panel (expiring batches, low/out-of-stock products), and a Fast Movers panel (last-7-days top sellers)
- Catalog: full product list with search, category filter, an inventory-status filter (Active/Inactive/Expiring Soon/Expired/Low Stock/Out of Stock), sortable columns, and a category management dialog
- Barcode labels: print from a catalog row or the product actions menu, on a 50 × 25 mm label roll (one per label) or packed 24 to an A4 sticker sheet (3 × 8) with a start position for partly used sheets, typed quantity with presets, paper/sheet count shown before printing, per-device layout memory, a warning when a barcode is too long to scan, and a Print labels button on the desktop catalog toolbar that prints one label per product for whatever the search and filters show (copies per product, packed across A4 sheets, up to 2000 labels a job)
- Batch cost correction: a pencil on each batch in a product's Batches tab fixes a cost typed wrongly at receiving (review-then-confirm, audit-logged with old and new cost, gated by View Cost & Margin Fields plus Edit Product Cost Price); past sales keep their recorded cost
- Bulk product import: multi-sheet workbook support, auto column-mapping from known header sets (QuickBooks POS, Moniebook, and other common exports), an in-file duplicate warning before committing
- Export: CSV, XLSX, or PDF — all three open the same column-picker dialog (respects whatever search/category/status filter is currently active on the Catalog table)
- Stock Movements ledger: an immutable log of every stock change, searchable by product/reference/user, filterable by type (Sales/Restock/Returns/Damage/Adjustments) and date range
- Cycle Count (Stock Audits): a full-screen count flow — search/category-filtered rows, per-product Counted Qty/Cost/Selling Price with a live diff against system values, a review-and-submit step, and a **Print** button that generates a printable stock-audit PDF (system quantity plus blank columns for a physical count) for staff to work from on paper. Counted Qty opens blank with the system figure shown faintly; a matching row can be ticked instead of retyped; Counted / Not Counted / Qty Differences filters and a Last Counted column; only changed rows are posted on submit
- An unfinished count or stock adjustment is saved on the device per store, so switching stores and coming back restores it
- Multi-till counts: one till holds the count at a time (a renewable lease); other tills in the store see read-only progress and can explicitly take the count over
- Large PDF exports (Catalog export, stock-audit sheet) render in a background worker with a progress overlay, so the UI doesn't freeze on a big catalog

## Prescriptions (pharmacy stores)
- Gated on both the store's Business Vertical being "Pharmacy" and the plan's prescriptions flag — either condition alone is not enough
- Prescription queue with status filter chips (Needs verification / Refills due / Ready for pickup / History) and fuzzy search by patient/medication
- Create/edit prescriptions with patient info, doctor/license, and per-medication dosage/strength/quantity/refills
- Status flow: Needs verification → Process → In progress → Mark Ready → Ready for pickup → Dispense
- Dispense hands the prescription's items off to POS as a pre-loaded, locked cart; checkout then deducts stock through the exact same path an ordinary walk-in sale uses
- Process Return routes to the POS return flow for the prescription's linked sale, rather than the prescription independently changing its own status

## Customers
- Overview: insights strip (Total Customers, Loyalty Members, Total Points, Avg Points/Member), a loyalty-tier segmentation chart, and retention metrics (Retention Rate, Avg Visits/Mo, Avg Transaction Value)
- Directory: fuzzy search across name/email/phone, filter chips (Has debt / Loyalty members), a detail panel showing phone/address/DOB/joined date/total spent/visit count/loyalty points/last visit/tier badge, with Record Payment (once a balance exists), Edit Profile, and View History actions; a customer can be deleted only once they owe nothing
- Activity: per-customer purchase history with search and a date-range picker
- Loyalty Program: tiers (name, minimum spend, points multiplier, benefits, color) and redemption options (label, points cost, optional monetary discount value) are both fully editable. A configurable **Earn Rate** (points per 100 currency units spent) sets the base accrual rate; a customer's tier — based on their spend *before* the current sale — actually multiplies the points that sale earns. A store-level Program on/off toggle pauses earning and hides the checkout redemption control without touching any tier/reward configuration
- Customer payments: a single recording path used from both the Directory and a sale's transaction details, applying a payment FIFO across the customer's oldest pending/partial credit sales; overpayment clamps the balance to 0 rather than going negative

## Procurement
- Vendors & Suppliers directory with aggregated per-supplier stats (total orders, total value, outstanding debt, last order date), a quick-fill combobox of common distributors that still accepts free text
- Purchase Orders: **Standard** (draft → sent → receive, no stock effect until received) or **Immediate** (order and receipt happen atomically, for walk-in/self purchases)
- Receiving: supports a partial receive (less than ordered arrived), per-line cost/expiry entry, an optional selling-price update applied immediately, and additive stock via new batch rows (never a single mutable running total, so receiving can't double-apply or clobber existing stock)
- Saving or editing a PO with a selling price updates the catalog product immediately (only when it differs from the current catalog price, and an Immediate PO's edit form shows the catalog price as of when it was opened), and a toast says how many were repriced; cost stays per stock batch and never touches the catalog
- Requested Products queue, fed by POS's "Request" (Request Item) cart button — de-dupes by product name while a request is still pending, "Mark as Ordered" is a manual acknowledgement (it does not create or link a purchase order)

## Expenses
- Categorized (Rent / Utilities / Salaries / Maintenance / Marketing / Other), plan-gated (paid tiers only)
- Insights strip: Total (all-time, unsmoothed), This month (smoothed), Top category this month, Transactions count
- "Spread over how many months?" smooths a lump prepaid expense's reporting impact across N months, rather than counting it all in one period
- Inline quick-edit (category + amount only) from the desktop table row, alongside the full Add/Edit dialog
- Delete with a confirmation dialog

## Reports
- **Operational Reports** (admin only): 6 report types — Detailed Sales, Inventory Valuation, Profit & Loss Summary, Customer Loyalty, Expense Categories, Top Sellers — each with Export (PDF/CSV) and Print, a shared date-range/staff/payment-method filter bar, and a device-local Recent Downloads panel
- **Daily Close** (every role): a single-day reconciliation view — Total Sales, Cash Expected, Transfer/Mobile, and Total Refunds metric cards (each opens its own filterable/searchable list of that day's matching transactions or refunds), a Profit before expenses (Est.) card that nets out any reseller markup actually paid out, and beside it a Profit after expenses (Est.) card that also takes off the day's expenses (a spread expense counts one day's share of its month) — both hidden from cashiers and each opening a breakdown that adds up to the card, a Payment Breakdown by account, and a Highest Selling Products table (respects the store's uppercase-display setting); Print or Export (PDF/CSV)
- **Analytics & Insights** (admin only): key metrics (Net Sales, Net Profit, Transactions, Stock Batch Value, Customers) plus five sub-tabs — Sales Analytics, Profit & Loss, Stock Batch Insights, Customer Behaviour, Staff Performance
- Reports itself has no plan-tier gate on the page shell — Daily Close is visible to every role; Operational Reports and Analytics & Insights are admin-only regardless of plan; Advanced Reports is separately plan-gated as a *feature*

## Activity Log
- Store-wide audit trail: every insert/update/soft-delete/hard-delete through the shared DB helpers is logged automatically, plus named actions for login/logout, PO receiving, sale returns, and stock adjustments/damage/expiry
- Filters: search (action, table, or staff member), date range, action type, and (admin-only) role/staff — no dedicated "table" filter pill, but searching a table name matches via the search box
- Row detail panel lists every changed field in the record, humanized; the many rows one action writes (e.g. a sale) collapse into one entry with a "Related Actions" drill-down
- Not plan-gated — every tier sees the full log; non-admin roles only ever see their own actions

## In-app Assistant
- A chat panel from the dashboard header or the account menu, answering typed questions offline with no LLM or API key
- "How do I…" answers with steps and a button to the right screen, plus read-only data answers (a product's stock, inventory status, my sales today, store sales for a date, gross/net profit for a period) from the same local data the screens use
- Permission-aware: answers and suggestion chips follow the user's permissions; a cashier asking about store sales gets their own sales instead. Plan-gated (Pro and Enterprise by default)
- Nothing is saved: the conversation lives in memory only

## Help & Support
- A Help & Support screen linking the dumosrx.com/guides walkthroughs, the assistant, the store's account manager contact, and a feedback/issue form that saves locally and syncs

## Settings
- Store profile, branches (multi-store), and business info (Business Vertical, registration/CAC number, tax/VAT number, logo, reseller commission %, Enable Loyalty Program)
- Staff management: create staff accounts, assign roles and custom permission groups. Accounts can be deactivated (retains account in roster with "Inactive" badge for temporary suspension) or soft-deleted (removes account from active roster completely so it no longer clutters the list, while preserving historic sales, receipts, and audit log associations)
- Staff Account Recovery: dedicated "Deleted Accounts" archive tab and "Deleted" status filter with search, role badges, deleted dates, and a 1-click "Recover Account" action (with duplicate username detection and credentials restoration)
- Roles & Permissions: granular permission groups across POS, Inventory, Customers, Procurement, Expenses, Reports, and Settings, customizable per store
- Payment methods (5 independently toggleable: Cash/Card/Transfer/Credit/Mixed) and named destination accounts; receipt customization (paper size is device-local, not synced)
- Regional settings: currency (including CFA franc, XAF/XOF, displayed with the symbol as a suffix rather than a prefix), VAT percentage
- Register configuration: require sale notes, display stock levels at checkout
- Product units (a large built-in list plus custom units, including Metre for by-length sales) and categories, both simple tag-list CRUD
- Notifications: low-stock and expiry warnings, with a configurable "days before expiry to warn"
- Security & Sessions: PIN change, auto-lock duration (plan-gated), and Sessions & Devices management (view active sessions across physical tills and web browsers with parsed device names, IP addresses, last active timestamps, and monospace device IDs; revoke individual sessions or log out all other devices remotely)
- Cloud sync and account linking: auto-sync interval is plan-tiered, with Enterprise able to sync instantly on every change (a "Sync Instantly" option appears in the interval dropdown when the plan allows it); local backup/restore and a local-only Factory Reset also live here
- Billing and subscription management (Free / Starter / Pro / Enterprise, monthly/yearly, referral program)

## Authentication
- PIN-based clock-in via an account-tile picker (up to 5 recent accounts per device, each removable from this device), or a traditional username+PIN form for an unlisted account
- Auto-lock after inactivity (plan-gated), plus a manual lock shortcut
- **Switch Account** (lightweight re-lock to the account picker, nothing cleared) is distinct from **Log out completely** (clears local session state; warns first if there are unsynced offline transactions, since another user logging in next would otherwise inherit them)
- Multi-store and multi-staff account switching from one device; role scoping (nav items, Quick Actions, Action Center) is re-evaluated on every login, not just on first load

## Backup & Restore
- "Download Local Backup" / "Restore from File" export or replace the **entire local database** — every store ever logged into that device, not just one — there's no per-store scoping on either side
- A pre-login restore path exists for a brand-new device ("Have a local backup file? Restore Now" on the no-local-accounts screen), separate from the logged-in Settings → Data flow
- Restoring does not carry cloud-sync linkage across devices (a portable backup file intentionally never contains a live session credential) — a one-time toast prompts re-linking cloud sync on the next load if the device isn't already linked
- An unlinked till can be re-linked without the owner's password: the owner generates a single-use 8-character code (valid 15 minutes, bound to one store) in Settings → Security → Sessions & Devices, and it is entered in Settings → Data → Link Account → "Have a re-link code?"
- Local Danger Zone: Factory Reset (wipe all local data and start fresh)

## Cross-cutting
- Works fully offline; syncs to the cloud automatically when back online, with a plan-tiered minimum sync interval (down to instant on Enterprise)
- Plan-tier feature gating (Free / Starter / Pro / Enterprise): Prescriptions, Procurement, Expenses, Loyalty Program, Advanced Reports, Reseller Commission, Proforma Quotes, Daily Close Report, Cloud Sync, and Auto-Lock are each independently gated, alongside staff-seat and store-count limits
- A store-level Loyalty Program on/off toggle sits independently of plan tier — an entitled store can still pause the program without losing its tier/reward configuration
- Product and category names are stored lowercase and displayed uppercase (or Capitalized, per a store setting) consistently across Inventory, POS, Prescriptions, and report exports
- Dark mode
- Desktop app (Windows, macOS, Linux), Android app, and web dashboard, all backed by the same account

## Online Storefront (`web/`)
- Per-store public storefront at `/store/[slug]`, switched on per store (plan-gated) with a 6-month slug-change cooldown; products show online by default, with a per-product "Show Online" switch
- Home, Shop (searchable, paginated catalog) and checkout, with server-verified Paystack among the payment methods; multi-branch owners get one storefront with a branch picker
- Static pages rebuild automatically (debounced) after a store goes online/offline or changes slug or published details, so a change is live after the next rebuild, not instantly

## Superadmin Panel (`web/`, a separate app from the store-facing dashboard above)
- PIN/password login gated to `super_admin`/`platform_admin`/`agent` roles; session token is memory-only, restored via a refresh cookie on reload
- Store Fleet: list/search/filter every store on the platform, view details (Overview / Sync / Activity tabs; the Sync tab, gated on `view_platform_health`, compares every synced table per device against the cloud and shows how long the oldest unsent edit has waited), assign an account manager, grant a trial, mark/unmark demo, suspend/unsuspend, view billing history, register a new store
- Platform Users: list/search/filter every user, view profile, send notification, force password reset, grant a free trial, deactivate/reactivate, delete, and create new platform-level accounts (admin/agent/super admin)
- Impersonate a store: log in as that store's owner in the store-facing app, then return to the superadmin session via a one-time handoff code
- Global Products: a platform-wide, read-mostly rollup over every store's inventory (category breakdown, per-product store-instance counts, stock-health and NAFDAC-compliance metrics), a bulk "Standardize Catalog" cleanup action, and a metrics CSV export
- Marketing: **Coupons** (create/edit/toggle/delete discount or trial-extension codes) and **Affiliates & Referrals** (program-wide settings, relationship/transaction ledgers, and an administrative credit-balance override) — a coupon-style referral program, distinct from the personal "My Referrals" page below
- My Referrals: every platform user's own personal referral code/link and who signed up through it
- Activity Log: a platform-wide audit trail across every store and staff account, searchable and filterable by action type
- System: live server health metrics, a live Sentry error feed, and the default contact-specialist/account-manager fallback
- Communications: **In-App Broadcasts** (create/toggle/delete banners shown in the store-facing app), **Email Campaigns** (send to all users or a specific set), and **User Feedback** (review and resolve/dismiss submitted crash reports and support tickets)
- Downloads: desktop (Windows/macOS/Linux) and Android release links, sourced live from the production CDN with per-platform existence/size checks
- Platform Settings: System Health, Billing & Plans (subscription tier limits/features), Dynamic Suggestions, Email Templates, Integrations (e.g. the Smartsupp chat widget), and Security (e.g. require email verification) — each tab saved independently
