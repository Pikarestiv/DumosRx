# Traction Snapshot

Point-in-time commercial facts used for the Techstars application, grant
applications and investor conversations. These are founder-reported plus one
production sales query; they are not derived from the codebase. Re-run the
query below and update the date when you reuse them.

**As of 2026-11-17.** First production sale was 2026-09-22 (Nest, which was still trying the app out); Divamax went live in October. Say "late September" externally.

## Customers

| Store | Segment | Status |
| :--- | :--- | :--- |
| Nest Pharmacy (Amawbia) + Enugu Agidi | Pharmacy | Free enterprise pilot until 2027-01-01. Switched from Moniepoint Moniebook and QuickBooks POS. 2 branch tills + 1 personal till. |
| Divamax Quincallerie (Cameroon) | Construction materials | Paid enterprise yearly plan, ₦150,000, active 2026-10-31 to 2027-10-31 (confirmed in the subscriptions table). Paid a deposit the day of the demo (mid-September), the balance when she flew back to Cameroon. Was on a custom-built offline POS before. Free trials ran from 2026-09-17 to 2026-10-31. Referred by Cynthia (Nest). 2 store tills + 1 personal till. |
| Cutis Aesthetics and Medspa | Medspa | One-month enterprise trial to 2026-12-12; ₦150,000 enterprise yearly plan already paid. Referred by Chisom (FC Digitals). 2 tills. Was only being approached by Moniebook, never a user. |
| Epik Footwears | Footwear retail | Free trial to 2027-01-01. |

Paying: 2 stores on enterprise yearly plans, ₦300,000 total. Normalised MRR is
₦300,000 / 12 = **₦25,000** (enterprise yearly is ₦150,000, i.e. ₦12,500/month
equivalent per store). No store is on a monthly plan yet.

## Pipeline (unconverted)

- Austin Judith Pharmacies (referred by Cynthia): starts after finishing a stock audit on QuickBooks 2013 POS.
- FC Digitals (Chisom): starts once his new branch opens; wants remote monitoring of sales staff to prevent fraud.
- Pharm Favour (referred by Ifeoma of Austin Judith): asking whether it serves a hospital and a pharmacy.
- Mmesoma (perfume store): interested mainly for the storefront.
- BetaCure Pharmacy (Princewell Obi): has test logins.

Most leads came by referral without pressure. Active cold-DM and ad marketing
begins after the app stabilised (November 2026).

## Storefront

Live for Nest, Cutis, Divamax and Epik Footwears. No orders placed through one
yet; stores reported being glad to have an online presence.

## Sales through the system (production)

All-time, completed, non-deleted: **2,728 sales, ₦20,634,027, first sale
2026-09-22.** The founder's own test store (Pikachuu Stores) has zero sales, so
the totals are clean. Per store: Nest Enugu Agidi 2,154, Nest Amawbia 388,
Divamax 223. Cutis (just launched, still entering selling prices) and Epik Footwears have
recorded none yet, so three stores are actively selling. VoreliQng is a
Dumostech cofounder's own store, not a customer, and has no sales.

| Month | Store | Sales | ₦ |
| :--- | :--- | ---: | ---: |
| 2026-11 (to 17th) | Divamax | 97 | 3,592,700 |
| 2026-11 | Nest A2 / Enugu Agidi | 1,049 | 2,705,808 |
| 2026-11 | Nest (Amawbia) | 235 | 1,046,864 |
| 2026-10 | Nest (Amawbia) | 121 | 5,224,762 |
| 2026-10 | Nest A2 / Enugu Agidi | 1,104 | 4,700,438 |
| 2026-10 | Divamax | 88 | 2,240,744 |
| 2026-09 | Nest (Amawbia) | 29 | 968,711 |
| 2026-09 | Divamax | 5 | 154,000 |

Query (read-only; keep `SET time_zone` in the same phpMyAdmin block, see
`.agents/AGENTS.md` §7):

```sql
SET time_zone = '+00:00';
SELECT st.name, DATE_FORMAT(s.transaction_date, '%Y-%m') AS month,
       COUNT(*) AS sales, ROUND(SUM(s.total_amount)) AS naira_value
FROM sales s JOIN stores st ON st.id = s.store_id
WHERE s.deleted_at IS NULL AND s.payment_status = 'completed'
GROUP BY st.name, month ORDER BY month DESC, naira_value DESC;
```

## Plan prices

Live prices are in `system_configs` (key `subscription_plans`), not in code.
`docs/GTM_STRATEGY.md` and `client/lib/constants/subscription-plans-catalog.ts`
carry only launch targets and fallbacks (the Starter price was cut from
₦5,000 to ₦3,000 for competitive pricing; the client fallback still shows
Enterprise at ₦20,000). Values read from prod on 2026-11-17, in ₦:

| Tier | Monthly | Yearly | Stores | Staff |
| :--- | ---: | ---: | ---: | ---: |
| Free | 0 | 0 | 1 | 1 |
| Starter | 3,000 | 30,000 | 1 | 3 |
| Pro | 8,000 | 80,000 | 3 | 10 |
| Enterprise | 15,000 | 150,000 | unlimited | unlimited |

Yearly is ten months' price on every paid tier. Enterprise adds multi-store,
e-commerce storefront, custom branding, data export and reseller commission.
Signup trial is 14 days on Pro, with a 3-day grace period.

Re-read the live value with:

```sql
SELECT value FROM system_configs WHERE `key` = 'subscription_plans';
```

## Competitors met in the field

Moniepoint Moniebook (strongest; Nest switched from it, and Cutis chose us while it was courting them),
cracked QuickBooks 2013 POS (offline only), VirtualRx, Shopkite, Orda, SwiftPOS.

## Market size

~25,000 pharmacies and patent medicine stores nationally (PSN figure cited in
a Moniepoint case study; mixes both). PCN registered Abuja premises: 1,084
(December 2024). No single clean national pharmacy-only count was found.
Patent medicine vendors are part of the addressable market.

## Founder and references

Okwudili Joshua Odumodu, sole founder of DumosRx. B.Eng Chemical Engineering,
Nnamdi Azikiwe University, 2008–2013; self-taught developer; 6+ years
building web applications; installed pharmacy software for pharmacies.
Co-founder and Frontend Lead of Dumostech since March 2018 (a software
consultancy with 20+ client platforms across Nigeria, the US, UK, Canada and
Estonia; a separate registered company; DumosRx is not incorporated and was
built solo). Previously Lead Frontend Engineer at Tublian (US AI platform) from
November 2022 to December 2024, as it grew from a few hundred to 13,000+ users.
Currently contracts part-time as an AI trainer and evaluator (Handshake AI,
Outlier, Mercor) since January 2026. References: Cynthia Adaeze (Nest, customer)
and Obinna Odumodu (software engineer, 15+ years).

## Techstars

Spring 2027 programs close 2026-11-18 per third-party listings (cutoff time not
confirmed on techstars.com).

## Origin dates

Building started 2025-08-16 (first commit); full-time on it from January 2026.
Divamax (Cameroon, referred by Cynthia) became the first paying customer on
2026-09-16, so the first customer is outside Nigeria. Cynthia's earlier
QuickBooks installation crashed and took her data, which is where the
data-loss pain point in the pitch comes from.

## Why stores switch (from the founder)

Main pain points: crashes and data loss (cloud sync fixes both), expiry and
low-stock tracking, remote monitoring of staff and branches, and online-only
systems that need a constant connection to reach their data.

Divamax closing story: Cynthia (Nest) called the founder to meet Divamax at
Nest Pharmacy, the app was demoed there, and Divamax paid a deposit the same
day and the rest when she returned to Cameroon.
