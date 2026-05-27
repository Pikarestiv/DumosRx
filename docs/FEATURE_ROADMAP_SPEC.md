# DumosRx Feature Roadmap & Implementation Spec

This document tracks the proposed features for the DumosRx system, grouped by strategic priority, risk level, and implementation complexity. The goal is to shift DumosRx from a "passive record-keeper" to an "active intelligence system."

---

## 🛡️ Architectural Rules & Safety Constraints
These core principles govern the implementation of all new features to ensure system stability, data integrity, and patient safety.

- **Navigation Principle:** "All features must exist in exactly ONE primary entry point (no duplicates across tabs)."
- **AI System Rule:** AI is NOT allowed to directly mutate state. All actions must go through a generated "intent → confirmation → execution" pipeline.
- **WhatsApp Integration Architecture Rule:** WhatsApp must operate on read-only queries (safe) or queued write actions (confirmed in app or admin approval).
- **Internal Observability Requirement:** All systems must log user actions, system failures, sync events, and AI decisions. This is critical for debugging offline-first sync issues and AI auditing.

## 🌟 Tier 1: The Immediate "Must-Haves" (High Impact, Low Risk)
These features should be implemented immediately as they directly impact usability and business growth without introducing massive technical risk.

- [ ] **1. Mobile Navigation Change (CRITICAL UX RESTRUCTURE)**
  - **Description:** Replace current sidebar navigation with a 5-tab bottom navigation system (mobile-first).
  - **Tabs:** Home (Dashboard), POS, Inventory, AI Assistant, More (Hub).
  - **The "More" Hub:** Consolidate all low-frequency modules (Prescriptions, Customers, Procurement, Expenses, Reports, Settings, Sync, Sign Out) into a full page/drawer. Must support search.
  - **Note:** This aligns perfectly with making the POS responsive. Keeps the app feeling native and fast on phones.

- [ ] **2. Public Access Policy Change (CRITICAL BUSINESS MOVE)**
  - **Description:** Remove direct application download from public pages. Users MUST register an account first, then gain access to download the app.
  - **Purpose:** Enables user tracking before installation, email capture, and funnel analytics.
  - **Sub-tasks:**
    - Build pre-download funnel tracking.
    - Setup automated email campaigns (e.g., "Complete your setup", "Your pharmacy is not active yet").

- [ ] **3. Migration System**
  - **Description:** Upgrade data import system into a guided migration pipeline.
  - **Supported Formats:** QuickBooks IIF, CSV/Excel, legacy POS exports.
  - **Features:** Auto-detect schema, mapping UI, validation preview, migration report, duplicate detection.

- [ ] **4. Bug Tracking & Logging System**
  - **Description:** Internal observability layer for bug tracking, system logging (POS errors, sync failures), and event tracking (feature usage, funnels).
  - **Note:** Can be implemented quickly by integrating existing tools like Sentry (crash reporting) and PostHog (funnel analytics/session replays).

---

## 🚀 Tier 2: The "Game Changers" (High Value, Medium Complexity)
These features will make DumosRx feel like "the future" compared to competitors, but require careful engineering.

- [ ] **5. AI Assistant Module (NEW CORE FEATURE)**
  - **Description:** AI as a first-class system tab with Query, Command (`/reorder`), and Action modes.
  - **Output Rule:** Responses must be structured cards, structured actions, and clickable workflows (not chat paragraphs).
  - **Complexity:** Requires LLM tool-calling and robust backend integration.

- [ ] **6. Smart Suggestions Engine**
  - **Description:** Context-aware product intelligence during POS checkout. Suggest complementary products, bundles, or upsells.
  - **Complexity:** Can start simple (rule-based: antibiotic -> probiotics) and evolve into ML-based on historical sales. Directly increases pharmacy revenue.

- [ ] **7. WhatsApp Integration System**
  - **Description:** WhatsApp as an external control terminal (Command, Natural Language, and Alert modes).
  - **Complexity:** Highly innovative for emerging markets. Requires managing Meta/WhatsApp API costs, approvals, and robust authentication.

---

## ⚠️ Tier 3: Proceed With Caution (High Risk)
These features solve real problems but carry significant risks (liability or UX frustration) that must be mitigated.

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

## 🛑 Tier 4: The "Scope Expanders" (Future Roadmap)
Massive features that change the core business model. Should be tabled until the core ERP/POS is completely dominant.

- [ ] **10. E-commerce Integration Layer (DumosRx Commerce API Layer)**
  - **Description:** Pharmacy-to-online-store conversion system. "Enable Online Store" toggle.
  - **Clarification:** The local Inventory is the source of truth. The Commerce layer is a read/write projection. Orders generate sales events internally. Treat the online store as another branch.
  - **Complexity:** Turns the product into a Shopify competitor. Requires public web hosting, SEO, payment gateways, and delivery logistics.
  - **Alternative:** Start with a simple "WhatsApp Catalog Export".

- [ ] **11. Referral & Growth System**
  - **Description:** Subscription referral engine (discount/wallet credit tiers).
  - **Complexity:** Easy technically, but requires careful financial modeling.

- [ ] **12. Support System Enhancement**
  - **Description:** Multi-layer system: Self-service AI, Live chat (Smartsupp), Ticket system.
  - **Complexity:** Standard SaaS implementation.

---

**Strategic Outcome Goal:**
A pharmacy operating system that doesn't just record operations, but actively runs and optimizes them.
