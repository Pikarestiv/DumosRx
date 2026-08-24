# Seed Data: Purchase Order (depends on the 10 products in `dumosrx-seed-products.md`)

A Purchase Order needs a **Supplier** selected from a dropdown (it can't be typed inline). Add this one first via the "+" next to the supplier field, or Procurement → Vendors → Add.

## 0. Supplier to add first

| Field | Value |
|---|---|
| Supplier Name * | Fidson Distributors Ltd |
| Contact Person | Amaka Okafor |
| Email | orders@fidsondist.example.com |
| Phone | +234 803 555 0142 |
| Address | 14 Oshodi-Apapa Expressway, Lagos |
| Tax ID (TIN) | 2109-4477-0001 |
| Payment Terms (days) | 30 |
| Active | Yes |

## 1. Order header

| Field | Value |
|---|---|
| Select Vendor | Fidson Distributors Ltd (added above) |
| Internal Notes | Initial stock, Ref PO-0001 |
| Payment Status | Partial Payment |
| Due Date | 30 days from order date |
| Amount Paid (Initial Payment) | 300000 |

## 2. Line items

Enter each row through "Add Items to Order." **Qty** is in the product's Bulk Unit (Carton); **Bulk Cost** is the cost of one whole carton (i.e. cost per Card/Bottle × Units per Bulk from the products sheet), not the cost of a single card/tablet/bottle. The form derives per-unit cost from Units per Bulk automatically.

| # | Product (must match name typed exactly) | Bulk Unit | Qty (Cartons) | Bulk Cost (₦/Carton) | Subtotal (₦) |
|---|---|---|---:|---:|---:|
| 1 | Panadol Extra | Carton | 3 | 27,000 | 81,000 |
| 2 | Coartem | Carton | 2 | 44,000 | 88,000 |
| 3 | Augmentin 625mg | Carton | 4 | 78,000 | 312,000 |
| 4 | Zyrtec | Carton | 2 | 37,200 | 74,400 |
| 5 | Norvasc | Carton | 2 | 69,000 | 138,000 |
| 6 | Glucophage | Carton | 3 | 33,600 | 100,800 |
| 7 | Emzor Vitamin C | Carton | 2 | 11,000 | 22,000 |
| 8 | Benylin | Carton | 2 | 28,800 | 57,600 |
| 9 | Gaviscon | Carton | 1 | 40,800 | 40,800 |
| 10 | Dettol Antiseptic | Carton | 2 | 9,600 | 19,200 |

**Order Total: ₦933,800** (Amount Paid ₦300,000 above leaves ₦633,800 outstanding as a partial payment; adjust either number if you want a different split.)

Bulk Cost per carton was derived from a ~60-65% cost-to-selling markup at the per-card/per-bottle level × Units per Bulk from the products sheet. Realistic but made up, so adjust to your actual supplier pricing.

## 3. Receiving (Procurement → this PO → "Receive Goods")

Once the PO is created, open it and hit Receive Goods. This is a separate step per item with its own Batch/Lot No. and Expiry Date fields. Qty Received defaults to what was ordered, so only change it if the delivery was short. Dates below assume you're receiving on **Aug 1, 2026** (today), deliberately spread across urgent / close-to-expiry / healthy / long-dated so your Inventory expiry filters and dashboard alerts have something real to show. Your store's expiry warning threshold defaults to 90 days out.

| # | Product | Qty Received | Batch / Lot No. | Expiry Date | Status |
|---|---|---:|---|---|---|
| 1 | Panadol Extra | 3 | PNDX-2601 | 2026-09-15 | Close to expiry (~45 days) |
| 2 | Coartem | 2 | CRTM-2547 | 2028-03-01 | Healthy (~19 months) |
| 3 | Augmentin 625mg | 4 | AUGM-1198 | 2026-08-20 | Urgent (~19 days) |
| 4 | Zyrtec | 2 | ZYRT-3320 | 2027-11-10 | Healthy (~15 months) |
| 5 | Norvasc | 2 | NRVC-0876 | 2027-06-30 | Healthy (~11 months) |
| 6 | Glucophage | 3 | GLCP-4410 | 2026-10-05 | Close to expiry (~65 days) |
| 7 | Emzor Vitamin C | 2 | EMVC-7702 | 2028-01-15 | Healthy, long-dated (~17 months) |
| 8 | Benylin | 2 | BNLN-2219 | 2027-02-28 | Healthy (~7 months) |
| 9 | Gaviscon | 1 | GVSC-5563 | 2026-08-10 | Urgent (~9 days) |
| 10 | Dettol Antiseptic | 2 | DTTL-8801 | 2029-05-01 | Long-dated (~33 months, household item) |

That's 2 urgent (under 30 days, good for testing a critical-expiry alert/badge), 2 close-to-expiry (inside the 90-day warning window), and 6 healthy/long-dated, so you get all three states represented in Inventory at once. Batch numbers are made up, formatted like a real lot code. Swap for your supplier's actual batch numbers when you have real stock.
