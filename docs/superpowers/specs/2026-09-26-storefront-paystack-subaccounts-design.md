# Storefront Online Payment via Paystack Subaccounts

**Date:** 2026-09-26
**Status:** Approved design, pending implementation plan

## Background

The storefront audit (`docs/STOREFRONT_REVIEW.md`, SF-P1-2) found that online
payment via Paystack is fully built and tested server-side but unreachable
from the storefront UI — `checkout-form.tsx` only ever offered `in_store` and
`transfer`. Wiring it up was deliberately deferred out of that fix round,
because turning it on raises a real business question this spec answers:
**whose money is it, and how does DumosRx get paid?**

`PaymentService` today uses one platform-wide Paystack secret key
(`config/payment.php`). If the existing storefront checkout flow were wired
up as-is, every customer payment would land in DumosRx's own Paystack account
with no ledger, no payout mechanism, and no way to get it to the store owner
— the exact custodial-money problem this spec avoids by design.

Two models were considered:
1. **Platform-collects-then-payouts** — DumosRx holds the money, tracks a
   balance per store, pays out periodically. Rejected: needs a real ledger,
   KYC, payout reconciliation, and much higher-stakes refund handling before
   it's safe to take real customer money — a much larger project than this
   one.
2. **Direct-to-store via Paystack subaccounts** (chosen) — each store gets
   its own Paystack subaccount; a checkout charge is split automatically at
   the point of payment, so the store's share settles straight to their own
   bank account and DumosRx never holds it.

Within option 2, the user was clear that store owners must not need to
already have, or personally set up, a Paystack account — "plug and play."
DumosRx therefore creates the subaccount programmatically from the owner's
bank details; the owner never sees Paystack directly.

**Geography is intentionally scoped to what Paystack itself can reach.**
Paystack supports Nigeria, Ghana, South Africa, Kenya, Rwanda, and Côte
d'Ivoire. It does **not** support Cameroon — there is a Cameroon prospect on
file (`memory/project_cynthia_referral_cameroon_client.md`), and no version
of this design makes Paystack work there; that market needs a different
provider entirely (Flutterwave does support Cameroon/XAF and has its own
split-payment/subaccount feature, but currently restricts Cameroonian
merchants from moving money out of their XAF balance — a separate
investigation, out of scope here). This spec's country list is exactly
Paystack's own supported list; a store outside it does not get the online
payment option, same as today.

## Existing patterns this builds on

- `PaymentService` (`app/Services/Payment/PaymentService.php`) is the house
  style for a provider-wrapping service: plain HTTP calls via
  `Illuminate\Support\Facades\Http`, no SDK, provider errors logged and never
  handed raw to an unauthenticated caller (`StorefrontController::
  initializeCheckout()`'s catch block already does this for the existing
  flow).
- `StorefrontController::initializeCheckout()`/`checkout()` already implement
  the "mint a reference, verify server-side against the provider, never trust
  a client-submitted amount" pattern this design extends, not replaces.
- `Store::boot()`'s dirty-flag hook (`storefront_dirty_at`) and
  `RebuildStorefrontIfDirty` are the exact shape for "stamp affected rows,
  process them on a schedule, retry on failure" — reused here verbatim for
  fee-rate propagation, since `laravel-server/AGENTS.md` documents there is
  no confirmed queue worker in production and this must not use `->queue()`.
- `AdminAlertService::send()` is the existing escalation path for "something
  is silently failing and a superadmin needs to know" — reused for repeated
  subaccount-fee-sync failures rather than inventing a second alerting path.
- `SystemConfig::getVal()`/`setVal()` (already used for `subscription_plans`)
  is the existing key-value store for an admin-editable setting with no
  dedicated column — used here for the platform fee percentage.
- Client-side store settings (`client/components/settings/store/`) is where
  `store_slug`, `online_store_enabled`, etc. are already configured — the new
  "Online Payments" panel lives there, not in `web/`.
- The "add a synced column on both sides" convention
  (`laravel-server/AGENTS.md`) governs every new `stores` column below.

## Goals

- A store owner can enable online payment on their storefront by entering
  their country, bank, and account number — nothing else, no Paystack
  account of their own.
- Money from a storefront sale settles directly to the store's bank account
  via Paystack's split; DumosRx takes a fixed percentage automatically at the
  point of payment.
- The platform fee is one global percentage, editable by a superadmin
  without a deploy, and a rate change propagates to every existing
  subaccount, not just new ones.
- Cancelling an already-paid online order actually refunds the customer via
  Paystack, not just a log line and a notification.
- The Paystack payment option only ever appears on a storefront whose store
  has a working subaccount; everything else about the existing `in_store`/
  `transfer` flow is unchanged.

## Non-goals

- No support for countries Paystack itself doesn't reach (Cameroon and any
  other market outside Paystack's six supported countries). No Flutterwave
  subaccount/split integration — a separate future project if/when a
  Paystack-unsupported market becomes real.
- No per-store negotiated fee rate. One global percentage for everyone (the
  user explicitly chose this over per-store rates).
- No change to `in_store`/`transfer` — those remain unmediated, uncounted
  toward any platform cut, exactly as today.
- No automatic bank-account ownership verification beyond what Paystack's own
  resolve-account API provides (Nigeria/Ghana only); other supported
  countries show an explicit "can't verify, double-check" notice rather than
  a fabricated check.
- No UI for the owner to edit their bank details after initial setup in this
  pass — changing banks is a "contact support" path for now, same tier of
  problem as today's slug-change cooldown, not solved here.

## Data model

New columns on `stores` (client `schema.ts` + `SYNC_COLUMN_MIGRATIONS`, and a
matching Laravel migration with the existing idempotent `Schema::hasColumn()`
guard):

| Column | Type | Notes |
|---|---|---|
| `paystack_subaccount_code` | TEXT/nullable | Set once the subaccount is created; presence gates whether Paystack is offered at checkout. |
| `paystack_subaccount_country` | TEXT/nullable | One of Paystack's six supported country codes. |
| `paystack_bank_code` | TEXT/nullable | Snapshot of what was submitted, for display ("Paystack — GTBank ****1234"). |
| `paystack_account_number_last4` | TEXT/nullable | Never the full number — display only. |
| `paystack_fee_dirty_at` | DATETIME/nullable | Mirrors `storefront_dirty_at`; stamped when the global fee rate changes, cleared once this store's subaccount has been updated to match. |

The full account number is **not stored** beyond what Paystack's create-call
needs in flight — only the masked last 4 for display, so a database leak
doesn't expose bank account numbers DumosRx has no ongoing need for.

`SystemConfig` key `storefront_platform_fee_percentage` (float, default
matching the agreed 2%) holds the one global rate.

## Services

New `App\Services\Payment\PaystackSubaccountService` (same house style as
`PaymentService` — plain `Http::withToken()`, no SDK):

- `listBanks(string $countryCode): array` — wraps Paystack's bank-list
  endpoint. Paystack's documented `country` values for this endpoint are
  `nigeria`, `ghana`, `kenya`, `south africa`; Rwanda and Côte d'Ivoire are
  not confirmed supported by this specific endpoint despite being supported
  countries overall. Returns `[]` rather than throwing on an unsupported/
  empty response, and the onboarding UI falls back to a plain bank-name text
  field (no dropdown, no resolve) for a country this returns nothing for —
  the same "can't verify automatically, say so" principle as
  `resolveAccount()` below, extended to the bank list itself.
- `resolveAccount(string $accountNumber, string $bankCode, string $countryCode): ?array`
  — returns the resolved account name where Paystack supports it for that
  country (Nigeria, Ghana today); returns `null` (not a fabricated guess)
  everywhere else, and the caller must render that as "unverified" rather
  than silently skipping the notice.
- `createSubaccount(Store $store, array $bankDetails, float $percentageCharge): string`
  — calls `POST /subaccount`, returns the subaccount code. Business name is
  the store's own name; `percentage_charge` is the current
  `storefront_platform_fee_percentage` at creation time.
- `updateSubaccountFee(string $subaccountCode, float $percentageCharge): void`
  — calls Paystack's update-subaccount endpoint; used by the fee-propagation
  job below.
- `refundTransaction(string $reference, ?float $amount = null): array` — wraps
  Paystack's refund API; `PaymentService` gains a thin
  `refundTransaction()` delegating to this for the provider-agnostic call
  site in `OnlineOrderController`, matching how `verifyTransaction()` already
  dispatches by provider.

`PaymentService::initializeTransaction()` (and `initializePaystack()`) gain
an optional `?string $subaccount` parameter, added to the Paystack request
body only when non-null. Nothing about `Flutterwave` or the subscription
flow's call sites changes — they simply never pass it.

## Onboarding flow

1. New endpoint(s) under `Api/Web` (store-owner authenticated, same tier as
   the rest of store settings): `GET /store/payment-banks?country=`, `POST
   /store/payment-account/resolve`, `POST /store/payment-account`.
2. New "Online Payments" panel in `client/components/settings/store/`: a
   country select (Paystack's six supported countries only), a bank select
   populated from `listBanks()`, an account-number field.
3. On submit, the backend calls `resolveAccount()`. If it returns a name,
   the UI shows it for the owner to confirm ("Pay to: JANE M DOE — is this
   right?") before the final save. If it returns `null` (country not
   supported for resolution), the UI shows the explicit "we can't verify
   this automatically" notice and requires an extra confirmation checkbox
   before proceeding — never a silent skip.
4. On confirm, the backend calls `createSubaccount()` with the current
   platform fee rate, stores the returned code + masked details on `stores`.
5. Failure at any step (bad account number, Paystack API error) is shown
   inline in the form; nothing is written to `stores` until the subaccount
   is actually created.

## Checkout flow changes

- `StorefrontController::show()`'s response gains a boolean (e.g.
  `online_payment_available`) reflecting whether `paystack_subaccount_code`
  is set — the storefront UI uses this to decide whether to render the
  Paystack radio at all, rather than inferring it from `online_store_enabled`
  alone.
- `initializeCheckout()` passes `$store->paystack_subaccount_code` into
  `PaymentService::initializeTransaction()`. If the code is missing (should
  be unreachable given the gate above, but defensively checked), the endpoint
  returns the same "cannot be paid for online" 422 it already returns for a
  zero-amount cart, not a 500.
- `checkout-form.tsx` gets its third radio (`paystack`), the
  `/checkout/initialize` call, the redirect to `payment_url`, and reading
  `?reference=`/`?trxref=` on return — the client-side half of SF-P1-2 that
  was deliberately left undone in the audit fix round. This is now safe to
  build because the money question this spec exists to answer is answered.

## Fee-rate propagation

1. Superadmin edits the rate in `web/app/admin/settings`. The admin
   controller action that handles the save does two things in one request,
   in order: `SystemConfig::setVal('storefront_platform_fee_percentage', ...)`,
   then `DB::table('stores')->whereNotNull('paystack_subaccount_code')->update(['paystack_fee_dirty_at' => now()])`.
   `SystemConfig` has no per-row model events to hook, so this lives directly
   in the controller action rather than behind indirection that would only
   ever have one caller.
2. New scheduled command `SyncSubaccountFeeRates` (registered in
   `routes/console.php` alongside `RebuildStorefrontIfDirty`, same cadence):
   for each dirty store, calls `updateSubaccountFee()`; clears the flag on
   success, leaves it dirty on failure (retried next run).
3. After `SYNC_FAILURE_REPORT_THRESHOLD`-equivalent consecutive failures for
   one store, fires `AdminAlertService::send()` — the same escalation path
   already used for sync failures, not a new one.

## Refunds

`OnlineOrderController::flagRefundRequired()` (added in the storefront fix
round as a log-and-notify stub, explicitly documented as a placeholder for
this exact spec) is replaced with a real call: `PaymentService::
refundTransaction($order->paystack_reference)`. On success, the notification
becomes "Refunded" rather than "Refund required"; on failure, the existing
log-and-notify behavior is kept as the fallback so a provider-side refund
failure is never silent.

**Cost of a refund on an already-settled order:** Paystack's own refund
behavior on a split transaction is to draw the refund from DumosRx's main
balance once the subaccount side has already settled (typically within a
day or two of the sale) — it is not automatically clawed back from the
store. Confirmed with the user this is an accepted v1 cost of running the
platform rather than something to build a claw-back transfer for now; no
Transfer/Transfer-Recipient integration is in scope for this pass. Revisit
if refund volume ever makes this worth automating.

## Error handling

- Every new Paystack call site follows `PaymentService`'s existing
  convention: catch, log the raw provider response server-side only, return
  a generic message to any caller that isn't already authenticated as the
  store owner.
- A subaccount that Paystack deactivates independently (e.g. failed
  settlement, compliance hold) is not detectable proactively without polling
  Paystack — `initializeCheckout()`'s existing try/catch around
  `initializeTransaction()` already surfaces a provider failure as "unable
  to start checkout," which is sufficient; no new polling is added in this
  pass.
- `resolveAccount()` returning `null` for an unsupported country is a normal
  outcome, not an error — never logged as a failure.

## Testing

- `PaystackSubaccountService`: `Http::fake()` tests for
  `createSubaccount`/`resolveAccount`/`updateSubaccountFee`/
  `refundTransaction`, covering both success and Paystack error responses,
  following the existing `PaymentService`/webhook test conventions.
- `StorefrontController`: a store with no subaccount never returns
  `online_payment_available: true` and `initializeCheckout` still rejects
  `payment_method: paystack` for it; a store with one does, and the subaccount
  code is asserted in the outgoing `Http::fake()` request body.
- `SyncSubaccountFeeRates`: a store with a stale rate gets updated and its
  flag cleared; a Paystack failure leaves the flag set and does not affect
  other stores in the same run; N consecutive failures fires the alert.
- `OnlineOrderController::flagRefundRequired` replacement: a cancelled+paid
  order calls the refund endpoint with the right reference/amount; a provider
  failure falls back to the log-and-notify path, verified by asserting the
  notification's copy differs between the two outcomes.
- Client: the new settings panel's happy path and the "can't verify"
  fallback path (mocked resolve response), plus `checkout-form.tsx`'s new
  Paystack radio and return-URL parameter handling, following the existing
  `use-fulfill-online-order-mutation.test.ts`-style "real logic, only the
  network mocked" approach.
