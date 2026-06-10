# 🧪 DumosRx: Exhaustive Testing Checklist

This document contains a structured, grain-by-grain testing checklist divided into 5 high-level sections:
1. **Public Pages, Landing, & Auth Flows** (Web Frontend)
2. **Retailer / Store Owner Web Dashboard** (Web Frontend)
3. **Platform Super Admin Panel** (Web Frontend)
4. **Local Client Desktop Application (Offline POS)** (Local Electron/Tauri App)
5. **Deployment, Infrastructure, & Security Services** (Backend Server & Database)

---

## 🌐 Group 1: Public Pages, Landing, & Auth Flows

### 1.1 Marketing & Public Info Pages
- [ ] **Home/Landing Page (`/`):**
  - [ ] Page loads successfully with CSS layout and theme styles.
  - [ ] Hero sections, pricing tiers cards, and feature lists display correctly.
  - [ ] Navigation headers (links to Login, Register, Support) work.
  - [ ] Footer copyright, links to Terms of Service, and Privacy Policy work.
- [ ] **Downloads Page (`/downloads`):**
  - [ ] Renders download buttons for Windows, macOS, Linux, and Android.
  - [ ] Pulls the latest desktop/mobile version numbers and metadata from GitHub Releases API.
  - [ ] Unverified accounts are prevented from accessing files (displays block or redirects to verification status banner).
- [ ] **Support Page (`/support`):**
  - [ ] Displays support resources, contact forms, or support email details.
- [ ] **Legal Pages (`/terms` & `/privacy`):**
  - [ ] Privacy Policy loads and formats correctly.
  - [ ] Terms of Service loads and formats correctly.

### 1.2 User Registration Flow (`/register`)
- [ ] **Input Field Validations:**
  - [ ] Store/Pharmacy Name is required (minimum 2 characters).
  - [ ] Store Type selection works (Pharmacy, Supermarket, Grocery, General Store).
  - [ ] First Name & Last Name are required (minimum 2 characters).
  - [ ] Email format validation (requires `@` and domain).
  - [ ] Phone number format validation (minimum 10 digits).
  - [ ] Terminal PIN format validation (exactly 4 numeric digits).
  - [ ] Password validation (minimum 8 characters).
  - [ ] Password Confirmation matches password.
- [ ] **API Validation Error Handlers (422 Response):**
  - [ ] Duplicate Email returns clean message: "The email has already been taken" (no raw HTTP/JSON dump).
  - [ ] Duplicate Username returns clean message: "The username has already been taken".
- [ ] **Signup Execution & Redirection:**
  - [ ] Submit button is disabled on click to prevent double submits.
  - [ ] Successful signup redirects to `/dashboard`.
  - [ ] Success toast explicitly prompts user: "Account created successfully! Please check your email inbox and spam folder for the verification link."
  - [ ] Generates auth token, stores it in `drx_token` local storage.
  - [ ] Backend creates a 14-day Pro Free Trial subscription in the database.

### 1.3 User Login Flow (`/login`)
- [ ] Input email and password validations.
- [ ] Invalid credentials return clean, non-disclosing "Invalid credentials" error.
- [ ] Deactivated user accounts are blocked with a clear "Account is deactivated" message.
- [ ] Device fingerprint checks:
  - [ ] Resolves and logs IP address and User Agent.
  - [ ] Unrecognized device (different browser, new location) triggers a "New Device Login" notification email containing login parameters (IP, browser type, timestamp).
- [ ] Sets HttpOnly session cookie `drx_admin_session` (when logging into the web dashboard or admin).

### 1.4 Password Reset (Forgot Password) Flow
- [ ] **Request Reset Form:**
  - [ ] Prompts for email address.
  - [ ] Displays success notice unconditionally even if the email does not exist in the database (security requirement to prevent email enumeration).
  - [ ] Emails a secure password reset link containing a signature token.
- [ ] **Reset Link Execution:**
  - [ ] Clicking the link loads the `/reset-password` frontend form.
  - [ ] Link expires exactly 60 minutes after generation.
  - [ ] Prompts for new password and confirmation.
  - [ ] Successful submit updates password in the database, invalidates the reset token, and redirects to login with success toast.

### 1.5 Email Verification Link Landing Page (`/verify-email`)
- [ ] Navigating to the route without `token` or `email` parameters shows "Invalid verification link. Missing token or email."
- [ ] Link parses the production URL signature: `https://dumosrx.com/verify-email?token=...&email=...`
- [ ] Triggers the backend verify endpoint `/api/v1/verify-email` without crash (fixed the clone null user bug).
- [ ] Renders page loading spinner during confirmation.
- [ ] **Successful Verification:**
  - [ ] Displays green Check circle.
  - [ ] Prompts redirecting text.
  - [ ] Redirects automatically to the dashboard.
- [ ] **Failed Verification:**
  - [ ] Displays red Error X circle.
  - [ ] Shows exact error reason (e.g. token expired, invalid signatures).
  - [ ] Displays "Return to Dashboard" redirect button.

---

## 📈 Group 2: Retailer / Store Owner Web Dashboard

### 2.1 Overview & Analytics
- [ ] Summary cards load (Total Sales in Naira, Inventory Value, Stores count, Last Sync time).
- [ ] Sales growth graphs populate.
- [ ] Live store network list loads (name, sync status, sales).
- [ ] Warning banners load if there is an active global broadcast.

### 2.2 Global Dashboard Gating (Unverified Status)
- [ ] Amber `<VerificationBanner>` shows at the top of every dashboard subpage if `require_email_verification` is ON and user is unverified.
- [ ] Verification banner copy explicitly instructs users to check **both inbox and spam/junk folder**.
- [ ] "Resend Email" button inside the banner triggers loading state and success toast.
- [ ] All write actions (POST, PUT, DELETE) on the dashboard return 403 `email_not_verified` with a clean blocking notification.
- [ ] Local App download button in `DownloadsView` is disabled/hidden for unverified users.

### 2.3 Store Outlets Management (`/dashboard/fleet`)
- [ ] Add new store outlet card (automatically generates outlet ID with prefix e.g. `WEB-XXXX`).
- [ ] Edit store parameters (Address, Status, Type).
- [ ] Delete store outlet.
- [ ] Synchronisation tracker shows connection status (Online/Offline) and time elapsed since last check-in.

### 2.4 Staff Directory (`/dashboard/staff`)
- [ ] Create Staff profile form:
  - [ ] Input First Name, Last Name, Email, Username, Role (Manager, Pharmacist, Cashier), and Status.
  - [ ] Input terminal login PIN (4 digits).
  - [ ] Validates staff count limit based on the store's current subscription tier (Starter: 3 staff, Pro: 10 staff, Free: 1 staff).
- [ ] Edit Staff parameters.
- [ ] Suspend/deactivate staff (prevents local POS terminal login).
- [ ] Delete staff record.
- [ ] Recent staff login sessions list.

### 3.5 Billing, Subscription, & Licensing (`/dashboard/billing`)
- [ ] Display current subscription plan badge (Free, Trial, Starter, Pro, Enterprise).
- [ ] Subscription pricing plan selector grid:
  - [ ] Monthly / Annual billing cycle toggle adjusts prices.
  - [ ] Dynamic feature checklist changes per plan.
- [ ] Apply Coupon Discount input box (validates discount percentage and checks expiration).
- [ ] **Paystack Integration checkout:**
  - [ ] Launches Paystack Payment gateway modal.
  - [ ] Pay via Card, Bank Transfer, USSD, or QR code.
  - [ ] Validates callback parameters and updates DB status on success.
- [ ] Displays invoice and billing history list.
- [ ] **License Key Generation:**
  - [ ] Generates signed JWT License Key containing tier info, store limits, and expiration date.
  - [ ] Provides copy-token button to sync with the local offline POS client.

### 2.6 Referral Program
- [ ] Copy Referral Code button works (code template: `DRX-XXXXXX`).
- [ ] Displays referral credit balance widget (in Naira).
- [ ] Lists active referrals (shows referred users, stores created, and status).
- [ ] Credit transactions ledger shows earned reward additions and subscription deduction logs.

### 2.7 Security & Sessions
- [ ] Change password form (validates current password before applying changes).
- [ ] Change/update 4-digit POS Terminal PIN.
- [ ] **Active Sessions tracking table:**
  - [ ] Renders IP address, browser type, Operating System, and last active timestamp per session.
  - [ ] Revoke Single Session button (logs out targeted device).
  - [ ] Revoke All Other Sessions button (logs out all devices except current).

### 2.8 Account Deletion (Danger Zone)
- [ ] Enter Deletion Reason input box.
- [ ] Submit Account Deletion request:
  - [ ] Sets status to pending.
  - [ ] Logs account activity log.
  - [ ] Displays deletion warning on dashboard header.
- [ ] Cancel Deletion Request button removes deletion request from database, returns status to active.

---

## 👑 Group 3: Platform Super Admin Panel

### 3.1 Overview Summary
- [ ] Displays live global metrics (Total Active Retailers, Total Stores, Active Subscriptions, Monthly Revenue).
- [ ] Displays database size and system logs status.

### 3.2 User Management Panel
- [ ] Paginated list of registered users.
- [ ] Live search bar (filters by name, username, email).
- [ ] Create Platform Admin form.
- [ ] Deactivate User toggle (blocks login immediately and revokes all active session tokens).
- [ ] Reactivate User toggle.
- [ ] Force Password Reset button (generates a temporary random password).
- [ ] Delete User cascade trigger.
- [ ] Send Targeted Notification (directly inserts warning banner to specific user).
- [ ] Bulk Notification (sends a platform-wide alert).

### 3.3 Store & Subscription Control
- [ ] Paginated list of registered retail stores.
- [ ] Search by Store Name, Owner Email, or Device ID.
- [ ] Register a store manually on behalf of a user.
- [ ] Suspend Store toggle (immediately blocks POS syncing and local sales updates).
- [ ] Unsuspend Store toggle.
- [ ] **Grant Trial Extension dialog:**
  - [ ] Input extension length (days count).
  - [ ] Updates DB models to extend trial grace dates.
- [ ] **Impersonation Flow:**
  - [ ] Click "Impersonate" on store outlet row.
  - [ ] Logs out admin session from frontend memory and loads store owner's web dashboard view.
  - [ ] Top banner reads: "Impersonating Store: [Name] | [Return to Admin]".
  - [ ] Clicking "Return to Admin" restores original admin session context.

### 3.4 Announcements Broadcasts
- [ ] Create announcement form:
  - [ ] Renders target options (All, Store Owners, Staff).
  - [ ] Type options (Info, Warning, Danger).
  - [ ] Rich Text/Markdown editor.
- [ ] List of past announcements.
- [ ] Status toggle (Active/Inactive).
- [ ] Delete Announcement.

### 3.5 System Diagnostics & Configuration
- [ ] **System Configuration toggles:**
  - [ ] Toggle "Require Email Verification" globally.
  - [ ] Configure throttles (login failures count before lockout).
- [ ] **System Health Check tab:**
  - [ ] CPU core loads and RAM charts.
  - [ ] Hard disk write status check.
  - [ ] Mailer configuration testing endpoint.
  - [ ] Database migrations integrity check.
- [ ] **Email Templates Editor:**
  - [ ] Select template from dropdown (Welcome, Verification, Device login).
  - [ ] Edit email subject line.
  - [ ] Edit HTML content (Blade tags).
  - [ ] Template variables quick guide list.
  - [ ] Click "Save Template" updates database seeder registry.
- [ ] **User Feedback Registry:**
  - [ ] Lists error logs, stack traces, and feedback messages.
  - [ ] Status selector: Open, In Progress, Resolved.

---

## 💻 Group 4: Local Client Desktop Application (Offline POS)

### 4.1 Quick Setup Wizard (First-Run)
- [ ] **Step 1: Introduction** (explains local SQLite database format).
- [ ] **Step 2: Database Initialization:**
  - [ ] Option A: Create new local database from scratch.
  - [ ] Option B: Restore from local SQLite database file upload (`dumosrx.db`).
- [ ] **Step 3: Account Linking Setup:**
  - [ ] Option A: Standalone Mode (disables sync, locks app parameters to Free standalone tier).
  - [ ] Option B: Link Cloud Account (login credentials verification or pasting JWT License Token).
- [ ] **Step 4: Initial Cloud Pull:**
  - [ ] Downloads full medicine list, active staff profiles, configurations, and licenses.
  - [ ] Renders progress percentage bars.
  - [ ] Redirects to Local PIN login page on success.

### 4.2 Local PIN Authentication
- [ ] Local login screen displays list of active staff profiles downloaded during sync.
- [ ] Selection prompts for 4-digit PIN.
- [ ] PIN validation happens locally against encrypted database value.
- [ ] Blocks access after 5 failed attempts.
- [ ] Auto-lock app screen triggers after inactivity time threshold.

### 5.3 Point of Sale (POS Checkout)
- [ ] **Product Catalog Lookup:**
  - [ ] Fast search bar: queries locally by brand name, generic name, category, strength, or barcode.
  - [ ] Catalog query filters out deleted items (`_deleted = 0`).
  - [ ] Out of stock items display grayed out (blocked from checkout).
  - [ ] Expired items display in red (blocked from checkout).
- [ ] **Barcode Scanner Integration:**
  - [ ] Focus listener intercepts USB barcode scanner inputs.
  - [ ] Camera Scanner option: captures frame, decodes EAN barcode, inserts to cart.
- [ ] **Cart Actions:**
  - [ ] Add item, increment / decrement quantities.
  - [ ] Quantity input validates against current physical stock balance.
  - [ ] Remove item.
  - [ ] Calculate total, tax, and discount sums.
- [ ] **Smart Upsell / Cross-Sell Suggestions:**
  - [ ] Dynamic SQLite queries match cart items with clinical database categories.
  - [ ] Panel displays cross-sell opportunities (e.g. adding Multivitamins when dispensing Antibiotics).
  - [ ] Single-click button to insert suggested product to active cart.
- [ ] **Customer Profiling:**
  - [ ] Select customer from list.
  - [ ] Add customer profile inline.
  - [ ] Renders chronic condition warning flags (e.g. highlights "Diabetic" in red on selection).
  - [ ] Track and add loyalty points upon transaction completion.
- [ ] **Parked (Held) Transactions:**
  - [ ] "Hold" button prompts for description, parks current cart to database.
  - [ ] Renders held list with timestamps.
  - [ ] "Recall" cart loads parked items back to checkout.
- [ ] **Checkout Payments Dialog:**
  - [ ] Select payment method (Cash, Card, Bank Transfer).
  - [ ] Split Payments toggle: allows inputting payment split details (e.g. Card: ₦5k, Cash: ₦2k).
  - [ ] Apply percentage or fixed-amount discount.
  - [ ] Choose destination bank account ledger.
  - [ ] Complete sale: decrements inventory stock level, updates local sqlite transaction tables, prints receipt.
- [ ] **Returns & Refunds:**
  - [ ] Search sales history for target transaction.
  - [ ] Select items to return, inputs reason.
  - [ ] Renders returns value, processes inventory restock increment, logs transaction refund entry.

### 4.4 Inventory & Stock Ledger
- [ ] **Overview Metrics:**
  - [ ] Renders Total Stock Value in Naira.
  - [ ] Lists active stock lines, low stock alerts count, near-expiry alerts count.
- [ ] **Medicine Registry:**
  - [ ] Add/Edit medicine form (Generic, Brand, NAFDAC number, category, strength, unit size).
  - [ ] Configure inventory prices (cost price, retail price, reorder alerts threshold).
  - [ ] Filter catalog by low stock, expiring, or deactivated items.
- [ ] **Stock Adjustments:**
  - [ ] Manually modify stock counts (loss, damage, audit variance correction).
  - [ ] Logs event details in `stock_movements` table.
- [ ] **Purchase Orders (Procurement):**
  - [ ] Generate PO to supplier.
  - [ ] Status lifecycle tracking: Draft -> Sent -> Partially Received -> Fulfilled.
  - [ ] "Receive Stock" updates inventory levels, logs batch numbers and expiries.
- [ ] **Batch & Expiry Management:**
  - [ ] Track batch codes and shelf codes per product.
  - [ ] Expiry warning widgets display (items near-expiry at 30/90/180 days).
- [ ] **Custom Barcodes Generator:**
  - [ ] Create barcode labels, renders grid sheets for sticker printing.
- [ ] **Stock Audits:**
  - [ ] Run audit sheet, enter counted values.
  - [ ] Renders audit variance reports (counted vs computed).

### 4.5 Patient CRM Registry
- [ ] Register customer (Name, Phone, Chronic Conditions list, Chronic notes, Loyalty points).
- [ ] View customer transaction ledger history.

### 4.6 Prescriptions (Clinical Portal)
- [ ] Create prescription record (Doctor details, clinic info, drug dosage instructions, refill count).
- [ ] Dispatch prescription automatically populates POS checkout cart.
- [ ] Monitoring prescription refill status logs.

### 4.7 Expense Ledger
- [ ] Log local expenses (Rent, Salaries, Utilities, Procurements, Others).
- [ ] Export monthly expense CSV reports.

### 4.8 End of Day (EOD) Daily Close
- [ ] Lock terminal to execute Close Shift.
- [ ] Input drawer cash count.
- [ ] Input card slips count.
- [ ] Input bank transfers total.
- [ ] Renders discrepancy / variance calculation sheet.
- [ ] Input discrepancy explanation.
- [ ] Save and export EOD Shift Close PDF.

### 4.9 Local Data Control
- [ ] Export SQLite database file (`dumosrx.db`).
- [ ] Import SQLite database file (restores offline state).
- [ ] Clear database (secure purge utility).
- [ ] **QuickBooks 2013 CSV Importer:**
  - [ ] Upload QuickBooks items CSV.
  - [ ] Field mapping dropdown selector.
  - [ ] Renders data validation preview panel (marks errors, missing values).
  - [ ] Run QuickBooks import: inserts records to SQLite catalog.

---

## ⚙️ Group 5: Deployment, Infrastructure, & Security Services

### 5.1 Database Schema & Migrations
- [ ] Running `php artisan migrate` applies all updates cleanly without conflicts.
- [ ] Verify `users` table contains `email_verified_at` column (fixed missing column migration).
- [ ] Verify `email_verification_tokens` table is created.
- [ ] Verify `system_configs` table exists and seeds correctly.

### 5.2 Cache & Optimization Service
- [ ] Caching `SystemConfig::getVal` using `Cache::remember("system_config_{$key}", 3600, ...)` performs correctly.
- [ ] Updating system configurations successfully purges targeted key cache (`Cache::forget("system_config_{$key}")`).

### 5.3 Offline Bidirectional Sync Engine (API Handlers)
- [ ] **Push Endpoint (`/api/v1/sync/push`):**
  - [ ] Receives sync queue arrays from local clients.
  - [ ] Inserts/updates MySQL tables.
  - [ ] Handles conflict resolution (Last Write Wins).
  - [ ] Returns list of successfully sync IDs to client.
- [ ] **Pull Endpoint (`/api/v1/sync/pull`):**
  - [ ] Receives `last_synced_at` timestamp.
  - [ ] Fetches all database updates since timestamp.
  - [ ] Transmits payload batch back to client.

### 5.4 Licensing & Security Integrity
- [ ] **Clock Backdating Protection:**
  - [ ] local app compares sync timestamps.
  - [ ] Clock changes (backdating system time) lock terminal layout, displaying monotonic clock tampering warning.
- [ ] **JWT License Validation:**
  - [ ] local client verifies JWT cryptographic signatures offline using public key configurations.
  - [ ] Verifies expiration status and limits.

### 5.5 Mail Queues & Webhook Dispatchers
- [ ] Queued emails (Welcome email, Password Reset, Verification link, Login alerts) dispatch asynchronously.
- [ ] Paystack / Flutterwave webhook handlers process callbacks, update invoice states, and extend license terms automatically.
