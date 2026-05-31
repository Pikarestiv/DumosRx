# DumosRx Go-To-Market (GTM) & Launch Strategy

This document outlines the commercial rollout, penetration pricing model, testing cycles, and lead pipeline for **DumosRx**. It serves as our operational blueprint to transition from beta testing to a commercial launch in the Nigerian pharmacy software market.

---

## 1. Penetration Pricing & Lifecycle Model

To win early trust and rapidly capture market share, DumosRx will deploy a **Penetration Pricing Campaign** targeted at selected early adopters.

### Launch Campaign: The 3-6 Month Free Trial
* **The Offer**: Selected early adopters receive **3 to 6 months of Dumos Pro or Enterprise features for free**.
* **Objective**: Establish DumosRx as their primary operating system, making it indispensable before any payment conversation.
* **Onboarding Friction Reduction**: No card setup required for the trial. Activation is automated upon initial local sync.

### Post-Trial Conversion Lifecycle
After the trial period expires, users are presented with three paths:

```mermaid
graph TD
    A[End of 3-6 Month Free Trial] --> B{Choose Path}
    B -->|Subscribe| C[Dumos Pro - ₦30k/yr]
    B -->|Subscribe| D[Enterprise - ₦80k/yr]
    B -->|Buy Once| E[Dumos Local - ₦50k one-time]
    B -->|Downgrade| F[Dumos Free - Limited]
    
    E -->|Restriction| E1[Offline-Only / 1 PC / 3 Staff]
    F -->|Restriction| F1[No Sync / No Cloud Backup / Limited Staff]
```

1. **Option A: Subscribe to Dumos Pro (₦30,000/year)**
   * Retains full cloud capabilities: Auto cloud backups, remote web dashboard access, and mobile/multi-device sync.
2. **Option B: Downgrade to Dumos Local (₦50,000 one-time fee)**
   * For shops that refuse subscriptions. 
   * **Technical limitation**: We lock the app to **offline-only**, 1 PC installation, and max 3 staff accounts. They must perform exactly one online sync to register the offline license token, after which they can run offline indefinitely.
3. **Option C: Downgrade to Free Tier**
   * Heavily restricted: No cloud synchronization, no backup/restore support, max 1 staff account, and limited reports. This keeps their database accessible (they don't lose their data), but cuts off the advanced ERP value.

### UX of Subscription Transitions
* **Countdown Banners**: A non-intrusive alert banner appears in the top navigation panel starting **30 days before trial expiry** (e.g., *"Your Dumos Pro trial expires in 12 days. Subscribe now to keep cloud sync active."*).
* **Grace Period**: Give a **7-day soft grace period** after expiry where sync still runs but warnings become prominent.
* **Downgrade Notice**: If they choose the Free or Local tier, show a clear confirmation modal explaining what data will remain locally and what features (like cloud sync and remote dashboards) will be disabled.

---

## 2. Structured Quality Assurance & UX Blueprint

Pharmacists and sales assistants are often not computer-literate. If the POS lags, freezes, or fails to sync, cashiers will immediately revert to paper ledgers or legacy POS systems. **UX simplicity and absolute reliability are our primary retention engines.**

### "Zero-Friction" UX Principles for Non-Tech-Savvy Users
1. **Large, Tap-Friendly Target Zones**: Ensure POS buttons (checkout, payment methods, search bar) have generous padding and are easy to click on tablets or mobile phones.
2. **Keyboard-Only POS Checkout**: Cashiers should be able to complete a sale using only the keyboard (`Enter` to checkout, `C` for Cash, `T` for Transfer, arrow keys to select, etc.) for high-speed operation.
3. **Zero-Latency Feedback**: POS operations must feel instantaneous. SQLite reads/writes must be optimized, and sync operations must happen strictly in the background without locking the UI.
4. **Resilient Sync Feedback**: A prominent, simple sync indicator in the header (e.g., a green dot for "Saved & Synced", blue for "Saved Offline", orange for "Syncing..."). Avoid displaying complex error stack traces to cashiers; show simple, actionable messages (e.g., *"Internet connection slow. DumosRx is working offline and will sync automatically when connection improves."*).

### The Five-Phase Feedback Loop
To ensure every flow is seamless and robust, we will execute our testing in strict stages:

```
[Phase 1: Developer QA] ➔ [Phase 2: Expert Review] ➔ [Phase 3: Paid Cashier Simulation] ➔ [Phase 4: Select Pilot Rollout] ➔ [Phase 5: Scale]
```

* **Phase 1: Developer QA & Bug Squashing (Current)**
  * **Objective**: Fix existing bugs, optimize SQLite queries, and test database schema synchronization edge cases.
* **Phase 2: Expert Pharmacist Review**
  * **Testers**: Chisom RH & Mmesoma RH (both have hands-on experience with Barsoft and VirtualRx).
  * **Goal**: Validate that the POS layout, medicine entry, and inventory flow match real-world pharmacy speed and expectations. Gather feedback on differences between DumosRx and legacy tools.
* **Phase 3: Paid Cashier Simulation (Nest Pharmacy)**
  * **Testers**: Hire 1-2 Cashiers/Nurses from Nest Pharmacy (Pay ₦5,000 for 1–2 weeks of active testing).
  * **Goal**: Observe them using the app *without guiding them*. Identify onboarding friction points, confusing buttons, or flow blockers for computer-illiterate users.
* **Phase 4: Select Pilot Rollout (3-6 Months Free Trial)**
  * **Testers**: Umueze Pharmacy (Android) and Cynthia Adaeze / Nest Pharmacy (QuickBooks migration).
  * **Goal**: Live business operations. Verify database integrity, sync stability, and user retention.
* **Phase 5: Commercial Proposals & Scaling**
  * **Target**: Makhillz Pharmacy (2+ stores), Betacure (Sienne), DotCom (Ikem/Gloria).

---

## 3. Product Suggestions & Suggestion System Data

DumosRx's **Smart Suggestions Engine** will help pharmacists upsell and provide better clinical advice. 

### Technical Implementation of suggestions
To keep the application fast and offline-resilient, suggestions will run entirely on the client side:
1. **Database Schema**: We will introduce a local SQLite table `product_suggestions` to store relationships:
   ```sql
   CREATE TABLE product_suggestions (
     id TEXT PRIMARY KEY,
     trigger_name TEXT NOT NULL,         -- Can match category, generic name, or specific brand
     suggested_item_name TEXT NOT NULL,  -- Product name or generic name to suggest
     suggestion_type TEXT NOT NULL,      -- 'clinical' (cross-sell antibiotic+probiotic) or 'commercial' (upsell larger size)
     message TEXT NOT NULL,              -- Upsell tooltip text (e.g. "Suggest probiotics with antibiotics")
     _deleted INTEGER DEFAULT 0
   );
   ```
2. **Suggestions Hook (`useSmartSuggestions.ts`)**:
   * Listens to the local POS cart state.
   * Matches the items currently in the cart against `trigger_name` in `product_suggestions`.
   * Filters out any suggested items that are *already in the cart*.
   * Queries local SQLite `medicines` to verify if the suggested item is currently in stock (`stock_quantity > 0`). If out of stock, it does not suggest it.
3. **UI Integration**:
   * Renders a small, non-intrusive alert/suggestion badge directly in the POS sidebar (e.g., `"Consider recommending Bifidobacterium Probiotic (+ ₦1,200)"`).
   * Clicking the suggestion instantly appends the item to the cart.

### Core Data Categories to Seed
* **Clinical Co-Purchases**:
  * Antibiotics (e.g., Amoxicillin, Ciprofloxacin) ➔ Probiotics (to prevent diarrhea).
  * Antimalarials (e.g., Artemether/Lumefantrine) ➔ Vitamin C, Multivitamins, or Paracetamol.
  * Antihypertensives (e.g., Amlodipine, Lisinopril) ➔ Potassium supplements or Omega-3.
* **Sales Co-Purchases**:
  * Cough Syrups ➔ Throat lozenges or tissues.
  * Baby Diapers ➔ Baby wipes or baby oil.

### Data Collection & Implementation Flow
1. **Initial Seed Script**: We will bundle a predefined seed file (`suggestions_seed.sql`) containing standard therapeutic pairings.
2. **Local Machine Learning (Post-Launch)**: In Phase 2, the `SuggestionsEngine` will query local transaction history to find items with high co-occurrence support and confidence scores, adapting dynamically to what each shop's customers buy together.


---

## 4. Lead Pipeline & Blocker Matrix

Below is our current prospect pipeline, mapped to their specific requirements and technical launch blockers.

| Lead / Prospect | Current System | Strategic Pitch / Offer | Technical Launch Blocker | Action Owner |
| :--- | :--- | :--- | :--- | :--- |
| **Chisom RH** | Barsoft, VirtualRx | Expert Beta Tester. Ask for detailed POS UX feedback. | None (Desktop Tauri Web app) | Primary Dev |
| **Mmesoma RH** | Barsoft, VirtualRx | Expert Beta Tester. Compare layout & speeds. | None (Desktop Tauri Web app) | Primary Dev |
| **Nest Cashiers** | QuickBooks | Paid testing (₦5k/week). Run POS speed tests. | None | Primary Dev |
| **Umueze Pharmacy** | None / Paper | **3-6 Months Free**. Mobile phone setup. | **Android App Build** | Primary Dev |
| **Cynthia Adaeze** (Nest Pharmacy Owner) | QuickBooks (Active) | **3-6 Months Free**. Ask for QuickBooks feature gaps. Confirm pricing. | **QuickBooks Import/Migration tool** | Primary Dev |
| **Ben Umembaoma** | None (Perfume) | Standard launch offer. Pivot POS templates for general retail inventory. | POS General Retail Template support | Primary Dev |
| **Sienne** (Betacure) | Legacy Inventory | Pitch Shopify/WooCommerce sync to pull them off legacy app. | **E-commerce Sync Layer** (WooCommerce/Shopify API) | Primary Dev |
| **Mmesoma** (Former Apprentice) | Legacy Inventory | E-commerce integration benefits. | **E-commerce Sync Layer** | Primary Dev |
| **Makhillz Pharmacy** (2+ stores) | QuickBooks | 2+ store aggregated dashboard. | **Enterprise Multi-Store Sync** | Co-Founder Mike |
| **Ikem/Gloria** (DotCom) | Scope Shopmaster | Pitch missing features they wish Scope had. | Feature Gap Analysis | Primary Dev |

### Technical Strategy for Major Feature Blockers

#### A. Android APK & PWA Release Flow
For mobile-only users (like Umueze Pharmacy) and iOS users (who don't use PCs):
1. **Android Compilation (Tauri v2 Mobile)**: We will utilize Tauri's built-in mobile support to bundle the Next.js client directly into an Android package (`.apk`).
2. **PWA (Progressive Web App) Route (For iOS/iPhone)**:
   * **Why**: Publishing to the iOS App Store is slow, requires a $99/year developer account, and has high friction.
   * **How**: We will add a Web App Manifest (`manifest.json`), service workers, and iOS-specific meta tags to the Next.js project.
   * **UX**: iOS users open the app in Safari, tap "Add to Home Screen," and run it as a full-screen standalone application. Because it utilizes the browser's local storage/IndexedDB for the offline-first SQLite database, it operates identically to the desktop client with zero App Store friction.

#### B. E-Commerce Integration (Online Branch)
For clients like Betacure (Sienne) who require an online presence to migrate:
1. **Option A: Third-Party API Sync (WooCommerce/Shopify)**:
   * Build a synchronization service in the Laravel server.
   * When product quantity changes on DumosRx, trigger an API payload to WooCommerce (`PUT /wp-json/wc/v3/products/<id>`) or Shopify to update stock counts.
2. **Option B: Hosted DumosRx Storefront (Recommended)**:
   * Instead of sync with WooCommerce/Shopify, we offer a built-in storefront (e.g. `betacure.dumosrx.com` or custom domain mapping) hosted on our server.
   * **Why it's better**: Zero maintenance of third-party plugins, unified subscription pricing, and keeps the pharmacy locked into the DumosRx ecosystem. We will build WooCommerce/Shopify sync as a migration bridge but upsell them to the hosted storefront.

---

## 5. Domain, Hosting, and Infrastructure Decisions

### Domain Strategy: `dumosrx.com`
> [!NOTE]
> **Status: Domain `dumosrx.com` successfully purchased and configured.**
> * The app is now hosted entirely on `dumosrx.com`.
> * Namecheap DNS and cPanel have been fully integrated.
> * Required CORS policies have been updated to support `https://dumosrx.com` and its subdomains.
> * Professional emails (e.g., `sales@dumosrx.com` and `support@dumosrx.com`) can now be utilized.

### Hosting & VPS Migration Plan
* **Short-Term (Beta & Launch)**: Remain on the **cPanel Shared Hosting**. This keeps overhead costs at ₦0/month while we gather user feedback. The current sync controller is lightweight enough to support 5–10 concurrent pharmacies.
* **Medium-Term (Scale Phase - 20+ Pharmacies)**: Migrate to a dedicated **VPS (Virtual Private Server)** (e.g., DigitalOcean, Linode, or Hetzner).
  * **Why VPS is necessary later**:
    * Shared cPanel hosting restricts web socket connections, limiting live multi-device POS updates.
    * Shared servers have low PHP request execution limits, which can block large batch sync operations.
    * VPS allows setting up robust database clustering and cron-backed automated backups.
  * **Trigger for Migration**: Reaching 15–20 active paying pharmacies, or when database sync latency exceeds 2 seconds during peak hours.

