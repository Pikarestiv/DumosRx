# Known Bugs / Data Gaps

Issues spotted incidentally (e.g. while doing TypeScript type-safety cleanup) that aren't fixed yet, tracked here so they don't get lost. Not an exhaustive bug tracker; just a landing spot for "worth fixing later" findings. Fixed entries are removed outright rather than marked — this file is a to-do list, not a changelog (git history is the changelog).

Open items below are grouped by severity (Critical → High → Medium → Low), then a `client/`-area miscellaneous section for older/unlabeled entries, then the separate `web/` pre-launch review section.

## `client/` — older/unlabeled entries

### Account/store switch shows the previous store's stale dashboard data — mitigation confirmed ineffective, still open

- **Where:** `client/lib/context/store-context.tsx`'s `switchStore()`
  (`isSwitchingStore` state, `SWITCH_STORE_MAX_WAIT_MS`), gated in
  `client/components/auth/license-guard.tsx` (`if (loading ||
  isSwitchingStore) return <SplashScreen />`).
- **Context:** every store-scoped query reads the active store from a
  module-level resolver at call time, not from its React Query key, so a
  switch relies on `queryClient.invalidateQueries()` to make screens
  re-fetch under the new store. `switchStore()` sets `isSwitchingStore` to
  show a splash for the `cancelQueries()`/`invalidateQueries()` round trip,
  intended to prevent the previous store's cached data from ever painting.
- **The mitigation doesn't work, verified two ways:** (1) code trace —
  `setIsSwitchingStore(true)` unmounts `children` (and every query observer
  in it) in the same tick, *before* the awaited `invalidateQueries()` call
  even runs; with no active observers, TanStack Query v5's default
  `refetchType: 'active'` only marks queries stale and does nothing else,
  so the awaited "round trip" resolves almost immediately without
  refetching anything. (2) reproduced directly against the project's
  installed `@tanstack/query-core` in an isolated harness: after the
  splash clears and `children` remounts, the very first render reads the
  previous store's data straight out of cache (`isFetching: true`,
  `gcTime` is 15 min) — the stale frame is not eliminated, just relocated
  to immediately after the splash disappears. The 5s
  `SWITCH_STORE_MAX_WAIT_MS` cap is irrelevant, since `invalidateQueries()`
  never approaches it.
- **Effect:** the originally-reported stale-dashboard-after-switch symptom
  can still occur; the splash screen added as a defense does not prevent it
  and its doc claims to the contrary were wrong.
- **Likely real fix (not yet applied):** swap `invalidateQueries()` for
  `queryClient.removeQueries()` (or `clear()`, as the multi-staff PIN
  "Switch Account" path already does via `login()`) so there's no stale
  cache entry left to serve on remount; or await a `refetchType: 'all'`
  invalidation *before* unmounting `children` instead of after; or
  store-scope the query keys so the previous store's cache entry is a
  different key entirely. Needs a real fix + a test that would have caught
  this before re-closing.
