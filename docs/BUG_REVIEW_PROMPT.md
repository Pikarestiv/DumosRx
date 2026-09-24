# Bug Review Prompt & Checklist

Reusable prompt for dispatching a review pass (Opus or otherwise) to find bugs
in DumosRx. Written after repeated review passes each turned up new bugs the
prior pass missed — the fix isn't a cleverer one-shot prompt, it's forcing
systematic coverage and iterating to a fixed point instead of a single
open-ended "find bugs" sweep.

## Why open-ended prompts miss bugs

A prompt like "review this code for bugs" makes the model sample the
diff/codebase based on whatever's most salient in context that run. Different
runs attend to different things, so each pass finds *something*, but no pass
is exhaustive by construction. Two changes fix this:

1. **Enumerate categories explicitly** instead of leaving "bug" undefined —
   turns sampling into a checklist walk.
2. **Iterate until two consecutive passes return nothing new** — that's the
   actual stopping condition, not "did one pass."

## Wrapper prompt

Use this as the dispatch prompt (fill in `<SCOPE>`):

```
Review <SCOPE> for bugs. Do not do an open-ended read-through — walk the
checklist below category by category, and for each category, check every
file in scope against it before moving to the next category. If a category
doesn't apply to a given file, say so explicitly rather than skipping it
silently.

For each finding, report:
- File and line
- Category it falls under
- Concrete failure scenario (specific input/state -> wrong output/crash)
- Severity (breaks money/auth/data integrity vs. cosmetic/edge-case)

Do not report style preferences, hypothetical future-proofing, or anything
without a concrete failure scenario. Cross-check new findings against
docs/KNOWN_BUGS.md and docs/FIXED_BUGS.md — skip anything already tracked
there, and flag anything in FIXED_BUGS.md that appears to have regressed.

<CHECKLIST>
```

Scoping guidance:
- Prefer narrow scope per dispatch (one module/feature/PR at a time) over
  "review the whole repo" — narrow scope with full checklist coverage beats
  broad scope with sampled coverage.
- Re-run the same wrapper prompt on the same scope after fixes land. Stop
  when a pass returns zero new findings, not after a fixed number of rounds.

## Checklist

### Correctness — Money & Tax
- Rounding/precision: every currency calc uses consistent decimal handling
  (no float arithmetic drift), rounding happens at the right step (per-line
  vs. total)
- Tax logic: VAT-inclusive vs. exclusive handled consistently; no double-apply
  or double-subtract
- Discounts/refunds/voids: applied before or after tax correctly; partial
  refunds don't desync totals
- Currency/locale formatting doesn't silently truncate or misparse

### Auth & Access Control
- Every mutating endpoint checks the actor's role/permission, not just that a
  session exists
- Staff PIN / login: hashed at rest, rate-limited, no timing leaks, no
  plaintext in logs
- Multi-tenant isolation: every query scoped to the correct store/tenant ID,
  no cross-tenant leakage via a missing `WHERE` clause
- Session/token expiry actually enforced, not just checked client-side

### Offline Sync & Conflict Resolution
- Conflicting writes (two devices editing the same record offline) resolve
  deterministically, not last-write-wins by accident
- Sync queue: partial failures don't drop or duplicate records
- Idempotency: replaying a sync batch after a crash doesn't double-apply
  mutations
- Version/clock fields actually compared correctly (off-by-one, stale
  version, timezone assumptions)

### Payments & Cart
- Cart-to-payment binding: payment reference tied to the correct cart at the
  correct point in time — no reuse across carts
- Race conditions: rapid double-submit doesn't create duplicate
  charges/orders
- Cart mutations after payment initialization are blocked or reconciled, not
  silently ignored

### State & Concurrency
- Race conditions in async flows (two requests racing on the same resource)
- Stale closures / stale state in React (using outdated cart/user state after
  an async gap)
- Missing loading/error states that let a user act on incomplete data

### Data Integrity
- Null/undefined handling at every DB read (optional fields, missing joins)
- Foreign key / referential integrity assumed but not enforced (orphaned
  records after delete)
- Input validation at API boundaries (not just client-side forms)

### Error Handling
- Errors swallowed silently (empty catch, ignored promise rejection)
- Errors surfaced to the wrong audience (stack traces to end users, no detail
  to logs)
- Retry logic that could duplicate side effects (double-charging,
  double-inserting)

### Frontend-Specific
- Accessibility regressions (focus traps, ARIA, zoom/pinch)
- Responsive breakpoints match project convention (bottom nav shows below
  1024px / `lg`, hidden at `lg+`)
- Stale UI after mutation (list not refreshed, optimistic update not rolled
  back on failure)

### Cross-Platform (Tauri desktop vs. web)
- Feature parity gaps between `client` (Tauri) and `web` builds
- Filesystem/native APIs only available in the Tauri context guarded properly
