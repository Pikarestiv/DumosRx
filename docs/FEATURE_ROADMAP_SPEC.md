# DumosRx Feature Roadmap & Implementation Spec

This document tracks the proposed features for the DumosRx system, grouped by strategic priority, risk level, and implementation complexity. The goal is to shift DumosRx from a "passive record-keeper" to an "active intelligence system."

---

## 🛡️ Architectural Rules & Safety Constraints

These core principles govern the implementation of all new features to ensure system stability, data integrity, and patient safety.

- **Navigation Principle:** "All features must exist in exactly ONE primary entry point (no duplicates across tabs)."
- **AI System Rule:** AI is NOT allowed to directly mutate state. All actions must go through a generated "intent → confirmation → execution" pipeline.
- **WhatsApp Integration Architecture Rule:** WhatsApp must operate on read-only queries (safe) or queued write actions (confirmed in app or admin approval).
- **Internal Observability Requirement:** All systems must log user actions, system failures, sync events, and AI decisions. This is critical for debugging offline-first sync issues and AI auditing.

---

## 🚧 PENDING FEATURES

### 🌟 Tier 1 — Immediate "Must-Haves"

- [ ] **3. Migration System**
  - **Description:** Upgrade data import system into a guided migration pipeline.
  - **Supported Formats:** QuickBooks IIF, CSV/Excel, legacy POS exports.
  - **Features:** Auto-detect schema, mapping UI, validation preview, migration report, duplicate detection.

- [ ] **4. Bug Tracking & Logging System** *(Partial — custom logger exists, no Sentry/PostHog yet)*
  - **Description:** Internal observability layer for bug tracking, system logging (POS errors, sync failures), and event tracking (feature usage, funnels).
  - **Status:** `error-logger.ts` + `GlobalErrorListener` handle crash logging to local DB. Sentry and PostHog integrations still pending.

---

### 🚀 Tier 2 — "Game Changers"

- [ ] **5. AI Assistant Module (NEW CORE FEATURE)**
  - **Description:** AI as a first-class system tab with Query, Command (`/reorder`), and Action modes.
  - **Output Rule:** Responses must be structured cards, structured actions, and clickable workflows (not chat paragraphs).
  - **Complexity:** Requires LLM tool-calling and robust backend integration.

- [ ] **6. Smart Suggestions Engine** *(Partial — toggle & DB flag exist, no engine logic yet)*
  - **Description:** Context-aware product intelligence during POS checkout. Suggest complementary products, bundles, or upsells.
  - **Status:** `show_retail_suggestions` flag exists on `stores` table and is exposed in store settings. The suggestion engine itself (rule-based or ML) is not yet built.
  - **Complexity:** Can start simple (rule-based: antibiotic -> probiotics) and evolve into ML-based on historical sales.

- [ ] **7. WhatsApp Integration System**
  - **Description:** WhatsApp as an external control terminal (Command, Natural Language, and Alert modes).
  - **Complexity:** Highly innovative for emerging markets. Requires managing Meta/WhatsApp API costs, approvals, and robust authentication.

---

### ⚠️ Tier 3 — Proceed With Caution

- [ ] **8. Substitution Recommendation Engine**
  - **Description:** Suggest same-molecule or drug-class alternatives when an item is out of stock.
  - **Risk: HIGH MEDICAL LIABILITY.** Suggesting the wrong substitute is dangerous.
  - **Safety Constraint Layer:** Must include a confidence score, a mandatory pharmacist confirmation step, and drug classification validation (ATC or equivalent system).
  - **Mitigation:** Must explicitly state "Pharmacist verification required" and rely on a licensed, highly accurate medical database (not a generalized AI hallucination).

- [ ] **9. Voice Input System**
  - **Description:** Voice-enabled input layer for POS, Search, and AI queries.
  - **Risk: HIGH FRUSTRATION.** Noisy retail environments and complex drug terminologies make speech-to-text highly error-prone.
  - **Mitigation:** Treat as an experimental accelerator, not primary control.

---

### 🛑 Tier 4 — Future Roadmap

- [ ] **10. E-commerce Integration Layer (DumosRx Commerce API Layer)**
  - **Description:** Pharmacy-to-online-store conversion system. "Enable Online Store" toggle.
  - **Clarification:** The local Inventory is the source of truth. The Commerce layer is a read/write projection. Orders generate sales events internally. Treat the online store as another branch.
  - **Complexity:** Turns the product into a Shopify competitor. Requires public web hosting, SEO, payment gateways, and delivery logistics.
  - **Alternative:** Start with a simple "WhatsApp Catalog Export".

- [ ] **12. Support System Enhancement** *(Partial — feedback form exists, no live chat/ticket system yet)*
  - **Description:** Multi-layer system: Self-service AI, Live chat (Smartsupp), Ticket system.
  - **Status:** In-app feedback form syncs to backend. Smartsupp live chat and formal ticket system not yet integrated.

---

## ✅ COMPLETED FEATURES

- [x] **1. Mobile Navigation Change**
  - 5-tab bottom navigation (`mobile-bottom-nav.tsx`) with "More" hub drawer (`mobile-more-drawer.tsx`) fully integrated into the dashboard layout. Sidebar remains for desktop (lg+). More hub includes search and all low-frequency modules.

- [x] **2. Public Access Policy Change**
  - Downloads page gates all platform buttons (Windows, macOS, Linux) behind `/register?redirect=downloads`. Direct download links are no longer publicly accessible.

- [x] **11. Referral & Growth System**
  - Full referral system: DB migration, `ReferralCreditTransaction` model, `ReferralController` (admin), referral stats endpoint on subscription, credit adjustment dialog in admin UI, and referral settings management.

---

**Strategic Outcome Goal:**
A pharmacy operating system that doesn't just record operations, but actively runs and optimizes them.
