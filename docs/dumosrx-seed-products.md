# Seed Data — 10 Products for "Add New Product"

Columns match the Add Product form exactly, in the order the fields appear (Basic Info → Additional Details → Packaging & Units). Only **Name** is hard-required by the form; Selling Price and Reorder Level are soft-required (it'll warn but let you continue without them). Everything else is optional.

**Note on NAFDAC Reg. Numbers:** these are illustrative placeholders (format only), not real registered numbers — swap in your actual NAFDAC numbers if you have them, or leave blank.

**Note on Base Unit:** the app only supports one Bulk→Base conversion per product (no third "card" tier), so you have to pick a single selling/stock unit per product — it can't be sold by both the card and the loose tablet at once. Tablet/caplet meds below use **Card** as the base unit (how they're actually sold over the counter); Emzor Vitamin C uses **Tablet** since you said it's sold by counting loose from the jar. If any of these are actually sold loose in your store, swap Base Unit to Tablet and set Units per Bulk to the total tablet count per carton instead.

| # | Name | Category | Strength | Dosage Form | Selling Price (₦) | Reorder Level | Barcode | Generic Name | Manufacturer | NAFDAC Reg. No. | Requires Rx | Controlled | Bulk Unit | Units per Bulk | Base Unit |
|---|------|----------|----------|-------------|--------------------:|---------------:|---------|---------------|--------------|------------------|:---:|:---:|-----------|---------------:|-----------|
| 1 | Panadol Extra | Analgesics | 500mg/65mg | Caplet | 450 | 20 | — | Paracetamol + Caffeine | GSK | 04-1122 | No | No | Carton | 100 | Card (10 tabs) |
| 2 | Coartem | Antimalarials | 20mg/120mg | Tablet | 900 | 15 | — | Artemether + Lumefantrine | Novartis | 04-2233 | No | No | Carton | 80 | Card (6 tabs) |
| 3 | Augmentin 625mg | Antibiotics | 625mg | Tablet | 2000 | 15 | — | Amoxicillin + Clavulanate Potassium | GSK | 04-3344 | Yes | No | Carton | 60 | Card (6 tabs) |
| 4 | Zyrtec | Antihistamines | 10mg | Tablet | 1000 | 15 | — | Cetirizine | GSK | 04-4455 | No | No | Carton | 60 | Card (10 tabs) |
| 5 | Norvasc | Antihypertensives | 5mg | Tablet | 1800 | 15 | — | Amlodipine | Pfizer | 04-5566 | Yes | No | Carton | 60 | Card (10 tabs) |
| 6 | Glucophage | Antidiabetics | 500mg | Tablet | 900 | 15 | — | Metformin | Merck | 04-6677 | Yes | No | Carton | 60 | Card (10 tabs) |
| 7 | Emzor Vitamin C | Vitamins & Supplements | 100mg | Tablet | 20 | 150 | — | Ascorbic Acid | Emzor Pharmaceuticals | 04-7788 | No | No | Carton | 1000 | Tablet |
| 8 | Benylin | Cough & Cold | 100ml | Syrup | 1800 | 20 | — | Dextromethorphan | Kenvue (Johnson & Johnson) | 04-8899 | No | No | Carton | 24 | Bottle |
| 9 | Gaviscon | Antacids | 200ml | Suspension | 2500 | 20 | — | Alginic Acid + Sodium Bicarbonate | Reckitt Benckiser | 04-9900 | No | No | Carton | 24 | Bottle |
| 10 | Dettol Antiseptic | Antiseptics | 250ml | Liquid | 1200 | 25 | — | — | Reckitt Benckiser | 04-1011 | No | No | Carton | 12 | Bottle |

The "Card (N tabs)" note is just for your reference while entering data — in the actual Base Unit field, type just `Card` (the app doesn't store the tablet count anywhere, so if that detail matters to you, put it in the product name or notes instead).

Categories are spread across 10 distinct therapeutic classes (Analgesics, Antimalarials, Antibiotics, Antihistamines, Antihypertensives, Antidiabetics, Vitamins & Supplements, Cough & Cold, Antacids, Antiseptics) so you get a realistic mix in Inventory filters/reports.

Reminder: this form does **not** capture cost price or opening stock — that comes in through the Purchase Order (see the companion file), which is what actually creates a stock batch.
