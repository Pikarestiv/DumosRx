# DumosRx Feature Roadmap & Implementation Spec

This document tracks the proposed features for the DumosRx system, grouped by strategic priority, risk level, and implementation complexity. The goal is to shift DumosRx from a "passive record-keeper" to an "active intelligence system."

---

## 🛡️ Architectural Rules & Safety Constraints

- **Navigation Principle:** All features must exist in exactly ONE primary entry point (no duplicates across tabs).
- **AI System Rule:** AI is NOT allowed to directly mutate state. All actions must go through a generated "intent → confirmation → execution" pipeline.
- **WhatsApp Architecture Rule:** WhatsApp must operate on read-only queries (safe) or queued write actions (confirmed in-app or via admin approval).
- **Internal Observability Requirement:** All systems must log user actions, system failures, sync events, and AI decisions. Critical for debugging offline-first sync issues and AI auditing.

---

## 🚀 LAUNCH BLOCKERS — Must Ship Before v1.0

These must be done before a public launch. They directly affect user trust, onboarding success, and platform stability.

---

### Mixed Payment (Split Payment)

- **Description:** Add "Mixed" as a 5th payment method in POS. When selected, the cashier can split payment across multiple methods (e.g., ₦3,000 transfer + ₦500 cash + ₦1,500 on credit).
- **Source:** Real-world feedback from POS users at competing systems.
- **Storage:** New `payment_details` JSON column on `sales` table. Existing `payment_method` column stores `"mixed"` for split sales.
- **Impact:** Eliminates manual tracking of split payments, reduces end-of-day reconciliation errors.
- **Effort:** ~1 day

---

### Payment Accounts (Transfer Destinations)

- **Description:** Store owners set up named payment accounts (e.g., "Zenith Bank", "Moniepoint POS 1", "OPay") in Store Settings. When a cashier selects Transfer or Card at checkout, they pick which account received the payment.
- **Source:** Real-world feedback — Nigerian pharmacies typically have 3–5 payment destinations and need to reconcile each at end-of-day.
- **Storage:** New `payment_accounts` table. Account reference stored in `payment_details` JSON on each sale.
- **Impact:** Enables per-account reconciliation reports ("Moniepoint 1: ₦45,000 across 12 transactions today").
- **Effort:** ~1 day

---

### ✅ Smart Suggestions Engine *(Partial — engine logic needed)*

- **What exists:** `show_retail_suggestions` flag on the `stores` table, toggle in store settings and admin dashboard.
- **What's missing:** The actual rule-based suggestion logic in the POS checkout flow.
- **Implementation:**
  - Build a `SuggestionsEngine` class/module in the client app
  - Phase 1 (rule-based): antibiotics → probiotics, antihypertensives → potassium supplements, etc.
  - Phase 2 (data-driven): query local sales history for frequently co-purchased items
  - Render as a non-intrusive suggestion card at checkout, only if `show_retail_suggestions = true`
- **Cost:** None — fully local/offline logic.
- **Effort:** ~1–2 days

---

## 📅 POST-LAUNCH — v1.1 Targets

Features that improve the platform significantly but are not hard blockers for launch.

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
5. Implement the AI tab in the `client` app (structured card output, not chat paragraphs)
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

> A "conversation" = a 24-hour messaging window, not per-message. At typical pharmacy usage (alerts, stock queries), most interactions fall in the free tier for months.

**Estimated Monthly Cost at Scale:**

- 100 active pharmacies, avg 20 WhatsApp interactions/month each = 2,000 conversations
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

- **Description:** Guided import pipeline for pharmacies migrating from existing systems.
- **Supported Formats:** CSV/Excel, QuickBooks IIF, legacy POS exports.
- **Features:** Auto-detect column schema, mapping UI, validation preview, migration report, duplicate detection.
- **Effort:** ~3–5 days
- **Cost:** None (server-side processing)

---

## 🛑 FUTURE ROADMAP — v2.0+

These change the core business model. Hold until core ERP/POS is dominant.

---

### 🛒 E-commerce Integration Layer

- **Description:** "Enable Online Store" toggle — turns pharmacy inventory into a browsable online store.
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
- **Safety requirements before building:** Confidence scores, mandatory pharmacist confirmation, ATC drug classification database, explicit "Pharmacist verification required" UI.

---

### 📊 Sentry & PostHog Integration *(Post-launch polish)*

- **Description:** Add Sentry (crash dashboards, alerting, stack trace grouping, source maps) and PostHog (funnel analytics, session replays) on top of the existing custom crash logger.
- **Note:** Sentry supports offline queueing via `makeBrowserOfflineTransport` — works with the Tauri app. Events queue in IndexedDB and flush when online.
- **Why deferred:** The custom `error-logger.ts` + `GlobalErrorListener` pipeline already captures crashes to SQLite → syncs to backend. Sentry adds developer-quality-of-life (dashboards, alerts, deduplication) but is not user-facing.
- **Cost:** Sentry free tier: 5k errors/mo. PostHog free tier: 1M events/mo.
- **Effort:** ~half a day

---

## ✅ COMPLETED FEATURES

- [x] **Mobile Navigation Change** — 5-tab bottom nav (`mobile-bottom-nav.tsx`) with searchable "More" hub drawer (`mobile-more-drawer.tsx`), fully wired into `dashboard-layout.tsx`. Sidebar retained for desktop (lg+).

- [x] **Public Access Policy Change** — Downloads page gates all platform buttons (Windows/macOS/Linux) behind `/register?redirect=downloads`. Direct downloads are not publicly accessible.

- [x] **Referral & Growth System** — Full system: DB migration, `ReferralCreditTransaction` model, `ReferralController` (admin endpoints), referral stats on subscription API, credit adjustment dialog in admin UI, referral settings management.

- [x] **Support System Enhancement** — Three-layer support: (1) In-app `FeedbackForm` with bug/feature/general types → syncs to backend `feedback` table, (2) Admin feedback dashboard with status filters (Pending/Resolved/Dismissed), (3) Smartsupp live chat widget — admin-configurable key via Platform Settings → Integrations tab, auto-identifies logged-in users by name/email/role. Formal ticket system deferred to post-launch.

- [x] **Bug Tracking & Logging System** — Custom `error-logger.ts` + `GlobalErrorListener` captures all uncaught errors and unhandled promise rejections. Crashes are written to local SQLite `feedback` table (with platform, stack trace, user context) and sync to backend. Admin views crash logs in the Feedback dashboard. Sentry/PostHog deferred to post-launch polish.

---

**Strategic Outcome Goal:**
A pharmacy operating system that doesn't just record operations, but actively runs and optimizes them.
