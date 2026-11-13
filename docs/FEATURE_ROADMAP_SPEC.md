# DumosRx Feature Roadmap & Implementation Spec

This document holds only what we still **want to build**, sorted by implementation difficulty (easiest first). The goal is to shift DumosRx from a "passive record-keeper" to an "active intelligence system."

Completed work does not belong here. When an item ships, remove it (or, if only part of it shipped, cut it down to the part still open, phrased as remaining work) and describe what the product now does in `docs/FEATURE_LIST.md` and `docs/SYSTEM_FEATURES_DOCUMENTATION.md`. Implementation notes and gotchas go in the relevant package's `AGENTS.md`, and bugs go in `docs/KNOWN_BUGS.md`.

---

## 🛡️ Architectural Rules & Safety Constraints

- **Navigation Principle:** All features must exist in exactly ONE primary entry point (no duplicates across tabs).
- **AI System Rule:** AI is NOT allowed to directly mutate state. All actions must go through a generated "intent → confirmation → execution" pipeline.
- **WhatsApp Architecture Rule:** WhatsApp must operate on read-only queries (safe) or queued write actions (confirmed in-app or via admin approval).
- **Internal Observability Requirement:** All systems must log user actions, system failures, sync events, and AI decisions. Critical for debugging offline-first sync issues and AI auditing.

---

## 🧭 Recommended next, from the 2026-10-18 sync architecture review

The review concluded the sync engine should **not** be rewritten: every defect the October audit found (A-271 → A-290 in `docs/FIXED_BUGS.md`) was local to a sound design. Still open from what it recommended:

1. **A two-device simulation harness**, asserting the three properties nothing tests end to end today: eventual agreement between two devices and the cloud, ledger consistency (a batch's quantity equals the sum of its movements on both sides), and no lost edit without a trace. The per-table agreement digest already computes the oracle; what is missing is a test that drives two clients against one server.
2. **Derived-quantity Stage 3 (retirement)** (`docs/superpowers/specs/2026-10-10-derived-stock-quantity-design.md`; Stages 0–2 have shipped): delete `deferred-stock-deltas.ts`, `_pending_stock_deltas` and the per-page drain, and demote `healStockIntegrity()` from repair to assertion. Stage 4 is optional and waits on field data. Soft-deleting `stock_movements`/`stock_batches` (A-283) depends on this design.

---

## 🟢 Quick Wins (hours – ~1 day)

### Record the guide videos

- **Current state:** the in-app Help & Support hub and the `dumosrx.com/guides` pages exist, and every guide carries a video placeholder (`web/lib/guides/`).
- **Remaining:** record the screen recordings and swap them in for the placeholders. This is authoring work, not engineering.

### PostHog Integration

- **Description:** Add PostHog (funnel analytics, session replays) alongside the live Sentry crash reporting.
- **Cost:** Free tier: 1M events/mo.
- **Effort:** ~half a day.

---

## 🟡 Small (1–3 days)

### Payment Restriction (Deferred 2026-08-14)

- **Current state:** "Require Payment Destination Account" (`payment-settings-card.tsx`) only makes cashiers pick which bank/till account a payment landed in. Nothing restricts *which payment methods* are allowed, by whom, or above what amount.
- **Action:** If wanted, add a payment-method restriction layer (e.g. disable cash above ₦X, restrict certain methods to certain roles) as a separate setting from the destination-account toggle.
- **Effort:** ~1–2 days: new setting + enforcement at checkout, no new subsystem.

### Pricing groups / bulk-vs-unit pricing (Deferred 2026-08-14)

- **Current state:** bulk-unit conversion (`units_per_bulk`/`bulkUnit`) exists only in procurement. There is no way to sell a bulk unit at a different price than the base unit.
- **Source:** Flagged by Cynthia: selling e.g. a carton at a different per-unit price than a single piece.
- **Action:** Add a bulk selling price field alongside the unit selling price, and surface bulk-vs-unit as a line-item choice at checkout.
- **Effort:** ~2–3 days: schema + POS/checkout logic change on a core sale-item path.

### Pending-sync logout warning still counts the login's own audit row

- **Current state:** `getSyncQueueCount()` (`client/lib/db/queries/setup.ts`) already excludes automatic crash-report rows (`CRASH_REPORT_QUEUE_ROW_SQL`, see `docs/SYNC_CRASH_REPORT_POLICY.md`). It still counts every `audit_logs` row, and `logAction()` (`client/lib/db/core.ts`) queues one for every audit event including `LOGIN`, so the logout warning (`useAccountActions`) fires on a queue whose only content is the audit trail of the login that just happened.
- **Action:** extend the same filtering to low-value `audit_logs` actions (`LOGIN`/`LOGOUT`), or restrict the count to business-critical tables, and verify that real pending business data still warns. A best-effort sync attempt on logout can sit on top but does not replace the filter.
- **Effort:** ~half a day.

---

## 🟠 Medium (3–5 days)

### Product & Service Images Feature

- **Description:** Support uploading and displaying product photos and service banner/thumbnail images across the POS catalog, inventory tables, and customer-facing storefronts.
- **Value:**
  - Speeds up cashier recognition on touchscreens in high-volume retail, beauty salons, spas, and supermarkets where item names are similar.
  - Directly enhances the public online storefront with visual product showcases.
  - Provides visual line items on digital receipts and customer-facing displays.
- **Architectural & Offline Constraints:**
  - **No raw binary blobs in SQLite/MySQL:** Never store image base64 strings directly in SQLite or MySQL rows to avoid severe database bloat and sync engine throttling.
  - **Cloud Media Storage & CDN:** Uploads are dispatched to S3-compatible cloud storage (e.g., Cloudflare R2 or GCS) via signed URLs from `laravel-server`, saving only optimized public CDN URLs in `products.image_url` and `services.image_url`.
  - **Offline Client Caching:** Client Tauri/PWA caches thumbnail-sized WebP assets locally (via Cache Storage / IndexedDB), ensuring images remain available even when the till loses internet connection.
  - **Graceful Fallbacks & Low-Spec Mode:** Defaults back to lightweight category SVG icons whenever an image is missing or offline. Adds a store display setting toggle ("Show images in POS grid") so low-memory devices can disable images for maximum rendering speed.
- **Effort:** ~3–4 days (storage endpoints, image resizing pipeline, local cache adapter, catalog/POS card thumbnail components).

### Migration from other systems: what the product import does not cover yet

- **Current state:** Inventory's product import reads CSV and XLSX (every sheet of a workbook), auto-maps columns from known QuickBooks POS, Moniebook and DumosRx headers, lets the user confirm or correct the mapping (`import-mapping-dialog.tsx`), and warns about in-file duplicates. The old QuickBooks `.IIF` importer no longer exists.
- **Remaining:**
  - Legacy `.xls` files are refused with a "save it as .xlsx" message (`client/lib/utils/spreadsheet-io.ts`); QuickBooks 2013 exports `.xls`.
  - Only products import. Customers (with balances), suppliers and opening debts from the old system have no import path.
  - No migration report after an import (what was created, skipped, merged).
  - Confirm the whole path end to end against a real exported file from the client's QuickBooks and Moniebook stores; this was originally flagged as blocking her second store's move off Moniebook.
- **Effort:** ~3–5 days.

### AI Assistant: LLM phase (Phase 2+)

Phase 1, the offline intent router, has shipped (`client/AGENTS.md`, "In-app Assistant"). The LLM approach below is the remaining phase: the only path to open-ended questions and to **AI Reorder Forecasting**, which the intent router deliberately does not attempt. It must be a second `AssistantBrain` implementation behind the existing interface, reusing the `AssistantTool` definitions in `client/lib/assistant/tools/` rather than redefining them server-side, and it must fall back to the offline router when there is no connection (the assistant works offline today and must not regress to online-only).

> **Architecture Decision (for the LLM phase): Use third-party LLM APIs, server-proxied.**

**Why NOT embed a local model:**

| Approach | Bundle Size Added | Works Offline | Quality | Monthly Cost |
| --- | --- | --- | --- | --- |
| Local model (llama.cpp/Ollama) | +2–8 GB | ✅ | Medium | Free |
| VPS-hosted LLM (self-hosted Ollama) | None | ❌ | Medium | ~$20–50/mo |
| **Third-party API (Gemini/GPT)** | **None** | **❌ (online-only)** | **Best** | **~$0–5/mo at low volume** |

**Chosen approach: Server-Proxied Gemini API**

- The client sends requests to a new Laravel endpoint (e.g. `POST /api/v1/ai/query`)
- The Laravel server calls the **Google Gemini API** and returns a structured response
- The API key is stored securely server-side (never exposed to the client)
- The LLM answers are clearly **online-only** (same as sync, backups, broadcasts: acceptable)

**Recommended Model: Google Gemini 1.5 Flash** (re-check current models and pricing before building)

- Extremely fast response times
- Structured JSON output support (required for action cards)
- **Free tier:** 15 requests/minute, 1 million tokens/day, 1,500 requests/day: enough for early-stage usage
- **Paid tier:** $0.075 per 1M input tokens, $0.30 per 1M output tokens: effectively cents per query

**Setup Requirements:**

1. Google AI Studio account → generate Gemini API key
2. Add `GEMINI_API_KEY` to Laravel `.env`
3. Install `google/generative-ai` PHP package (or use plain HTTP client)
4. Build `AiController` with `query`, `command`, and `action` endpoints
5. Add the LLM brain to the existing assistant panel (structured card output, not chat paragraphs). This must include **AI Reorder Forecasting** (e.g., analyzing sales velocity to predict when an item will run out and suggesting a purchase order).
6. Apply `throttle:20,1` middleware to AI routes to prevent abuse

**Cost Summary:**

- Development: ~3–5 days
- Running cost at 500 queries/day: **effectively $0** (within free tier)
- Running cost at 10,000 queries/day: ~**$1.50–3/month**

### Prepaid / Amortized Expense Recognition: Tier 2 (full accrual)

- **Current state:** Tier 1 smooths a prepaid expense across `covers_months` at read time; everywhere Net Profit is computed shows the smoothed figure.
- **Remaining:** a proper `prepaid_expenses` recognition ledger with real monthly rows generated automatically, so cash-flow reports can diverge correctly from smoothed P&L.
- **Revisit if:** there's demand for accountant-facing exports or a genuine cash-flow-vs-accrual distinction.
- **Effort:** ~3–5 days (new ledger table + migration + query rewrites).

### Online store: stop two customers buying the last unit

- **Current state:** stock is only deducted when the store fulfils an online order from the POS, not at storefront checkout, so two customers can both order the last unit before either is fulfilled. A store with **Allow sales beyond recorded stock** on records a confirmed oversell as owed units; the checkout race is unchanged.
- **Action:** a scoped design pass for either a stock hold at order time or a live-stock check at checkout. Both are nontrivial offline-first, because the server's stock count is only as fresh as the last sync. Worth doing if overselling becomes a real complaint.

### Online store: order progress statuses, then re-link Track Order and Prescription Upload

- **Current state:** a store can only move an online order from pending straight to fulfilled or cancelled. `/store/[slug]/track` and `/store/[slug]/prescription` work but are not linked from any storefront page, because there is no in-between progress to show.
- **Action:** add intermediate statuses (e.g. confirmed, ready for pickup, out for delivery) that a store can set from the POS online-orders screen, then link both pages again.

---

## 🔴 Large (1+ week)

### Register configurations: real cash-session management (Deferred 2026-08-14)

- **Current state:** No cash-drawer/session concept exists. The dashboard's "End of Day" quick action opens Daily Close (`daily-close-report.tsx`), a **read-only report**: no opening float, no cash-count input, no discrepancy tracking, no session lock/unlock.
- **Action:** Decide whether real register-session management (open register with a starting float, log cash in/out during the shift, close with a counted-vs-expected reconciliation) is worth building, or whether the reporting-only version is intentional for this market.
- **Effort:** ~1 week+: new session state machine, cash-count UI, discrepancy reporting, and offline-sync implications (register sessions need to reconcile like everything else in the sync engine).

### WhatsApp Integration System

> **Use Meta WhatsApp Cloud API directly (no middleman BSP needed).**

**Cost Breakdown (Nigeria-specific):**

| Conversation Type | First 1,000/month | After Free Tier |
| --- | --- | --- |
| User-initiated (service) | Free | ~$0.021/conversation |
| Business-initiated (utility/alerts) | Free | ~$0.034/conversation |
| Business-initiated (marketing) | Free | ~$0.042/conversation |

> A "conversation" = a 24-hour messaging window, not per-message. At typical store usage (alerts, stock queries), most interactions fall in the free tier for months.

**Estimated Monthly Cost at Scale:**

- 100 active stores, avg 20 WhatsApp interactions/month each = 2,000 conversations
- ~1,000 free + 1,000 × $0.021 = **~$21/month total platform cost**

**Setup Requirements (High Friction: plan 2–3 weeks):**

1. **Facebook Business Manager account**: must be verified (requires business docs: CAC, address, etc.)
2. **Meta Business Verification**: typically takes 3–7 business days
3. **Dedicated phone number**: cannot be a number already on personal/regular WhatsApp
4. **WhatsApp Cloud API access**: applied through Meta Developer Console
5. **Webhook endpoint**: add `POST /api/v1/webhooks/whatsapp` to Laravel
6. **Message templates**: pre-approved by Meta for business-initiated messages (24–48hr approval)

**Implementation Phases:**

- **Phase 1 (Alerts):** Low-stock alerts, expiry warnings, payment reminders: outbound only
- **Phase 2 (Queries):** Natural language queries ("how many paracetamol left?"): inbound, read-only
- **Phase 3 (Commands):** Queued write actions ("/reorder amoxicillin 50"): requires in-app confirmation

**Best paired with the AI Assistant.** Phase 2's read-only queries do not need an LLM: the offline intent router (`client/lib/assistant/`) already parses that class of question, so the work is routing a WhatsApp message into `answer()` rather than building a parser. Phase 3's write commands still need the confirmation flow described above.

**Effort:** 2–3 weeks, mostly external approval latency (Meta Business Verification), not engineering time.

### Open Banking Transaction Reconciliation

- **Description:** Integration with Nigerian Open Banking APIs (e.g., Mono, Okra).
- **Value:** Allows the store owner to link their corporate bank account. When a cashier logs a "Bank Transfer" payment on the POS, the system automatically checks the bank API to ensure the credit actually hit the account. This completely eliminates "fake transfer" fraud.
- **Effort:** Unestimated: external API integration + fraud-sensitive correctness requirements, realistically 1–2 weeks.

### Tauri Rust-Level Security Hardening

- **Description:** Moving all JWT license validation and decryption logic away from the React/Javascript frontend into the compiled Rust backend.
- **Value:** Ensures hackers cannot easily bypass the subscription lock. If a user tries to modify the frontend code to bypass the license check, the Rust core will refuse to allow access to the SQLite database.
- **Effort:** Unestimated: security-critical, needs careful design + review, realistically 1–2 weeks.

### SMS Aggregator Top-Up Wallet

- **Description:** Integrate with a Nigerian bulk SMS aggregator (like Termii or BulkSMSNigeria, rather than MTN's direct high-cost API) to power transactional SMS.
- **Value:** Store owners can "top up" their SMS wallet directly within DumosRx using Paystack to send receipts or refill reminders. This creates an additional passive revenue stream for the platform.
- **Effort:** Unestimated: payment integration (Paystack) + wallet balance/ledger logic + aggregator API, realistically ~1 week.

---

## 🛑 FUTURE ROADMAP: v2.0+ (Hold)

These change the core business model. Hold until core ERP/POS is dominant.

### 🔊 Voice Input System *(Hold)*

- **Risk:** HIGH FRUSTRATION: noisy retail environments + complex drug names = poor accuracy.
- **Mitigation if implemented:** Treat as experimental accelerator only, never primary input.

### 💊 Substitution Recommendation Engine *(Hold)*

- **Risk:** HIGH MEDICAL LIABILITY: wrong substitute suggestion is dangerous.
- **Safety requirements before building:** Confidence scores, mandatory retailer confirmation, ATC drug classification database, explicit "Retailer verification required" UI.

---

**Strategic Outcome Goal:**
A store operating system that doesn't just record operations, but actively runs and optimizes them.
