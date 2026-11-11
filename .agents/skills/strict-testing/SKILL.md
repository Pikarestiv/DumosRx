---
name: strict-testing
description: >
  Apply these standards whenever creating, writing, editing, modifying, refactoring, reviewing, debugging, or evaluating automated tests, test fixtures, mocks, or testing infrastructure. Always activate for any testing-related development task.
---

# Strict Testing Standards

The primary goal of testing in DumosRx is **meaningful test coverage that provides high confidence in observable application behaviour**, not inflated test counts or superficial coverage metrics.

---

## 1. Behaviour vs. Implementation

Tests must verify observable application outcomes, not internal implementation mechanics.

- **Assert against observable boundaries:**
  - Public function return values.
  - User-visible DOM state changes (using semantic selectors: roles, labels, text).
  - Database state changes in real storage (SQLite or MySQL).
  - HTTP status codes and response payloads.
  - External boundary interactions (payment gateways, printers, cloud sync endpoints).
- **Never assert against internal mechanics:**
  - Do not spy on or assert calls to internal/private helpers of the unit under test.
  - Do not assert React hook call order or mock invocation call order (`mock.invocationCallOrder`).
  - Do not assert callback referential stability (`expect(propA).toBe(propB)`) unless stability is a proven performance contract.

```typescript
// BAD: Asserting internal mock call order and private method execution
expect(statusOrder).toBeLessThan(routeOrder);
expect(internalHelperSpy).toHaveBeenCalled();

// GOOD: Asserting observable state change and user-visible outcome
expect(await screen.findByRole("heading", { name: /dashboard/i })).toBeVisible();
expect(scalar("SELECT subscription_status FROM stores WHERE id = 's1'")).toBe("active");
```

---

## 2. Mocking Policy: Boundaries Only, Never Application Logic

Mocks are permitted **only** at true external boundaries (network APIs, hardware devices, native OS channels, third-party payment gateways like Paystack).

- **Never mock the unit or collaborator being tested:**
  - Never mock a function and then call that mock in the test body (`staff-deactivate.test.ts` anti-pattern).
  - Never reproduce application business logic inside a mock (e.g. hand-rolling permissions checks inside a mocked `useAuth`).
- **Prefer real collaborators:**
  - For database tests, use real in-memory SQLite (`initSqlJs` on client, `:memory:` on server) rather than mocking query functions.
  - For frontend state, use real Zustand stores and TanStack Query clients with cache disabled (`retry: false, gcTime: 0`).
- **Never verify a mock simply returned what you told it to return:**
  - A test that configures `mockFn.mockResolvedValue(X)` and asserts `expect(result).toBe(X)` without testing intermediate domain logic has zero value.

```typescript
// BAD: Mocking the function under test and asserting it was called
vi.mock("@/lib/db/users", () => ({ updateUser: vi.fn() }));
await updateUser("u1", { is_active: 0 });
expect(updateUser).toHaveBeenCalledWith("u1", { is_active: 0 });

// GOOD: Executing real database logic and asserting database state
await deactivateUser("u1");
const user = await queryOne("SELECT is_active, _deleted FROM users WHERE id = 'u1'");
expect(user.is_active).toBe(0);
```

---

## 3. Zero-Value Tests Prohibition

Do not write or retain tests that provide no meaningful regression protection:

1. **Table existence tests:** Never write tests that only assert `Schema::hasTable('tablename')` (`ArchitectureTest.php` anti-pattern). Migrations and feature tests already exercise database schemas.
2. **Third-party library verification:** Never test that `zod`, `date-fns`, `lodash`, or `Intl` works as documented by their authors. Test how DumosRx domain logic handles formatted inputs.
3. **Trivial getters/setters/constants:** Never test static exports, enums, or object keys unless they enforce a critical backward compatibility or security invariant (e.g. CSP policy pinning).
4. **Shallow structure assertions:** In API tests, never stop at `assertJsonStructure(['data'])`. Verify specific values, filtering, multi-tenant scoping, and authorization exclusions.

---

## 4. Mandatory Edge Cases and Failure Scenarios

Critical business paths (POS sales, stock deductions, refunds, sync reconciliation, licensing, migrations) must explicitly cover edge cases:

- **Empty & Null Boundaries:** `null`, `undefined`, empty string `""`, `0`, empty arrays `[]`, and malformed payloads.
- **Arithmetic Boundaries:** Subunit rounding (Kobo/cents), large figures (hundreds of millions), division by zero, non-finite values (`NaN`, `Infinity`).
- **Authorization & Multi-Tenancy:**
  - Unauthorized callers (401) and forbidden roles (403).
  - Multi-tenant boundary checks: Ensure Store A credentials cannot view, update, or sync records belonging to Store B.
  - Never disable foreign key checks (`Schema::disableForeignKeyConstraints()`) in feature tests; foreign keys catch real data integrity bugs.
- **Concurrency & Races:** Double-clicks on payment submit, simultaneous tab sync attempts, and optimistic offline conflict drops.

---

## 5. Test Determinism & Timing

Tests must be 100% deterministic and isolated. Flaky tests undermine confidence.

- **Zero wall-clock sleeps:**
  - NEVER use `new Promise(r => setTimeout(r, N))` with real millisecond delays (`3500ms`, `600ms`) in automated tests.
  - Use `vi.useFakeTimers()` (`act(() => vi.advanceTimersByTime(N))`) for debounce/throttle logic.
  - For asynchronous state settlement, use polling helpers with short intervals: `waitFor(() => expect(...))` or `findBy*` queries.
- **Independent State & Cleanup:**
  - Every test must clean up its database tables, localStorage, session state, and timers in `beforeEach`/`afterEach`.
  - Tests must never depend on execution order or state left behind by a prior test.

---

## 6. Test Selection: Unit vs. Integration vs. E2E

Choose the lowest level of the test pyramid that provides high fidelity:

| Level | Primary Role | When to Use |
| :--- | :--- | :--- |
| **Pure Unit** | Pure calculations, validators, algorithms | Currency math, tax/discount formulas, interval parsing, state machine transitions. Zero mocks needed. |
| **DB Integration** | Storage invariants, queries, migrations | Sync engine, stock deductions, ledger reconciliation, Eloquent hooks. Uses real SQLite / test MySQL. |
| **Component Integration** | User workflows, form submissions, permission gating | POS checkout, return dialogs, catalog management. Uses real subcomponents with boundary-only mocking. |
| **Playwright E2E** | Critical end-to-end paths across whole stack | Offline-first sync, multi-store login, full receipt printing, end-to-end checkout flow. |

---

## 7. Bug Regression Rule

Every bug fix listed in `docs/FIXED_BUGS.md` or fixed during development MUST be accompanied by a test that:

1. Would have failed on the buggy implementation.
2. Passes on the corrected implementation.
3. Asserts the observable domain invariant, not just the hyper-local variable fix.

---

## 8. Change-Impact Testing Protocol & Quality Gates

Before pushing code or creating a pull request, enforce the 3 quality layers:

1. **Local Pre-Push Verification (`.githooks/pre-push`):**
   - Client typecheck: `cd client && npx tsc --noEmit`
   - Web typecheck: `cd web && npx tsc --noEmit`
   - Server static analysis: `cd laravel-server && composer run analyse`
2. **Targeted Test Execution by Subsystem:**
   - **POS Checkout & Calculations:** `cd client && npx vitest run __tests__/pos-*`
   - **Stock & Inventory Transfers:** `cd client && npx vitest run __tests__/stock-*`
   - **Sync Engine & Cloud Reconciliation:** `cd client && npx vitest run __tests__/*sync*` and `cd laravel-server && php artisan test tests/Feature/SyncEndpointTest.php`
   - **Admin Platform & Roles:** `cd web && npx vitest run __tests__/admin-*` and `cd laravel-server && php artisan test tests/Feature/Admin`
3. **CI Quality Gates (`.github/workflows/checks.yml`):**
   - Automatically executes full lint, typecheck, static analysis, and test suites across all three packages (`client`, `web`, `server`).


