# DumosRx Feature Roadmap & Implementation Spec

This document tracks the proposed features for the DumosRx system, grouped by strategic priority, risk level, and implementation complexity. The goal is to shift DumosRx from a "passive record-keeper" to an "active intelligence system."

---

## 🛡️ Architectural Rules & Safety Constraints

- **Navigation Principle:** All features must exist in exactly ONE primary entry point (no duplicates across tabs).
- **AI System Rule:** AI is NOT allowed to directly mutate state. All actions must go through a generated "intent → confirmation → execution" pipeline.
- **WhatsApp Architecture Rule:** WhatsApp must operate on read-only queries (safe) or queued write actions (confirmed in-app or via admin approval).
- **Internal Observability Requirement:** All systems must log user actions, system failures, sync events, and AI decisions. Critical for debugging offline-first sync issues and AI auditing.

## 🚀 CURRENT FOCUS — v1.1 Targets

These features are our active development targets for the next major release.

---

### 🤖 AI Assistant Module

> **Architecture Decision: Use third-party LLM APIs, server-proxied.**

**Why NOT embed a local model:**

| Approach | Bundle Size Added | Works Offline | Quality | Monthly Cost |
| --- | --- | --- | --- | --- |
| Local model (llama.cpp/Ollama) | +2–8 GB | ✅ | Medium | Free |
| VPS-hosted LLM (self-hosted Ollama) | None | ❌ | Medium | ~$20–50/mo |
| **Third-party API (Gemini/GPT)** | **None** | **❌ (online-only)** | **Best** | **~$0–5/mo at low volume** |

### Chosen approach: Server-Proxied Gemini API

- The client sends requests to a new Laravel endpoint (e.g. `POST /api/v1/ai/query`)
- The Laravel server calls the **Google Gemini API** and returns a structured response
- The API key is stored securely server-side (never exposed to the client)
- The AI tab is clearly **online-only** (same as sync, backups, broadcasts — acceptable)

### Recommended Model: Google Gemini 1.5 Flash

- Extremely fast response times
- Structured JSON output support (required for action cards)
- **Free tier:** 15 requests/minute, 1 million tokens/day, 1,500 requests/day — enough for early-stage usage
- **Paid tier:** $0.075 per 1M input tokens, $0.30 per 1M output tokens — effectively cents per query

**Setup Requirements:**

1. Google AI Studio account → generate Gemini API key
2. Add `GEMINI_API_KEY` to Laravel `.env`
3. Install `google/generative-ai` PHP package (or use plain HTTP client)
4. Build `AiController` with `query`, `command`, and `action` endpoints
5. Implement the AI tab in the `client` app (structured card output, not chat paragraphs). This must include **AI Reorder Forecasting** (e.g., analyzing sales velocity to predict when an item will run out and suggesting a purchase order).
6. Apply `throttle:20,1` middleware to AI routes to prevent abuse

**Cost Summary:**

- Development: ~3–5 days
- Running cost at 500 queries/day: **effectively $0** (within free tier)
- Running cost at 10,000 queries/day: ~**$1.50–3/month**

---

### 💬 WhatsApp Integration System

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

**Setup Requirements (High Friction — plan 2–3 weeks):**

1. **Facebook Business Manager account** — must be verified (requires business docs: CAC, address, etc.)
2. **Meta Business Verification** — typically takes 3–7 business days
3. **Dedicated phone number** — cannot be a number already on personal/regular WhatsApp
4. **WhatsApp Cloud API access** — applied through Meta Developer Console
5. **Webhook endpoint** — add `POST /api/v1/webhooks/whatsapp` to Laravel
6. **Message templates** — pre-approved by Meta for business-initiated messages (24–48hr approval)

**Implementation Phases:**

- **Phase 1 (Alerts):** Low-stock alerts, expiry warnings, payment reminders — outbound only
- **Phase 2 (Queries):** Natural language queries ("how many paracetamol left?") — inbound, read-only
- **Phase 3 (Commands):** Queued write actions ("/reorder amoxicillin 50") — requires in-app confirmation

**Best paired with AI Assistant (Phase 2 & 3 rely on LLM intent parsing).**

---

### 📦 Migration System

- **Description:** Guided import pipeline for stores migrating from existing systems.
- **Supported Formats:** CSV/Excel, QuickBooks IIF, legacy POS exports.
- **Features:** Auto-detect column schema, mapping UI, validation preview, migration report, duplicate detection.
- **Effort:** ~3–5 days
- **Cost:** None (server-side processing)

---

## 🎯 Mentor Feature Expansion (Pending Features)

This section tracks high-value features derived from recent commercial strategy sessions.

### 🏦 1. Open Banking Transaction Reconciliation

- **Description:** Integration with Nigerian Open Banking APIs (e.g., Mono, Okra).
- **Value:** Allows the store owner to link their corporate bank account. When a cashier logs a "Bank Transfer" payment on the POS, the system automatically checks the bank API to ensure the credit actually hit the account. This completely eliminates "fake transfer" fraud.

### 🛡️ 2. Tauri Rust-Level Security Hardening

- **Description:** Moving all JWT license validation and decryption logic away from the React/Javascript frontend into the compiled Rust backend.
- **Value:** Ensures hackers cannot easily bypass the subscription lock. If a user tries to modify the frontend code to bypass the license check, the Rust core will refuse to allow access to the SQLite database.

### 💸 3. SMS Aggregator Top-Up Wallet

- **Description:** Integrate with a Nigerian bulk SMS aggregator (like Termii or BulkSMSNigeria, rather than MTN's direct high-cost API) to power transactional SMS.
- **Value:** Store owners can "top up" their SMS wallet directly within DumosRx using Paystack to send receipts or refill reminders. This creates an additional passive revenue stream for the platform.


---

## 🔐 RBAC, Admin Tooling & Observability (Deferred 2026-08-02)

Surfaced while prepping for a store-owner demo. None of this blocks the demo — the underlying plumbing already exists, it's incomplete/inconsistent rather than missing. Revisit after the demo.

### Roles & Permissions cleanup

- **Current state:** A real `Role`/`Permission` system already exists server-side (`app/Models/Role.php`, `Permission.php`, `RolesAndPermissionsSeeder`) with roles `super_admin`, `admin`, `store_owner`, `manager`, `specialist`, `sales_staff`, `auditor`, each mapped to permissions (`manage_staff`, `view_reports`, `manage_inventory`, `process_sales`, `dispense_prescriptions`, `view_own_sales`), plus a `permission:` middleware wired to some routes (`routes/api.php`).
- **Gap:** Enforcement is inconsistent. `AdminController` checks `$user->role !== 'super_admin'` as a raw string in ~18 places instead of using `hasRole()`/`hasPermission()` uniformly. The client (`pos-transaction-history.tsx`, `staff-list.tsx`) only recognizes `store_owner|admin|manager`, not the full seeded role list.
- **Action:** Audit every raw `role ===` / `role !==` check (client and server) and replace with the permission-based helpers so the seeded roles actually take effect everywhere.

### New "agent" role (app installers)

- **Description:** A role for people who install/onboard DumosRx for new pharmacies (co-founders would be `admin`, you `super_admin`, installers get this new role).
- **Foundation already present:** `users` table already has `referral_code` / `referred_by_id` / `referral_credits` columns — likely the intended basis for tracking who onboarded which store.
- **Action:** Add an `agent` (or better name — "installer"? "onboarding_partner"?) role/permission scoped to store registration only (no access to a store's sales/financial data), and a simple attribution view (which agent onboarded which stores).

### Impersonate feature

- **Current state:** Already built, not hypothetical — `AdminController::impersonateStore` + `AdminService` (backend), and `web/app/admin/stores` already has a working impersonate button (`useImpersonateStoreMutation`) that swaps in the store's session cookie.
- **Action:** No build needed. Just needs a deliberate test pass (start impersonation, confirm scoped access, end session cleanly) — treat as verification work, not a new feature.

### Remote bug/error visibility

- **Current state:** There's an activity/audit log (`web/app/admin/activity`), a `feedback` table + `communications` admin page for user-submitted feedback, and a `system` health page (`web/app/admin/system`) — but no automatic crash/error capture anywhere in the repo (no Sentry or equivalent).
- **Gap:** If something breaks silently on a pharmacy's device, you only find out if they tell you or you remote in — no passive visibility.
- **Action:** Wire up lightweight error tracking (e.g. Sentry free tier) in the client (Next.js/Tauri) and Laravel server, surfaced in the admin dashboard, so store-side crashes/errors are visible without depending on the user reporting them.

---

## 🛑 FUTURE ROADMAP — v2.0+

These change the core business model. Hold until core ERP/POS is dominant.

---

### 🛒 E-commerce Integration Layer

- **Description:** "Enable Online Store" toggle — turns store inventory into a browsable online store.
- **Plan Gating:** Lock behind **Enterprise plan** (or a dedicated Commerce add-on).
- **v1 Shortcut:** Start with **WhatsApp Catalog Export** — generates a shareable product list from live inventory, zero infrastructure needed.
- **Full implementation:** Public storefront, SEO, Paystack checkout, delivery logistics, order-to-sale pipeline.
- **Complexity:** High. Treat online store as another "branch" — inventory is the source of truth.

---

### 🔊 Voice Input System *(Hold)*

- **Risk:** HIGH FRUSTRATION — noisy retail environments + complex drug names = poor accuracy.
- **Mitigation if implemented:** Treat as experimental accelerator only, never primary input.

---

### 💊 Substitution Recommendation Engine *(Hold)*

- **Risk:** HIGH MEDICAL LIABILITY — wrong substitute suggestion is dangerous.
- **Safety requirements before building:** Confidence scores, mandatory retailer confirmation, ATC drug classification database, explicit "Retailer verification required" UI.

---

### 📊 Sentry & PostHog Integration *(Post-launch polish)*

- **Description:** Add Sentry (crash dashboards, alerting, stack trace grouping, source maps) and PostHog (funnel analytics, session replays) on top of the existing custom crash logger.
- **Note:** Sentry supports offline queueing via `makeBrowserOfflineTransport` — works with the Tauri app. Events queue in IndexedDB and flush when online.
- **Why deferred:** The custom `error-logger.ts` + `GlobalErrorListener` pipeline already captures crashes to SQLite → syncs to backend. Sentry adds developer-quality-of-life (dashboards, alerts, deduplication) but is not user-facing.
- **Cost:** Sentry free tier: 5k errors/mo. PostHog free tier: 1M events/mo.
- **Effort:** ~half a day

**Strategic Outcome Goal:**
A store operating system that doesn't just record operations, but actively runs and optimizes them.
