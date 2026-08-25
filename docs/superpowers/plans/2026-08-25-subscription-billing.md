# Subscription & Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new Settings > Billing tab in `client/` (plan display, change-plan flow, billing history, coupons, referral program) and retarget the 4 existing subscription/license alert components to point at it internally, replacing `web/`'s billing dashboard and the app's current inconsistent mix of external links and one dead route.

**Architecture:** Online-only, direct API calls — no local SQLite persistence, no sync-engine involvement (a plan change or payment cannot happen offline). New components are built leaf-first (API layer → hooks → small standalone pieces → orchestrating components) so each task's build/commit checkpoint succeeds independently; the tab shell that composes everything is deliberately the second-to-last task, after all its children exist.

**Tech Stack:** Next.js 14 (App Router, static export) + React, `client/`'s existing fetch-based `ApiClient`/`BaseApiClient`, TanStack Query (`client/lib/query-keys.ts`'s `resource(key, tables)` factory, `tables: []` for remote-only data), Vitest for API-client and pure-logic unit tests, shadcn/ui components matching existing Settings conventions.

**Spec:** `docs/superpowers/specs/2026-08-25-dashboard-feature-migration-design.md`, Section C.

## Global Constraints

- All new API methods are direct, `apiClient`-based calls (client/'s existing fetch-based `BaseApiClient.request<T>()`), no local SQLite writes, no sync-engine involvement — matches the spec's "online-only for Billing" decision.
- Response types are copied from `web/lib/types/dashboard.ts` (`SubscriptionStatus`, `BillingTransaction`, etc.) since both apps hit the same Laravel endpoints — redefined locally in `client/lib/types/subscription-plans.ts`, not imported cross-app (no shared package, per the standing Phase-1 decision).
- The new Settings > Billing tab is admin-only (`isAdmin &&`), matching the existing `staff`/`system`/`data` tabs' convention in `settings-tab-nav.tsx`.
- No component in this plan may `window.open`/`<a target="_blank">` to `WEB_APP_URL` for anything billing-related after Task 9 lands — that's the whole point of the retarget.
- Referral program is in scope (confirmed); cloud email/password dual-auth for staff is a *different* plan's concern entirely, not touched here.

---

### Task 1: Billing API client methods + types

**Files:**
- Modify: `client/lib/types/subscription-plans.ts` (add response types)
- Modify: `client/lib/api/client.ts` (add 6 methods to `ApiClient`, near `getStores`)
- Test: `client/__tests__/billing-client.test.ts`

**Interfaces:**
- Consumes: `BaseApiClient.request<T>()` (existing, `client/lib/api/base-client.ts:54-58`).
- Produces: `apiClient.getSubscriptionStatus(): Promise<SubscriptionStatus>`, `apiClient.pay(payload: PaymentPayload): Promise<PaymentResponse>`, `apiClient.getReferralStats(): Promise<ReferralStats>`, `apiClient.validateCoupon(payload: { code: string; plan_name?: string; interval?: string }): Promise<CouponValidationResponse>`, `apiClient.verifyPayment(reference: string): Promise<{ success: boolean; message?: string }>`, `apiClient.getBillingHistory(): Promise<{ transactions: BillingTransaction[] }>`.

- [ ] **Step 1: Add the response types**

Append to `client/lib/types/subscription-plans.ts`:

```ts
export interface SubscriptionStatus {
  status: "active" | "inactive" | string;
  plan?: string;
  days_remaining?: number;
  is_trial?: boolean;
  expires_at?: string;
  limits?: { sync_interval?: number; staff?: number };
  features?: { auto_backup?: boolean };
}

export interface AppliedCoupon {
  code: string;
  type: string;
  value: number;
  target_plan: string | null;
  target_interval: string | null;
}

export interface PaymentPayload {
  amount: number;
  plan_name: string;
  coupon_code?: string;
  interval?: "monthly" | "yearly";
  use_credits?: boolean;
}

export interface PaymentResponse {
  success: boolean;
  message?: string;
  payment_url?: string;
}

export interface CouponValidationResponse {
  valid: boolean;
  message?: string;
  coupon: AppliedCoupon;
}

export interface ReferredUser {
  id: string;
  name: string;
  store_name: string;
  created_at: string;
  status: "active" | "pending";
}

export interface CreditTransaction {
  id: string;
  type: "earned" | "spent" | "admin_adjustment";
  amount: string;
  description: string;
  created_at: string;
}

export interface ReferralStats {
  referral_code?: string;
  referral_credits?: number;
  referrals: ReferredUser[];
  transactions: CreditTransaction[];
}

export interface BillingTransaction {
  id: string;
  date: string;
  desc: string;
  amount: string | number;
  status: "Success" | "Pending" | "Failed" | string;
  receipt_url?: string;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../lib/api/client';

describe('billing API methods', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('getSubscriptionStatus fetches /subscription/status', async () => {
    const payload = { status: 'active', plan: 'Pro', days_remaining: 12 };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.getSubscriptionStatus();

    expect(result).toEqual(payload);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/subscription/status');
  });

  it('pay posts to /subscription/pay with the payment payload', async () => {
    const response = { success: true, payment_url: 'https://pay.example/x' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => response,
    });

    const result = await apiClient.pay({
      amount: 8000,
      plan_name: 'Pro',
      interval: 'monthly',
    });

    expect(result).toEqual(response);
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/subscription/pay');
    expect(JSON.parse(config.body)).toEqual({
      amount: 8000,
      plan_name: 'Pro',
      interval: 'monthly',
    });
  });

  it('getReferralStats fetches /subscription/referral-stats', async () => {
    const payload = { referral_code: 'ABC123', referral_credits: 500, referrals: [], transactions: [] };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.getReferralStats();

    expect(result).toEqual(payload);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/subscription/referral-stats');
  });

  it('validateCoupon posts to /subscription/validate-coupon', async () => {
    const payload = { valid: true, coupon: { code: 'SAVE10', type: 'discount_percent', value: 10, target_plan: null, target_interval: null } };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.validateCoupon({ code: 'SAVE10' });

    expect(result).toEqual(payload);
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/subscription/validate-coupon');
    expect(JSON.parse(config.body)).toEqual({ code: 'SAVE10' });
  });

  it('verifyPayment posts the reference to /subscription/verify', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const result = await apiClient.verifyPayment('ref-123');

    expect(result).toEqual({ success: true });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/subscription/verify');
    expect(JSON.parse(config.body)).toEqual({ reference: 'ref-123' });
  });

  it('getBillingHistory fetches /subscription/billing-history', async () => {
    const payload = { transactions: [{ id: '1', date: '2026-01-01', desc: 'Pro Plan', amount: 8000, status: 'Success' }] };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.getBillingHistory();

    expect(result).toEqual(payload);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/subscription/billing-history');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd client && npx vitest run __tests__/billing-client.test.ts`
Expected: FAIL — `apiClient.getSubscriptionStatus is not a function` (and similarly for the other 5).

- [ ] **Step 4: Implement the methods**

In `client/lib/api/client.ts`, add near `getStores`/`checkStoreSlug` (after line 320), first the import:

```ts
import type {
  SubscriptionStatus,
  PaymentPayload,
  PaymentResponse,
  ReferralStats,
  CouponValidationResponse,
  BillingTransaction,
} from "@/lib/types/subscription-plans";
```

Then the methods:

```ts
  // Subscription & Billing
  async getSubscriptionStatus() {
    return this.request<SubscriptionStatus>("/subscription/status");
  }

  async pay(payload: PaymentPayload) {
    return this.request<PaymentResponse>("/subscription/pay", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getReferralStats() {
    return this.request<ReferralStats>("/subscription/referral-stats");
  }

  async validateCoupon(payload: { code: string; plan_name?: string; interval?: string }) {
    return this.request<CouponValidationResponse>("/subscription/validate-coupon", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async verifyPayment(reference: string) {
    return this.request<{ success: boolean; message?: string }>("/subscription/verify", {
      method: "POST",
      body: JSON.stringify({ reference }),
    });
  }

  async getBillingHistory() {
    return this.request<{ transactions: BillingTransaction[] }>("/subscription/billing-history");
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd client && npx vitest run __tests__/billing-client.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 6: Commit**

```bash
git add client/lib/types/subscription-plans.ts client/lib/api/client.ts client/__tests__/billing-client.test.ts
git commit -m "feat(client): add subscription/billing API client methods"
```

---

### Task 2: Billing query hooks

**Files:**
- Modify: `client/lib/query-keys.ts` (add `billing` entry)
- Create: `client/lib/hooks/use-billing.ts`

**Interfaces:**
- Consumes: `apiClient.getSubscriptionStatus/getReferralStats/getBillingHistory/pay/validateCoupon/verifyPayment` (Task 1), `queryKeys` factory (`client/lib/query-keys.ts`, the `resource(queryKey, tables)` helper — `tables: []` for remote-only data, following the existing `broadcasts` entry pattern).
- Produces: `useSubscriptionStatus()`, `useReferralStats()`, `useBillingHistory()` (queries), `usePayMutation()`, `useValidateCouponMutation()`, `useVerifyPaymentMutation()` (mutations).

- [ ] **Step 1: Add the query-key entry**

In `client/lib/query-keys.ts`, add before the closing `} as const;` (after `activityLog`):

```ts
  billing: {
    // Remote API data, not a local table.
    status: () => resource(["billing", "status"] as const, []),
    history: () => resource(["billing", "history"] as const, []),
    referrals: () => resource(["billing", "referrals"] as const, []),
  },
```

- [ ] **Step 2: Create the hooks file**

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api/client";
import type { PaymentPayload } from "@/lib/types/subscription-plans";

export function useSubscriptionStatus() {
  return useQuery({
    ...queryKeys.billing.status(),
    queryFn: () => apiClient.getSubscriptionStatus(),
  });
}

export function useReferralStats() {
  return useQuery({
    ...queryKeys.billing.referrals(),
    queryFn: () => apiClient.getReferralStats(),
  });
}

export function useBillingHistory() {
  return useQuery({
    ...queryKeys.billing.history(),
    queryFn: () => apiClient.getBillingHistory(),
  });
}

export function usePayMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PaymentPayload) => apiClient.pay(payload),
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.billing.status());
      queryClient.invalidateQueries(queryKeys.billing.history());
    },
  });
}

export function useValidateCouponMutation() {
  return useMutation({
    mutationFn: (payload: { code: string; plan_name?: string; interval?: string }) =>
      apiClient.validateCoupon(payload),
  });
}

export function useVerifyPaymentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reference: string) => apiClient.verifyPayment(reference),
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.billing.status());
    },
  });
}
```

- [ ] **Step 3: Verify the app still builds**

Run: `cd client && npm run build`
Expected: succeeds (pure addition, no consumers yet).

- [ ] **Step 4: Commit**

```bash
git add client/lib/query-keys.ts client/lib/hooks/use-billing.ts
git commit -m "feat(client): add billing/subscription query hooks"
```

---

### Task 3: Plan-catalog helper with pricing

**Files:**
- Modify: `client/lib/types/subscription-plans.ts` (widen `SubscriptionPlanTier`)
- Create: `client/lib/constants/subscription-plans-catalog.ts`
- Test: `client/__tests__/subscription-plans-catalog.test.ts`

**Interfaces:**
- Consumes: `useSystemConfigStore` (existing, `client/lib/store/system-config-store.ts`) for the raw `subscriptionPlans` config blob (already fetched/cached by `client/components/system-config-loader.tsx`).
- Produces: `getSubscriptionPlans(config: SubscriptionPlansConfig | null, isYearly: boolean, formatPrice: (price: number) => string): SubscriptionPlanCatalogEntry[]`, used by Task 5.

The existing `SubscriptionPlanTier` interface has `features`/`limits` but no pricing fields — `useFeatureGate()` never needed prices, only gating booleans. Billing does need them.

- [ ] **Step 1: Widen the tier type**

In `client/lib/types/subscription-plans.ts`, replace the `SubscriptionPlanTier` interface:

```ts
export interface SubscriptionPlanTier {
  name?: string;
  features?: Record<string, boolean | undefined>;
  limits?: Record<string, number | undefined>;
  price_monthly?: number;
  price_yearly?: number;
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { getSubscriptionPlans } from '../lib/constants/subscription-plans-catalog';

describe('getSubscriptionPlans', () => {
  const formatPrice = (price: number) => `₦${price.toLocaleString()}`;

  it('falls back to default prices when config is null', () => {
    const plans = getSubscriptionPlans(null, false, formatPrice);
    const pro = plans.find((p) => p.id === 'pro');
    expect(pro?.numericPrice).toBe(8000);
    expect(pro?.popular).toBe(true);
  });

  it('uses configured monthly price when present', () => {
    const config = { tiers: { pro: { price_monthly: 9500, price_yearly: 95000 } } };
    const plans = getSubscriptionPlans(config, false, formatPrice);
    const pro = plans.find((p) => p.id === 'pro');
    expect(pro?.numericPrice).toBe(9500);
    expect(pro?.price).toBe('₦9,500');
  });

  it('marks a limit of -1 as Unlimited', () => {
    const config = { tiers: { enterprise: { limits: { stores: -1 } } } };
    const plans = getSubscriptionPlans(config, false, formatPrice);
    const enterprise = plans.find((p) => p.id === 'enterprise');
    expect(enterprise?.features).toContain('Unlimited Connected Devices');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/subscription-plans-catalog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Create the plan-catalog helper**

```ts
import type { SubscriptionPlansConfig } from "@/lib/types/subscription-plans";

export interface SubscriptionPlanCatalogEntry {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  numericPrice: number;
  popular: boolean;
}

export function getSubscriptionPlans(
  config: SubscriptionPlansConfig | null,
  isYearly: boolean,
  formatPrice: (price: number) => string,
): SubscriptionPlanCatalogEntry[] {
  const tiers = config?.tiers ?? {};

  const priceFor = (tierKey: string) => {
    const tier = tiers[tierKey];
    const price = isYearly ? tier?.price_yearly : tier?.price_monthly;
    return price ?? 0;
  };

  const limitLabel = (tierKey: string, limitKey: string, singular: string, fallback: number) => {
    const value = tiers[tierKey]?.limits?.[limitKey];
    if (value === -1) return `Unlimited ${singular}`;
    return `Up to ${value ?? fallback} ${singular}`;
  };

  return [
    {
      id: "free",
      name: "Free",
      price: "₦0",
      period: "/ month",
      description: "Standalone retail / POS for single devices.",
      features: [
        limitLabel("free", "stores", "Connected Devices", 1),
        limitLabel("free", "staff", "Staff Account", 1),
        "Local Database Only",
      ],
      numericPrice: 0,
      popular: false,
    },
    {
      id: "starter",
      name: "Starter",
      price: priceFor("starter") === 0 ? "₦3,000" : formatPrice(priceFor("starter")),
      period: isYearly ? "/ year" : "/ month",
      description: "Cloud-connected for growing single stores.",
      features: [
        limitLabel("starter", "stores", "Connected Devices", 1),
        limitLabel("starter", "staff", "Staff Accounts", 3),
        "Cloud Sync (Every 6 Hours)",
        "Prescriptions, Procurement & Expenses",
      ],
      numericPrice: priceFor("starter") || 3000,
      popular: false,
    },
    {
      id: "pro",
      name: "Pro",
      price: priceFor("pro") === 0 ? "₦8,000" : formatPrice(priceFor("pro")),
      period: isYearly ? "/ year" : "/ month",
      description: "Full-featured for multi-store operations.",
      features: [
        limitLabel("pro", "stores", "Connected Devices", 5),
        limitLabel("pro", "staff", "Staff Accounts", 10),
        "Real-Time Cloud Sync",
        "Mobile App Companion",
      ],
      numericPrice: priceFor("pro") || 8000,
      popular: true,
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: priceFor("enterprise") === 0 ? "₦20,000" : formatPrice(priceFor("enterprise")),
      period: isYearly ? "/ year" : "/ month",
      description: "Custom limits for large pharmacy chains.",
      features: [
        limitLabel("enterprise", "stores", "Connected Devices", -1),
        limitLabel("enterprise", "staff", "Staff Accounts", -1),
        "Priority Support",
        "Custom Branding",
      ],
      numericPrice: priceFor("enterprise") || 20000,
      popular: false,
    },
  ];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/subscription-plans-catalog.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 6: Commit**

```bash
git add client/lib/types/subscription-plans.ts client/lib/constants/subscription-plans-catalog.ts client/__tests__/subscription-plans-catalog.test.ts
git commit -m "feat(client): add subscription plan catalog helper with pricing"
```

---

### Task 4: Subscription status alert component

**Files:**
- Create: `client/components/settings/billing/subscription-status-alert.tsx`

**Interfaces:**
- Consumes: `SubscriptionStatus` (Task 1).
- Produces: `<SubscriptionStatusAlert subStatus={subStatus} />` — a standalone, self-contained component (no data-fetching of its own), consumed by Task 8's tab shell.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { ShieldAlert, Check } from "lucide-react";
import type { SubscriptionStatus } from "@/lib/types/subscription-plans";

function capitalizeFirstLetter(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function SubscriptionStatusAlert({ subStatus }: { subStatus: SubscriptionStatus | undefined }) {
  if (!subStatus) return null;

  if (subStatus.status === "inactive") {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0 text-red-600" />
        <div className="space-y-1">
          <p className="font-medium">No Active Subscription / Expired</p>
          <p className="text-sm">
            Upgrade or renew your plan below to ensure your cloud data remains protected.
          </p>
        </div>
      </div>
    );
  }

  if (subStatus.status === "active") {
    const daysLeft = Math.floor(Number(subStatus.days_remaining ?? 0));
    const isTrial = subStatus.is_trial === true;
    const isFreePlan = subStatus.plan?.toLowerCase().includes("free");
    const isExpiringSoon = daysLeft < 7 && !isFreePlan;

    if (isTrial || isExpiringSoon) {
      return (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">
              {isTrial
                ? `You are on the ${capitalizeFirstLetter(subStatus.plan || "Free")} Trial (${daysLeft} Days Remaining)`
                : `You are on the ${capitalizeFirstLetter(subStatus.plan ?? "")} Plan${isExpiringSoon ? ` (${daysLeft} Days Remaining)` : ""}`}
            </p>
            <p className="text-sm">
              {isTrial
                ? "Upgrade or subscribe to a paid plan below to ensure your cloud data remains protected."
                : "Your subscription is expiring soon. Please renew to ensure your cloud data remains protected."}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className={`${isFreePlan ? "bg-slate-50 border-slate-200 text-slate-800" : "bg-green-50 border-green-200 text-green-800"} border p-4 rounded-lg flex items-start gap-3`}>
        <Check className={`h-5 w-5 mt-0.5 shrink-0 ${isFreePlan ? "text-slate-600" : "text-green-600"}`} />
        <div className="space-y-1">
          <p className="font-medium">You are on the {capitalizeFirstLetter(subStatus.plan ?? "")} Plan</p>
          <p className="text-sm">
            {isFreePlan
              ? "Your local standalone workspace is active and ready. Upgrade to sync your data to the cloud."
              : "Your subscription is active. Thank you for protecting your cloud data with DumosRx."}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Manual verification**

Deferred to Task 8 (this component has no data source of its own, so it's only visible once mounted in the tab shell). No standalone build/manual-check needed beyond the compile succeeding.

- [ ] **Step 3: Commit**

```bash
git add client/components/settings/billing/subscription-status-alert.tsx
git commit -m "feat(client): add subscription status alert component"
```

---

### Task 5: Plan cards, coupon entry, and change-plan flow

**Files:**
- Create: `client/components/settings/billing/subscription-plans.tsx`
- Create: `client/components/settings/billing/subscription-plan-card.tsx`
- Create: `client/components/settings/billing/coupon-input.tsx`

**Interfaces:**
- Consumes: `getSubscriptionPlans` (Task 3), `useSystemConfigStore` (existing), `usePayMutation`/`useValidateCouponMutation` (Task 2), `useReferralStats` (Task 2), `ConfirmDialog` (existing, `client/components/ui/confirm-dialog.tsx`).
- Produces: `<SubscriptionPlans />`, consumed by Task 8's tab shell.

- [ ] **Step 1: Create the coupon input**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { AppliedCoupon } from "@/lib/types/subscription-plans";

interface CouponInputProps {
  couponCode: string;
  setCouponCode: (code: string) => void;
  appliedCoupon: AppliedCoupon | null;
  setAppliedCoupon: (coupon: AppliedCoupon | null) => void;
  validatingCoupon: boolean;
  handleValidateCoupon: () => void;
}

export function CouponInput({
  couponCode,
  setCouponCode,
  appliedCoupon,
  setAppliedCoupon,
  validatingCoupon,
  handleValidateCoupon,
}: CouponInputProps) {
  return (
    <div className="max-w-md mx-auto mb-8 bg-muted/30 p-4 rounded-lg flex items-center gap-3 border border-muted">
      <div className="flex-1 relative">
        <input
          type="text"
          placeholder="Have a coupon code?"
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
          disabled={validatingCoupon || appliedCoupon !== null}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      {appliedCoupon ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setAppliedCoupon(null);
            setCouponCode("");
          }}
        >
          Remove
        </Button>
      ) : (
        <Button size="sm" onClick={handleValidateCoupon} disabled={!couponCode || validatingCoupon}>
          {validatingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the plan card**

```tsx
"use client";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Sparkles } from "lucide-react";
import type { SubscriptionPlanCatalogEntry } from "@/lib/constants/subscription-plans-catalog";

interface SubscriptionPlanCardProps {
  plan: SubscriptionPlanCatalogEntry;
  isDiscounted: boolean;
  discountedPrice: number;
  formatPrice: (price: number) => string;
  currentPlanName: string | undefined;
  onSubscribe: (planId: string, amount: number, planName: string) => void;
  onDowngradeRequest: (plan: { id: string; amount: number; name: string }) => void;
  isCurrentPlanHigherWeight: (planId: string) => boolean;
  loading: string | null;
}

export function SubscriptionPlanCard({
  plan,
  isDiscounted,
  discountedPrice,
  formatPrice,
  currentPlanName,
  onSubscribe,
  onDowngradeRequest,
  isCurrentPlanHigherWeight,
  loading,
}: SubscriptionPlanCardProps) {
  const isCurrent = currentPlanName?.toLowerCase() === plan.name.toLowerCase();
  const isDowngrade = isCurrentPlanHigherWeight(plan.id);

  return (
    <Card
      className={`relative h-full flex flex-col ${plan.popular ? "border-primary border-2 shadow-xl" : "border-border/50"}`}
    >
      {plan.popular && (
        <div className="absolute top-0 right-0 transform translate-x-3 -translate-y-3 z-10 bg-primary text-primary-foreground text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          Recommended
        </div>
      )}
      <CardHeader className="pt-8 pb-4">
        <CardTitle className="text-2xl font-black">{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-start gap-4">
        <div className="flex items-baseline gap-1">
          {isDiscounted ? (
            <>
              <span className="text-lg font-bold line-through text-muted-foreground opacity-70 mr-2">
                {plan.price}
              </span>
              <span className="text-4xl font-black text-green-500 tracking-tight">
                {formatPrice(discountedPrice)}
              </span>
            </>
          ) : (
            <span className="text-4xl font-black tracking-tight">{plan.price}</span>
          )}
          <span className="text-muted-foreground font-semibold">{plan.period}</span>
        </div>
        <ul className="space-y-2">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500 shrink-0" />
              {feature}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full font-bold"
          disabled={isCurrent || loading === plan.id}
          variant={isDowngrade ? "outline" : "default"}
          onClick={() =>
            isDowngrade
              ? onDowngradeRequest({ id: plan.id, amount: plan.numericPrice, name: plan.name })
              : onSubscribe(plan.id, plan.numericPrice, plan.name)
          }
        >
          {loading === plan.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isCurrent ? (
            "Current Plan"
          ) : isDowngrade ? (
            "Downgrade"
          ) : (
            "Subscribe"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 3: Create the orchestrating `SubscriptionPlans` component**

```tsx
"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useSystemConfigStore } from "@/lib/store/system-config-store";
import { useSubscriptionStatus, usePayMutation, useValidateCouponMutation, useReferralStats } from "@/lib/hooks/use-billing";
import { getSubscriptionPlans } from "@/lib/constants/subscription-plans-catalog";
import { SubscriptionPlanCard } from "./subscription-plan-card";
import { CouponInput } from "./coupon-input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AppliedCoupon } from "@/lib/types/subscription-plans";

const PLAN_WEIGHT: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(price);
}

export function SubscriptionPlans() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [couponCode, setCouponCode] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [downgradePlan, setDowngradePlan] = useState<{ id: string; amount: number; name: string } | null>(null);

  const { subscriptionPlans } = useSystemConfigStore();
  const { data: subStatus } = useSubscriptionStatus();
  const { data: referralStats } = useReferralStats();
  const pay = usePayMutation();
  const validateCoupon = useValidateCouponMutation();

  const userCredits = referralStats?.referral_credits || 0;
  const isYearly = billingPeriod === "yearly";
  const plans = getSubscriptionPlans(subscriptionPlans, isYearly, formatPrice);

  const handleValidateCoupon = async () => {
    if (!couponCode) return;
    setValidatingCoupon(true);
    try {
      const response = await validateCoupon.mutateAsync({ code: couponCode });
      if (response.valid) {
        setAppliedCoupon(response.coupon);
        toast.success(`Coupon applied: ${response.coupon.type === "discount_percent" ? response.coupon.value + "% off" : "₦" + response.coupon.value.toLocaleString() + " off"}`);
      } else {
        toast.error(response.message || "Invalid coupon code");
        setAppliedCoupon(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to validate coupon");
      setAppliedCoupon(null);
    } finally {
      setValidatingCoupon(false);
    }
  };

  const getDiscountedPrice = (numericPrice: number) => {
    if (numericPrice === 0 || !appliedCoupon) return numericPrice;
    let price = numericPrice;
    if (appliedCoupon.type === "discount_percent") price -= price * (appliedCoupon.value / 100);
    else if (appliedCoupon.type === "discount_amount") price -= appliedCoupon.value;
    if (userCredits > 0) price -= Math.min(userCredits, Math.max(0, price));
    return Math.max(0, price);
  };

  const isDiscounted = (numericPrice: number) => numericPrice > 0 && (appliedCoupon !== null || userCredits > 0);

  const isCurrentPlanHigherWeight = (planId: string) => {
    const currentWeight = PLAN_WEIGHT[subStatus?.plan?.toLowerCase() ?? "free"] ?? 0;
    return (PLAN_WEIGHT[planId] ?? 0) < currentWeight;
  };

  const handleSubscribe = async (planId: string, baseAmount: number, planName: string) => {
    setLoading(planId);
    try {
      const response = await pay.mutateAsync({
        amount: getDiscountedPrice(baseAmount),
        plan_name: planName,
        coupon_code: appliedCoupon?.code,
        interval: billingPeriod,
        use_credits: userCredits > 0,
      });

      if (response.success) {
        if (response.payment_url) {
          window.location.assign(response.payment_url);
        } else {
          toast.success("Subscription activated successfully!");
        }
      } else {
        toast.error(response.message || "Failed to initiate payment");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment service unavailable");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <Tabs defaultValue="monthly" className="w-[300px]" onValueChange={(val) => setBillingPeriod(val as "monthly" | "yearly")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="yearly">Yearly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <CouponInput
        couponCode={couponCode}
        setCouponCode={setCouponCode}
        appliedCoupon={appliedCoupon}
        setAppliedCoupon={setAppliedCoupon}
        validatingCoupon={validatingCoupon}
        handleValidateCoupon={handleValidateCoupon}
      />

      {userCredits > 0 && (
        <div className="max-w-md mx-auto bg-primary/5 p-4 rounded-lg flex items-center justify-between border border-primary/20">
          <span className="text-sm font-semibold">Referral Credits Available</span>
          <Badge variant="secondary">₦{userCredits.toLocaleString()}</Badge>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {plans.map((plan) => (
          <SubscriptionPlanCard
            key={plan.id}
            plan={plan}
            isDiscounted={isDiscounted(plan.numericPrice)}
            discountedPrice={getDiscountedPrice(plan.numericPrice)}
            formatPrice={formatPrice}
            currentPlanName={subStatus?.plan}
            onSubscribe={handleSubscribe}
            onDowngradeRequest={setDowngradePlan}
            isCurrentPlanHigherWeight={isCurrentPlanHigherWeight}
            loading={loading}
          />
        ))}
      </div>

      <ConfirmDialog
        open={downgradePlan !== null}
        onOpenChange={(open) => !open && setDowngradePlan(null)}
        title="Downgrade Subscription?"
        description={`Are you sure you want to downgrade to the ${downgradePlan?.name} plan? You may lose access to premium features immediately upon downgrade.`}
        confirmLabel="Yes, Downgrade"
        variant="destructive"
        onConfirm={() => {
          if (downgradePlan) handleSubscribe(downgradePlan.id, downgradePlan.amount, downgradePlan.name);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify the build succeeds**

Run: `cd client && npm run build`
Expected: succeeds (these three components have no consumer yet — verified as a standalone compile unit).

- [ ] **Step 5: Manual verification**

Deferred to Task 8 (this component isn't mounted anywhere until the tab shell exists).

- [ ] **Step 6: Commit**

```bash
git add client/components/settings/billing/subscription-plans.tsx client/components/settings/billing/subscription-plan-card.tsx client/components/settings/billing/coupon-input.tsx
git commit -m "feat(client): add subscription plan cards, coupon entry, and change-plan flow"
```

---

### Task 6: Billing history

**Files:**
- Create: `client/components/settings/billing/billing-history.tsx`

**Interfaces:**
- Consumes: `useBillingHistory()` (Task 2).
- Produces: `<BillingHistory />`, consumed by Task 8's tab shell.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBillingHistory } from "@/lib/hooks/use-billing";

export function BillingHistory() {
  const { data, isLoading } = useBillingHistory();
  const transactions = data?.transactions || [];

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle>Billing History</CardTitle>
        <CardDescription>View and download your recent invoices.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No billing history found.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Invoice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell className="text-sm">{bill.date}</TableCell>
                  <TableCell className="font-medium text-sm">{bill.desc}</TableCell>
                  <TableCell className="text-sm">{bill.amount}</TableCell>
                  <TableCell>
                    <Badge className={bill.status === "Success" ? "bg-green-500" : bill.status === "Pending" ? "bg-yellow-500" : "bg-red-500"}>
                      {bill.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={bill.status !== "Success"}
                      onClick={() => {
                        if (bill.receipt_url) window.open(bill.receipt_url, "_blank");
                        else toast("Invoice not available for this transaction.");
                      }}
                    >
                      Download
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd client && npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual verification**

Deferred to Task 8.

- [ ] **Step 4: Commit**

```bash
git add client/components/settings/billing/billing-history.tsx
git commit -m "feat(client): add billing history table"
```

---

### Task 7: Referral program tab

**Files:**
- Create: `client/components/settings/billing/referral-tab.tsx`

**Interfaces:**
- Consumes: `useReferralStats()` (Task 2).
- Produces: `<ReferralTab />`, consumed by Task 8's tab shell.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Copy, Check, Users, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useReferralStats } from "@/lib/hooks/use-billing";

export function ReferralTab() {
  const { data: stats, isLoading } = useReferralStats();
  const [copied, setCopied] = useState(false);

  const referralLink = stats?.referral_code ? `${window.location.origin}/register?ref=${stats.referral_code}` : "";

  const copyReferralLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Referral link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 border-none shadow-sm flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" /> Invite Others, Earn Credits!
            </CardTitle>
            <CardDescription>
              Share your referral link with other store owners. When they subscribe to any plan,
              you&apos;ll earn a percentage of their payment as credits to offset your own future bills!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Input readOnly value={referralLink} placeholder="Loading your referral link..." className="bg-muted/30 border-muted text-sm font-mono truncate" />
              <Button onClick={copyReferralLink} size="icon" variant="outline" disabled={!referralLink}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Referral Balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-black tracking-tight text-primary">₦{(stats?.referral_credits ?? 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Automatically applied at checkout to discount your subscriptions.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" /> Referred Signups
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!stats?.referrals?.length ? (
            <div className="text-center py-8 text-muted-foreground">You haven&apos;t referred anyone yet. Share your link to get started!</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store Name</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Registered On</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.referrals.map((ref) => (
                  <TableRow key={ref.id}>
                    <TableCell className="font-semibold">{ref.store_name}</TableCell>
                    <TableCell>{ref.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{format(new Date(ref.created_at), "dd/MM/yyyy")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ref.status === "active" ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"}>
                        {ref.status === "active" ? "Subscribed" : "Registered / Trial"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle>Credit Statements</CardTitle>
        </CardHeader>
        <CardContent>
          {!stats?.transactions?.length ? (
            <div className="text-center py-8 text-muted-foreground">No credit transactions recorded yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.transactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell className="text-muted-foreground text-sm font-mono">{format(new Date(txn.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell>
                      <Badge className={txn.type === "earned" ? "bg-green-500" : "bg-muted-foreground/30 text-foreground"}>
                        {txn.type === "earned" ? "Credit" : txn.type === "spent" ? "Debit" : "Adjustment"}
                      </Badge>
                    </TableCell>
                    <TableCell className={`font-bold ${txn.type === "earned" ? "text-green-500" : "text-rose-500"}`}>
                      {txn.type === "earned" ? "+" : "-"}₦{Number(txn.amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">{txn.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd client && npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual verification**

Deferred to Task 8.

- [ ] **Step 4: Commit**

```bash
git add client/components/settings/billing/referral-tab.tsx
git commit -m "feat(client): add referral program tab"
```

---

### Task 8: Settings > Billing tab — nav entry, shell, and wiring

**Files:**
- Modify: `client/app/(dashboard)/settings/[tab]/settings-tab-nav.tsx`
- Modify: `client/app/(dashboard)/settings/[tab]/settings-client.tsx`
- Create: `client/components/settings/billing/billing-settings.tsx`

**Interfaces:**
- Consumes: `useSubscriptionStatus()` (Task 2), `SubscriptionStatusAlert` (Task 4), `SubscriptionPlans` (Task 5), `BillingHistory` (Task 6), `ReferralTab` (Task 7) — all of which now exist, making this the first task where the full tab actually builds and renders.
- Produces: `<BillingSettings />`, mounted as the new `billing` Settings tab's content.

This task is placed last among the "build" tasks deliberately: every component it composes already exists from Tasks 4-7, so this is the first point at which the tab is both buildable and demoable end-to-end.

- [ ] **Step 1: Add the nav entry**

In `client/app/(dashboard)/settings/[tab]/settings-tab-nav.tsx`, change the icon import:

```tsx
import { Store, Bell, Shield, Database, Palette, Globe, Users, CreditCard } from "lucide-react";
```

Add, immediately after the `system` `TabsTrigger` block, still inside the same `isAdmin &&` guard pattern used by the other admin-only tabs:

```tsx
      {isAdmin && (
        <TabsTrigger
          value="billing"
          className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
        >
          <CreditCard className="w-4 h-4 mr-2 md:mr-3" />
          <span className="text-sm">Billing</span>
        </TabsTrigger>
      )}
```

- [ ] **Step 2: Create the tab shell**

```tsx
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSubscriptionStatus } from "@/lib/hooks/use-billing";
import { SubscriptionStatusAlert } from "./subscription-status-alert";
import { SubscriptionPlans } from "./subscription-plans";
import { BillingHistory } from "./billing-history";
import { ReferralTab } from "./referral-tab";

export function BillingSettings() {
  const { data: subStatus } = useSubscriptionStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Subscription & Billing</h1>
        <p className="text-muted-foreground">Manage your plan, payment methods, and referrals</p>
      </div>

      <SubscriptionStatusAlert subStatus={subStatus} />

      <Tabs defaultValue="subscription" className="space-y-6">
        <TabsList>
          <TabsTrigger value="subscription">My Subscription</TabsTrigger>
          <TabsTrigger value="referrals">Referral Program</TabsTrigger>
        </TabsList>
        <TabsContent value="subscription" className="space-y-6">
          <SubscriptionPlans />
          <BillingHistory />
        </TabsContent>
        <TabsContent value="referrals">
          <ReferralTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: Wire the tab into `settings-client.tsx`**

Add the import:

```tsx
import { BillingSettings } from "@/components/settings/billing/billing-settings";
```

Add, after the `system` `TabsContent` block:

```tsx
            {isAdmin && (
              <TabsContent value="billing">
                <BillingSettings />
              </TabsContent>
            )}
```

- [ ] **Step 4: Verify the build succeeds**

Run: `cd client && npm run build`
Expected: succeeds.

- [ ] **Step 5: Manual end-to-end verification**

Run: `cd client && npm run dev`, navigate to Settings > Billing (admin account).
Expected: status alert reflects the current subscription state, plan cards render with the current plan disabled/labeled "Current Plan", coupon apply/remove works, subscribing to a higher-weight plan calls `pay()` and redirects to `payment_url` (or shows a success toast for a zero-amount checkout), subscribing to a lower-weight plan opens the downgrade confirmation dialog, billing history and referral tabs render their data or empty states.

- [ ] **Step 6: Commit**

```bash
git add client/app/\(dashboard\)/settings/\[tab\]/settings-tab-nav.tsx client/app/\(dashboard\)/settings/\[tab\]/settings-client.tsx client/components/settings/billing/billing-settings.tsx
git commit -m "feat(client): wire Settings > Billing tab together"
```

---

### Task 9: Retarget existing alerts/links to Settings > Billing

**Files:**
- Modify: `client/components/auth/license-guard.tsx`
- Modify: `client/components/dashboard/locked-module-overlay.tsx`
- Modify: `client/components/dashboard/dashboard-action-center.tsx`
- Modify: `client/components/settings/system-settings.tsx`

**Interfaces:**
- Consumes: nothing new — swaps an external `<a>`/broken route for in-app navigation, using patterns (`next/link`, `window.location.href`) already used elsewhere in each of these files or their siblings.

- [ ] **Step 1: Retarget `license-guard.tsx`**

Replace the "Renew Subscription" button (the one currently opening `${WEB_APP_URL}/dashboard/billing` in a new tab):

```tsx
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  window.location.href = "/settings/billing";
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Renew Subscription
              </Button>
```

`window.location.href` (a full navigation) is used deliberately here rather than `next/navigation`'s router: `LicenseGuard` can render this lock screen outside the normal authenticated app tree, so a full navigation is the safe choice.

Remove the now-unused `WEB_APP_URL` import if nothing else in the file references it — check with `grep -n WEB_APP_URL client/components/auth/license-guard.tsx` before deleting the import.

- [ ] **Step 2: Retarget `locked-module-overlay.tsx`**

Replace the "Upgrade Plan" button:

```tsx
        <Button
          className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-bold shadow-lg shadow-primary/20 h-11"
          asChild
        >
          <Link href="/settings/billing">Upgrade Plan</Link>
        </Button>
```

Add the import: `import Link from "next/link";`
Remove the `WEB_APP_URL` import if it becomes unused (verify with the same grep as Step 1).

- [ ] **Step 3: Retarget `dashboard-action-center.tsx`**

Replace `actionRoute: "/settings/cloud"` on the `subscription-expired` and `subscription-expiring` alerts with `actionRoute: "/settings/billing"`. Leave the separate "No Cloud Account" alert's `actionRoute: "/settings/cloud"` untouched — that alert is about linking a cloud account, a separate concern from billing, out of scope here.

- [ ] **Step 4: Retarget `system-settings.tsx`**

Replace the "Web Dashboard" card:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Subscription & Billing</CardTitle>
          <CardDescription>
            Manage your subscription plan, payment methods, and billing history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/settings/billing">
              Manage Billing
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </CardContent>
      </Card>
```

Update the `lucide-react` import (replace `ExternalLink` with `ArrowRight` if `ExternalLink` becomes unused elsewhere in the file), add `import Link from "next/link";`, and remove `WEB_APP_URL` from the `@/lib/constants` import only if it's unused elsewhere in the file (check other cards in this file, e.g. support-email links, before removing).

- [ ] **Step 5: Manual verification**

Run: `cd client && npm run dev`.
1. Trigger the license-guard lock screen (e.g. via a locally simulated expired license) and click "Renew Subscription" — expect in-app navigation to `/settings/billing`, no new tab.
2. Trigger a `LockedModuleOverlay` (e.g. on a module locked by the current tier) and click "Upgrade Plan" — same expectation.
3. From the dashboard, trigger a subscription-expiring/expired action-center card and click its action — lands on `/settings/billing`, not the previously-broken `/settings/cloud`.
4. Visit Settings > System — the "Subscription & Billing" card's "Manage Billing" button navigates to `/settings/billing` in-app.

- [ ] **Step 6: Commit**

```bash
git add client/components/auth/license-guard.tsx client/components/dashboard/locked-module-overlay.tsx client/components/dashboard/dashboard-action-center.tsx client/components/settings/system-settings.tsx
git commit -m "feat(client): retarget subscription alerts to internal Settings > Billing tab"
```
