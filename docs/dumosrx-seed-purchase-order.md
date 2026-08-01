# Seed Data — Purchase Order (depends on the 10 products in `dumosrx-seed-products.md`)

A Purchase Order needs a **Supplier** selected from a dropdown (it can't be typed inline) — add this one first via the "+" next to the supplier field, or Procurement → Vendors → Add.

## 0. Supplier to add first

| Field | Value |
|---|---|
| Supplier Name * | Fidson Distributors Ltd |
| Contact Person | Amaka Okafor |
| Email | orders@fidsondist.example.com |
| Phone | +234 803 555 0142 |
| Address | 14 Oshodi–Apapa Expressway, Lagos |
| Tax ID (TIN) | 2109-4477-0001 |
| Payment Terms (days) | 30 |
| Active | Yes |

## 1. Order header

| Field | Value |
|---|---|
| Select Vendor | Fidson Distributors Ltd (added above) |
| Internal Notes | Initial stock — Ref PO-0001 |
| Payment Status | Partial Payment |
| Due Date | 30 days from order date |
| Amount Paid (Initial Payment) | 300000 |

## 2. Line items

Enter each row through "Add Items to Order." **Qty** is in the product's Bulk Unit (Carton); **Bulk Cost** is the cost of one whole carton (i.e. cost per Card/Bottle × Units per Bulk from the products sheet), not the cost of a single card/tablet/bottle — the form derives per-unit cost from Units per Bulk automatically.

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

**Order Total: ₦933,800** (Amount Paid ₦300,000 above leaves ₦633,800 outstanding as a partial payment — adjust either number if you want a different split.)

Bulk Cost per carton was derived from a ~60–65% cost-to-selling markup at the per-card/per-bottle level × Units per Bulk from the products sheet — realistic but made up, adjust to your actual supplier pricing.
