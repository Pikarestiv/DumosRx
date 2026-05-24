# DumosRx Commercial Strategy & Licensing Plan (Revised)

Based on your feedback and a competitive analysis of the Nigerian pharmacy software market (VirtualRx, Scope, Xprmed, and one-time cracked installers), here is a revised 4-tier strategy and technical architecture.

---

## 1. Competitive Pricing & 4-Tier Strategy

**Market Context:** VirtualRx charges ₦25,000/year (Starter), ₦50,000/year (Pro), and ₦100,000/year (Plus). Cracked QuickBooks runs for a one-time ₦30k - ₦70k. To compete effectively while maximizing LTV (Lifetime Value), we need to offer an undeniable entry point, but heavily incentivize recurring subscriptions.

### The 4 Tiers

| Tier | Price (NGN) | Target Audience | Key Restrictions |
| :--- | :--- | :--- | :--- |
| **1. Free Trial** | Free (14 Days) | Every new sign-up | Full access to Pro features for 14 days to prove value. |
| **2. Dumos Local** | ~₦50,000 (One-Time) | Pharmacies used to "Buy Once" | **Offline ONLY.** No cloud backups, no mobile access, no web dashboard, 1 PC only, Max 3 Staff. |
| **3. Dumos Pro** | ~₦30,000 / Year | Standard modern pharmacy | **Cloud Sync.** Unlimited staff, mobile app access, auto cloud backups. (Single Location). |
| **4. Enterprise** | ~₦80,000 / Year | Chains & large operations | **Multi-Store.** Aggregated analytics, unlimited locations, API integrations. |

> [!TIP]
> **The Strategy**: The ₦50k "Local" plan captures the crowd who refuses to pay monthly. But the moment their PC crashes (losing their data) or they want to check sales from their phone at home, they will upgrade to the ₦30k/year Pro plan.

---

## 2. Exhaustive Feature Gating List

To enforce these tiers, we will build a dynamic configuration fetched from the Admin Dashboard, allowing you to tweak limits without issuing app updates.

| Feature Area | Dumos Local (One-time) | Dumos Pro (Sub) | Enterprise (Sub) |
| :--- | :--- | :--- | :--- |
| **Point of Sale (POS)** | Yes | Yes | Yes |
| **Inventory & Expiry Tracking** | Yes | Yes | Yes |
| **Customer & Debt Management** | Yes | Yes | Yes |
| **Expense Tracking** | Yes | Yes | Yes |
| **Staff Accounts** | Limit: 3 | Limit: 10 | Unlimited |
| **Cloud Auto-Backups** | ❌ No | ✅ Yes | ✅ Yes |
| **Multi-Device Sync (Mobile App)** | ❌ No | ✅ Yes | ✅ Yes |
| **Web Dashboard Remote Access** | ❌ No | ✅ Yes | ✅ Yes |
| **Multi-Store Management** | ❌ No | ❌ No | ✅ Yes |
| **E-Commerce Integrations** | ❌ No | ❌ No | ✅ Yes (Upcoming) |

---

## 3. How Licensing & Subscriptions Work (Anti-Tampering)

You asked: *"So they get a key to enter? Or its automatic?"*

**It is Automatic!** Here is how the Web Subscription seamlessly integrates with the Local App to prevent piracy:

1. **The Purchase**: The pharmacy pays via **Paystack** on your Web Dashboard.
2. **The Generation**: Paystack triggers a webhook. DumosRx Web generates a highly secure **JSON Web Token (JWT)** (the "License").
3. **The Sync (Automatic)**: When the local app connects to the internet, it silently downloads this JWT in the background. The user does not have to copy-paste any keys.
4. **Offline Mode**: If the user goes offline, the local app uses this JWT. The token mathematically proves they paid, and has an embedded expiration date.
5. **Anti-Backdating**: `LicenseGuard` (which is already set up in the app UI) actively blocks access if it detects the system clock has been tampered with. It logs monotonic time at every app launch.

> [!IMPORTANT]
> **No Manual Keys to prevent cracking:** To ensure maximum security and prevent reverse-engineering of our offline keys, we will NOT allow manual offline key entry. Users on the "Dumos Local" plan must connect to the internet exactly **once** upon setup to securely sync their token from our servers. After that, they can remain offline indefinitely.

---

## Next Steps

If the plan looks perfect, let me know and we can transition to execution. I'll start by building the `useFeatureGate` hook on the local app to enforce these limits based on the tier, and then move to the Web Dashboard to build the Subscription/Billing UI.
