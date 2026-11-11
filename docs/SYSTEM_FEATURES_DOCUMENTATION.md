# 📖 DumosRx: Complete System Features Guide

Welcome to **DumosRx**! This guide outlines everything our comprehensive retail management system can do for your store. Whether you have a single pharmacy or a chain of retail outlets, DumosRx is built to keep your business running smoothly, even without an internet connection.

---

## 🏗️ 1. The DumosRx Advantage

DumosRx is designed as an **offline-first** platform. This means your cashiers can continue to sell products, manage inventory, and serve customers even if your internet goes down.

The system consists of two main parts working together:

1. **The Desktop POS App:** Installed on your store's computers. This is what your cashiers use every day to ring up sales and manage stock. It works 100% offline.

2. **The Cloud Dashboard:** Your command center on the web. You can log in from your phone or laptop anywhere in the world to see your store's performance, manage staff, and handle billing.

Whenever the internet is connected, the Desktop POS automatically synchronizes its data with your Cloud Dashboard in the background!

---

## 💻 2. The Desktop POS App (For Your Store)

The desktop application is built for speed, reliability, and ease of use. It contains all the tools your staff needs to run the store efficiently.

### 🛒 Point of Sale (POS) & Checkout

**Fast Checkout:** Quickly search your catalog or use a barcode scanner to ring up items.

**Split Payments:** Customers can pay with a mix of Cash, Card, and Bank Transfers on a single receipt. The system automatically calculates any exact change needed.

**Smart Suggestions:** The system intelligently recommends related products (like suggesting Vitamin C when a customer buys Antibiotics) to help increase your sales.

**Missing Product Log:** Cashiers can quickly log products requested by customers that are out of stock, visible to the procurement manager.

**Customer Profiles & Loyalty System:** Save customer details, track chronic conditions, and automatically award points using our built-in **Customer Loyalty Program** (e.g. earn 1 point for every ₦1000 spent).

**Customer Debt Ledger:** A dedicated dashboard to track sales made on credit to trusted customers, including a repayment logging system.

**Park Transactions:** Put a customer's cart on "Hold" if they need to grab another item, allowing you to serve the next person in line.

**Custom Receipts:** Print thermal receipts customized with your store's logo and details, with the logo shown above or beside your store name — whichever you prefer. Print a formal **Tax Invoice** variant that adds your store's tax/VAT number to the header, for customers who need one for their own records. Not printing to a till roll? Switch the device to **A4** and the same receipt lays itself out across the full width of the page — the format to use when a customer files your receipt as an invoice. Paper size is remembered per device, so the counter can stay on its roll while the back office prints A4. Receipts print short by design: lines that would only repeat a figure you already have — a sub total identical to the total, a "total paid" with no change to report — are left off, and the barcode at the foot can be switched off entirely under **Settings → Receipt**. The footer message starts as "Thank you for your patronage!" and is yours to rewrite or clear — an empty footer prints nothing at all. A tax invoice always carries its tax number, and the totals a customer needs in order to check what they paid are never hidden.

**Proforma Quotes:** Give a customer a price breakdown for their shopping list before they commit — no sale is recorded and no stock leaves your shelves until it's actually charged.

**Reseller Sales & Store Markups:** Selling above your normal price? Mark the sale up and choose why: for an independent reseller who found their own client (the system works out their commission automatically, a percentage of the markup set once in Settings, for you to pay out whenever they collect it), or as a markup your store simply keeps for itself, with the money going straight into your books instead of sitting around waiting to be settled. Either way it's clearly badged and filterable in your sales history, so you can always tell the two apart. Turn this on for your staff in Settings → Register Configs (off by default).

**Sold Above / Below List Price:** Reseller sales may now be priced below the normal price as well as above it. Every sale line remembers the normal (list) price it was rung up against, and wherever the sale shows (sales history, the dashboard feed, daily close and the transaction details) a green `+` or red `Price cut −` badge shows the total charged above or below list; opening the sale shows the list price and per-unit difference on each line. Customer receipts do not show it. Sales recorded before this existed have no list price and show no badge. Returning goods from a reseller sale lowers the markup and any unpaid commission to match what was actually kept; if the commission was already paid, the return screen warns how much the reseller owes back and the sale records it.

**Sell Beyond Recorded Stock:** Goods on the yard but not yet entered? Turn on **Allow sales beyond recorded stock** in Settings → Register Configs (off by default, available on every plan) and the till lets staff sell more than the system shows. The cashier sees a warning ("Only 3 in stock. 2 will be recorded as owed until stock is received."; staff who are not allowed to see stock numbers get the same warning without the numbers), and the extra units are recorded as owed. When the purchase order or Immediate Purchase is received, the owed units are paid off first and only the rest goes on the shelf, and the receive screen says so ("5 already sold before this delivery. 15 will go on the shelf."). The earlier sales are then re-costed at what the delivery actually cost, so profit already reported for the days they were sold **will change** to the true figure. Owed units keep showing on the dashboard's Action Center and in the stock alerts until a delivery settles them, and the cycle count warns before you count an item with owed units, because counting before receiving would count the delivery twice. An online order you choose to fulfil past stock is recorded as owed in the same way. Update every till before switching this on: older app versions keep refusing sales at zero, and they do not settle owed units when they receive stock.

### 📦 Inventory & Stock Management

**Product Catalog:** Manage your entire list of products, including brand names, generic names, strengths, and NAFDAC regulatory numbers.

**Batch & Expiry Tracking:** Never lose money to expired goods again. The system tracks the exact batch numbers and expiry dates of every item in your store.

**Stock Adjustments:** Easily log and track write-offs for lost, stolen, or damaged goods. In-progress adjustment entries are store-scoped and saved automatically into local SQLite (`stock_adjustment_drafts`), so switching branches or answering another till preserves any staged items and reason notes without risk of data loss. An oversell (a sale of units the stock ledger did not hold) also appears here as an "Oversell" entry: the stock-in the ledger was missing, so the next count records only what the counter sees. The dashboard's oversold alert means a batch that still owes units today.

**Cycle Count (Stock Audit):** Count the shelves against the system a row at a time. The Counted Qty column opens **empty**, with the system's own figure shown faintly inside it — so what you have entered is exactly what you have counted, and the rows still blank are the ones left to walk. Where a count matches the system you can simply tick the row instead of retyping the figure, and un-ticking takes it back to uncounted. Filter the sheet by Counted, Not Counted or Qty Differences to see what's left to do, or to re-verify just the rows that disagreed. A **Last Counted** column shows when each product was last reconciled by a count, so the shelves nobody has touched in months are easy to find and sort to the top. An in-progress count is saved on the device into local SQLite (`stock_audit_drafts`), partitioned per store — switch stores to attend to an urgent task at another branch, and your active counts remain preserved and reload automatically when returning to that store, with an informational confirmation reminder if leaving an unsubmitted count. "Start over" in the export menu is there for when you want to abandon it and begin again. A count only ever posts the rows whose figures you actually changed, so walking into Review and submitting without touching anything changes nothing. The sheet can be printed, or downloaded as CSV/XLSX/PDF, and every output holds exactly the rows the filters show (category, Count status and search), in the order shown, with any counted quantity already entered. The printout and PDF name the filters in their header, and a spreadsheet's file name carries the category. Print and the spreadsheets are instant, while the PDF has to lay out every row and is the slow option on a large catalog — filter first to keep it short.

- **Multi-Till Cloud Backing & Fencing:** Cycle counts are backed to cloud audit sessions (`audit_sessions` and `audit_session_items`) with a single-editor renewable 5-minute lease and 60s background heartbeat. Other devices in the same store inspect progress in read-only mode, seeing the active till's name and counted tally.
- **Atomic Store Locking & Session Takeover:** Store-level locking (`Store::lockForUpdate()`) strictly prevents concurrent duplicate sessions per store. If a counting device fails or changes hands, another till can explicitly take over the session; takeover increments the fencing `lease_version`, atomically invalidating superseded leases (HTTP 409) while preserving local counts on the older till without silent data loss.
- **Sync-Confirmed Completion Lifecycle:** Local submission via `submitStockAudit()` updates SQLite and queues delta sync immediately to prevent blocking offline tills. Cloud session marks `completion_pending_sync` with `submitted_stock_audit_id`, transitioning to `completed` once the sync engine delivers the reconciled `stock_audits` records to the cloud.

**Procurement:** Generate Purchase Orders for your suppliers. An Immediate Purchase — goods paid for and taken on the spot — opens on "Fully Paid", while a standard Purchase Order raised ahead of payment opens on "Unpaid"; either can be changed before saving. When the goods arrive, the system automatically updates your stock levels. Your catalog also shows the price you last actually paid for each product, right alongside its running average cost.

**Sell at Zero Stock (Overselling / Delayed Paperwork):** When physical delivery has arrived on the shop floor but staff hasn't had the time or capacity to enter the purchase order paperwork yet, the store can toggle on "Allow Sales Without Stock" in Settings → Store. Cashiers can continue selling incoming items immediately. Shortfalls are recorded as owed backorders. When the delivery is subsequently entered through a Purchase Order or Immediate Purchase, backorders are cleared and historical sales lines are automatically re-costed from the delivery cost.

**POS Spot Sourcing (On-the-Spot External Sourcing in Cart):** When a customer needs an out-of-stock item and staff can immediately get it from a neighboring pharmacy or partner shop:
- Cashiers can click "Source outside" directly on the cart item, or tap an out-of-stock product tile to open the Spot Source dialog.
- Staff enters the agreed purchase cost (what was paid to the neighbor) and whether it was paid from the **Cash Drawer** or on **Owner Credit / Paid Externally**.
- **Net shelf stock is zero:** It does not deduct existing batches or create phantom negative stock or backorders.
- **Instant profit accuracy:** The true cost price is saved on the sale line, giving you 100% accurate profit reports instantly.
- **Automatic register cash balance:** If paid from the Cash Drawer, the system automatically writes a cash expense ("Stock Sourcing") behind the scenes. At Daily Close, Net Cash Expected automatically accounts for the cash paid out, so physical cash reconciles without manual notes or shortages!

**External Stock Sourcing (Unlinked Stores & Partner Sourcing via Procurement):** For larger batches collected from an unlinked sister branch or partner store before sales:
- The sale is booked under the selling store (customer receipt issued for full price).
- Sourcing is entered as an Immediate Purchase from the supplying store (treated as a supplier) at the agreed cost price.
- Can be combined with Sell at Zero Stock: cashiers sell the collected stock first, and entering the Immediate Purchase later settles the backorder and re-costs the sale line.
- The selling store retains the gross margin (Retail Price − Sourcing Cost).
- If cash is paid immediately to the partner store or runner from the till drawer, an Expense is recorded (Category: Stock Sourcing / Purchase, Payment Method: Cash) to reconcile Net Cash Expected in Daily Close without register discrepancies. If sourced on credit, the payable balance is tracked in the Supplier Debt Ledger until settled.

**Borrow Stock Between Branches:** Running low on something and the owner isn't around? A cashier can pull stock in from another one of your branches right from the checkout screen — it moves immediately, and is flagged for you to review afterward. You decide who's allowed to do this: managers and admins always can, and you can choose whether to extend that to regular staff too (Settings → Multiple Stores, off for staff by default).

**Supplier Debt Ledger:** Track goods received on credit from your suppliers, manage your business cash flow, and log partial or full payments against outstanding purchase orders.

### 🏥 Clinical Prescriptions (For Pharmacies)

**Prescription Registry:** Digitally record and track customer prescriptions.

**Refill Reminders:** The system alerts your cashiers when a chronic patient is due for a refill.

### 📊 Shift Management & Expenses

**End of Day (EOD) Closure:** At the end of their shift, cashiers must count the drawer. The system automatically compares their count with the recorded sales and highlights any shortages or overages.

**Expense Tracking:** Log daily operational expenses directly from the cash register.

**Net Cash Expected:** Daily Close deducts the day's cash-paid expenses from the cash the drawer should hold, so the figure you reconcile against is what you actually expect to find — not gross cash sales. A prepaid expense (one spread over months) is deducted in full on the day it was paid, because that is when the money left the till; the Profit & Loss report still amortises it across the months it covers. Expenses paid by transfer or card never touch this figure.

**See How a Figure Is Made:** Tap "Net Cash Expected", "Profit before expenses (Est.)" or "Profit after expenses (Est.)" on Daily Close to see every number that goes into it — cash sales, cash refunds and cash expenses for the first; sales, refunds, VAT, cost of goods and any reseller commission paid out for the second; the same lines plus the day's expenses for the third — adding up exactly to the figure on the card.

**Profit After Expenses:** Daily Close shows a second profit figure, "Profit after expenses (Est.)", beside "Profit before expenses (Est.)". It takes off every expense dated that day in full, however it was paid, and for an expense spread over several months (such as quarterly rent) one day's share of that month's installment, on every day of the months it covers. Like the first profit figure, it is hidden from cashiers, and it appears in the CSV and PDF exports.

**Expenses by Date Range:** Filter the Expenses list to any range of dates, or pick a preset such as "This month" or "Last month". The total, the spread-cost figure, the top category and the transaction count all follow the range; clear it to go back to every expense.

**Spreading a Prepaid Expense:** When adding an expense, "Spread over how many months?" lets a payment that covers several months (a year's rent, say) count an equal share in each month of your profit reports instead of all at once. The info icon beside the field explains it in place.

**This Device:** Settings → System names the device you are on and shows its device ID, the same one that appears beside its activity in the owner's dashboard — so a support call can identify the right till without guessing.

**Offline Backups:** You can manually export a backup of your entire store's data to a flash drive for extra peace of mind.

### 🤖 In-app Assistant

**Just Ask:** Open the assistant from the icon in the header — or "Ask the assistant" in your account menu — and type a question in plain English.

**Shows You How:** Ask "how do I add a product?" or "how do I run daily close?" and it walks you through the steps, then gives you a button that takes you straight to the right screen. No more hunting through menus or waiting on a support call to train a new staff member.

**Answers About Your Store:** Ask "what's low on stock?", "how many paracetamol do we have?", "total sales yesterday" or "net profit last month" and it reads the answer out of your own store's data.

**Works With No Internet:** Like the rest of the POS, the assistant runs entirely on your store's computer. There is no AI subscription, no API key to buy, and nothing to set up — it works exactly the same on a till that has never been online.

**Included From Pro:** The assistant is part of the Dumos Pro and Enterprise plans, the same as Smart Suggestions. On Free and Starter the icon stays in your header and tells you which plan unlocks it, so you always know it's there. If you'd like it on a different plan for a particular customer, it's a per-plan switch in Platform Settings rather than a code change.

**Respects Your Staff Permissions:** Everyone gets answers to the things they're allowed to see, and only those. A cashier asking about sales gets their *own* sales for the day rather than the store's takings, and profit questions stay with the people you've given financial access to. The suggestions it offers each person are filtered the same way, so nobody is prompted to ask something they'd only be refused.

---

## 📈 3. The Cloud Dashboard (For Store Owners)

Your Cloud Dashboard is your management hub. Log in from any web browser to get a bird's-eye view of your entire business.

### 📊 Business Insights

**Live Dashboard:** View your total sales, current stock value, and recent growth trends in easy-to-read charts.

**Multi-Store Management:** Do you own multiple branches? Manage all your different store locations from one single account. You can see exactly when each branch last synced its data.

### 👥 Staff & Security Management

**Staff Registry:** Create accounts for your managers, pharmacists, and cashiers. On a multi-branch account the list opens on the branch you are currently working in, with "All Stores" still available in the picker; your staff-account allowance is counted across the whole account, not per branch.

**Staff Deletion & Account Recovery:** Easily remove former staff from your active roster with the Delete button so they no longer appear in your active staff list. Because DumosRx protects business history, deleting an account never breaks old sales records, receipts, or audit logs. Deleted accounts are safely archived in the "Deleted Accounts" tab (and accessible via the "Deleted" status filter), where store owners can review them or restore them with a single click at any time.

**Role-Based Access:** Decide exactly what each staff member is allowed to see or do.

**Hide Stock Numbers From Staff:** Untick "View Stock Quantities" for a group (Settings → Roles & Permissions) and its members see "In stock", "Low stock" or "Out of stock" instead of how many units you hold, at the till, in the cart, in Inventory, on stock-transfer requests, online orders and when they ask the assistant. They are still told when something is out of stock or when they ask for more than is available, just without the number. Every group keeps seeing numbers until you change this, and staff who can count, adjust or receive stock, view stock history or view reports still see numbers on those screens. It hides numbers from view rather than locking the till's data, and each till picks it up once it is updated. The older "Display Item Stock Levels" switch under Register Configs still hides the till's stock chips for everyone, owners included.

**Secure PIN Login:** Assign unique 4-digit PINs to your cashiers for fast, secure login at the store computers.

**Remote Logout:** Instantly sign out devices remotely if a computer is lost or a staff member leaves the company.

**Instant Till Re-link (Owner Self-Service & CRM Fallback):** If a till computer is disconnected, formatted, or unlinked, store owners never have to travel down to the branch or share their master cloud password and PIN with staff. The store owner can generate a single-use 8-character 15-minute Re-link Code from their personal till or mobile browser under **Settings → Security → Sessions & Devices**. Additionally, if the owner is unreachable or unavailable, DumosRx CRM and support agents can generate a re-link code on the owner's behalf directly from the administrative portal. Cashiers simply enter the 8-character code at the till to securely re-authenticate the device immediately.

### 🌐 Online Storefront

**Products Show Online By Default:** New products are listed on your online store automatically, whether you add them one by one or import them. Untick "Show Online" on any product, or use the bulk toggle, to hide it. Products you already had are listed too once DumosRx runs the one-time update on your account (prescription-controlled items are left unlisted).

**Multi-Branch Webstore (One Storefront Per Owner):** Pharmacy owners with multiple branches get a single cohesive webstore under their brand name. Customers can switch between branches using the branch selector (`?branch=...`), which automatically loads that branch's real-time inventory and routes payments directly to that branch's Paystack subaccount. Carts are isolated per branch with an explicit confirmation dialog before switching.

**Dedicated Product Catalog Page:** Customers can browse your complete product catalog at `/store/[slug]/catalog` with instant keyword search, category filter badges, and responsive pagination. Available in-stock products automatically rank first before out-of-stock items.

**Company Profile, Locations & FAQ Pages:** Showcase your brand with dedicated company pages:
- `/store/[slug]/about`: Pharmacy mission, qualified clinical care commitments, and patient support values.
- `/store/[slug]/locations`: Interactive branch directory with street addresses, telephone click-to-call, and "Shop this branch" deep links.
- `/store/[slug]/faq`: Plain-language pharmacy policies, order fulfillment steps, prescription verification, and return procedures.

**Order Tracking:** Customers can check the live fulfillment status of their orders at `/store/[slug]/track` using their order reference code or Paystack payment reference. For customer privacy, names are masked (e.g. `J*** D***`).

**Digital Prescription Upload:** Patients can securely upload doctor prescriptions (scanned photos or PDFs up to 5MB) along with contact details and medication notes at `/store/[slug]/prescription`. The receiving branch pharmacists are immediately notified to verify the prescription and prepare fulfillment.

### 💳 Billing & Subscriptions

**Easy Renewals:** Manage your DumosRx subscription easily through secure, automated payments.

**Referral Rewards:** Get your unique referral code to invite other store owners and earn credits!

---

## 🔒 4. Unmatched Security & Reliability

We take the safety of your business data seriously.

**Always-On Operation:** Your store never stops. If the internet drops, your Desktop POS keeps working flawlessly — even a brand-new install can launch and start ringing up sales fully offline, right from its very first use. Once the connection returns, it quietly backs up all new sales to the cloud.

**Anti-Tampering Protection:** Our system detects if anyone tries to manipulate the computer's clock to bypass security, immediately locking the terminal to protect your data.

**Cloud Backups:** Your data is continuously backed up to our secure cloud servers, protecting you against hardware failure or theft at the store.

**Every Till Checked Against the Cloud:** Support can now see, for each of your tills and for every kind of record it holds — products, sales, customers, expenses, prescriptions, purchase orders and the rest — whether that till is holding the same records as the cloud, or is still catching up, or genuinely disagrees. Each line says so in words rather than just a colour, and a till that has gone quiet is reported as *stopped reporting* rather than quietly counted as healthy, because silence is not the same as agreement. Previously only stock was compared, so a problem in any other part of your data had nothing watching it at all. The technical detail — including what this check deliberately cannot see — is in `docs/DEVICE_TABLE_AGREEMENT.md`.

**How Long a Change Has Been Waiting:** Alongside "did the last sync succeed", we now track how long the oldest unsent change on a till has actually been waiting, and how quickly recent changes reached the cloud. The question support can answer is no longer just "is the connection working" but "has anything been sitting on this till longer than it should".

**Ask a Till for a Report, and See Whether It Arrived:** Support can request a diagnostic report from one of your tills, and the request now shows its own outcome — sent to the till, received at a given time, or the reason the till refused — and can simply be asked again. No more wondering whether a silent request ever got there.

**Deletions and Corrections Reach Every Till:** When a record is removed or corrected in one place, it now reliably disappears or updates everywhere instead of lingering on some tills. Voided sales now carry their line items to every till as well, so a cancelled sale reads the same on every machine, and a stock correction made for one store can no longer be overwritten by a till that has been offline since before it.

**Instant Broadcasts:** Receive important alerts, updates, and maintenance notices directly on your store's screens.

**Over-The-Air (OTA) Updates:** The system intelligently manages software updates. Minor patches and bug fixes are downloaded automatically in the background without interrupting your workflow, while major new versions will prompt you for installation. Mobile users are seamlessly directed to their respective app stores.

---

*DumosRx - Modernizing retail operations, one transaction at a time.*
