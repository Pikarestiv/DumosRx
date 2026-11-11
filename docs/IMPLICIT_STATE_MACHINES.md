# Implicit State Machines in DumosRx: Architecture & Bug Verification Guide

## 1. Executive Overview

In large offline-first applications like DumosRx, domain workflows are rarely implemented using formal Finite State Machine (FSM) libraries. Instead, entity lifecycles are governed by **implicit state machines**—combinations of multi-column status flags, timestamps, nullable foreign keys, and conditional code branching distributed across React/Zustand client hooks, SQLite tables, sync serialization layers, and Laravel API services.

When business requirements evolve or corner cases arise (e.g. offline till partitions, concurrent checkouts, spot sourcing, partial returns, or background auto-heals), subtle state desynchronizations occur.

This guide catalogs the **12 core implicit state machines** governing DumosRx, their valid transitions, their latent edge-case traps, and diagnostic tools to verify system integrity.

---

## 2. Master State Machine Index

| # | State Machine Domain | Key Entities & Tables | Core Governing Fields & Flags | Detailed Specification |
|---|----------------------|-----------------------|-------------------------------|------------------------|
| **01** | **POS Cart & Sale Transactions** | In-Memory Cart, `held_transactions`, `sales`, `sale_items`, `returns`, `expenses` | `processingPaymentRef`, `dispensedRxId`, `cart[].is_spot_sourced`, `sales.payment_status` | [01-pos-cart-and-sales.md](file:///Users/admin/Documents/Projects/DumosRx/docs/state-machines/01-pos-cart-and-sales.md) |
| **02** | **Inventory Batches & Auto-Heal** | `stock_batches`, `stock_movements`, `_pending_stock_deltas` | `stock_batches.quantity`, `movement_type`, `BatchVerdict`, `carveOut` (A-148) | [02-inventory-stock-and-autoheal.md](file:///Users/admin/Documents/Projects/DumosRx/docs/state-machines/02-inventory-stock-and-autoheal.md) |
| **03** | **Offline Sync Engine & Queue** | `_sync_queue`, `_sync_state`, `_sync_conflicts`, `_pending_command_results` | `status`, `action`, `attempts`, `_synced`, `_version`, `_deleted`, `server_cursor` | [03-offline-sync-engine.md](file:///Users/admin/Documents/Projects/DumosRx/docs/state-machines/03-offline-sync-engine.md) |
| **04** | **Purchase Orders & Receiving** | `purchase_orders`, `purchase_order_items`, `stock_batches`, `supplier_payments` | `status`, `type` (`standard` vs `immediate`), `quantity_received`, `reprice`, `payment_status` | [04-purchase-orders-and-receiving.md](file:///Users/admin/Documents/Projects/DumosRx/docs/state-machines/04-purchase-orders-and-receiving.md) |
| **05** | **Prescriptions & Refills** | `prescriptions`, `prescription_items`, `sales` | `status`, `dispensed_at`, `refills_authorized`, `refills_used`, `next_refill_date` | [05-prescriptions-and-refills.md](file:///Users/admin/Documents/Projects/DumosRx/docs/state-machines/05-prescriptions-and-refills.md) |
| **06** | **Device Linking & Till Inspection** | `user_devices`, `personal_access_tokens`, `admin_till_codes`, `admin_till_sessions` | `device_id`, `till_relink:<hash>`, `dumos_till_inspection`, `assertWritable()`, `end_reason` | [06-device-linking-and-till-sessions.md](file:///Users/admin/Documents/Projects/DumosRx/docs/state-machines/06-device-linking-and-till-sessions.md) |
| **07** | **Stock Audits & Distributed Leases** | `audit_sessions`, `audit_session_items`, `stock_audits`, `stock_audit_drafts` | `status`, `active_till_id`, `lease_version`, `lease_expires_at`, `submitted_stock_audit_id` | [07-stock-audit-and-distributed-leases.md](file:///Users/admin/Documents/Projects/DumosRx/docs/state-machines/07-stock-audit-and-distributed-leases.md) |
| **08** | **Reseller Commissions & Markups** | `sales`, `held_transactions`, `returns` | `is_reseller_sale`, `markup_type`, `reseller_commission_redeemed`, `reseller_commission_owed_back` | [08-reseller-commissions-and-payouts.md](file:///Users/admin/Documents/Projects/DumosRx/docs/state-machines/08-reseller-commissions-and-payouts.md) |
| **09** | **Customer Credit & Debt Balances** | `customers`, `sales`, `customer_payments`, `returns` | `outstanding_balance`, `credit_limit`, `payment_method = 'credit'`, `customer_payments.amount` | [09-customer-credit-and-debt.md](file:///Users/admin/Documents/Projects/DumosRx/docs/state-machines/09-customer-credit-and-debt.md) |
| **10** | **Store Licensing & Fleet Status** | `stores`, `subscriptions`, `LicenseGuard` | `stores.status`, `stores.deleted_at`, `subscriptions.status`, `license_token`, `CLOCK_TAMPERED` | [10-store-licensing-and-fleet.md](file:///Users/admin/Documents/Projects/DumosRx/docs/state-machines/10-store-licensing-and-fleet.md) |
| **11** | **Staff Accounts & Tombstones** | `users`, `permission_groups`, `SyncOwnershipResolver` | `is_active`, `_deleted`, `username_del_<ts>`, `email_del_<ts>`, `withTrashed()` | [11-staff-accounts-and-tombstones.md](file:///Users/admin/Documents/Projects/DumosRx/docs/state-machines/11-staff-accounts-and-tombstones.md) |
| **12** | **Storefront Orders & Intents** | `storefront_payment_intents`, `online_orders`, `online_order_items` | `reference`, `status` (`pending`, `paid`, `consumed`), `items` JSON snapshot, `order_status` | [12-storefront-orders-and-intents.md](file:///Users/admin/Documents/Projects/DumosRx/docs/state-machines/12-storefront-orders-and-intents.md) |

---

## 3. Five Recurrent Edge-Case Traps & Antipatterns

### Trap A: Ledger-vs-Cache Divergence
- **Manifestation**: `stock_batches.quantity` drifting from `SUM(stock_movements)`, or `customers.outstanding_balance` drifting from `SUM(sales) - SUM(payments)`.
- **Root Cause**: Maintaining running totals via incremental updates (`quantity = quantity - delta`) without a mathematically sound replay engine or ignoring out-of-order sync deltas.
- **Remediation**: Always treat the transaction ledger as source of truth. Batches use `onHandFromLog()` with single-floor rule and A-148 carve-outs.

### Trap B: Asymmetrical Timezone & Clock Skew
- **Manifestation**: Sync pull permanently skips newly modified rows; anti-tampering guards trigger unexpectedly.
- **Root Cause**: MySQL running on local EDT clock (`time_zone = SYSTEM`) while Laravel writes UTC (`+00:00`), causing direct SQL updates using `NOW()` to land 4 hours in the past relative to the sync watermark.
- **Remediation**: Never use raw SQL `NOW()` in migrations or manual DB fixes; enforce PDO UTC init command (Rule 7).

### Trap C: Double-Dipping on Returns
- **Manifestation**: Restoring stock to physical batches during returns restores more units than were originally sold, or refunding a credit sale pays out cash drawer money.
- **Root Cause**: Failing to query historical restoration progress across prior partial returns (`getAlreadyRestoredByBatch()`).
- **Remediation**: Inspect `sale_item_batches` FEFO allocations and ensure credit returns reduce debt rather than disbursing cash.

### Trap D: Tombstone Resurrections
- **Manifestation**: Deleted staff members reappearing or overwriting active users with the same username after syncing.
- **Root Cause**: Blindly stripping `_deleted = 1` or unique constraint collisions during restoration.
- **Remediation**: Append microsecond deletion timestamps (`_del_<ts>`) upon deletion; perform active roster collision checks before stripping suffixes.

### Trap E: Concurrency & Lease Clashing
- **Manifestation**: Two cashiers clobbering each other's physical cycle counts or double-checking out an identical cart.
- **Root Cause**: Lack of optimistic concurrency control or distributed locking on shared sessions.
- **Remediation**: Distributed monotonic leases (`lease_version`, `lease_expires_at` in audit sessions) and UI nonce locking (`processingPaymentRef`).

---

## 4. Verification & Testing Strategy

1. **Unit & Math Testing**:
   - Run tests covering calculation edge cases (e.g. `money-write-rounding-convention.test.ts`, `pos-spot-sourcing.test.ts`).
2. **Schema & Contract Parity**:
   - Run `npm run test:schema` in `client/` to verify parity between SQLite and MySQL migrations.
3. **Sync Simulation**:
   - Run offline partition tests: mutate on two disconnected client instances, reconnect, verify conflict resolution and queue settling.
4. **Read-Only Inspection Assertion**:
   - Verify that enabling `dumos_till_inspection` reliably causes `assertWritable()` to abort any write operation before touching SQLite.

