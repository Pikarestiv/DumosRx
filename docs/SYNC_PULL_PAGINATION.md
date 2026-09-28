# Sync pull: paging and resumable progress

How `SyncController::pull()` (server) and `pullChanges()` (`client/lib/db/sync-engine/pull.ts`) page a table that has more changed rows than one response can carry, and why the pieces are shaped the way they are. Written when `A-1`/`A-3` were fixed (see `docs/FIXED_BUGS.md`, 2026-09-28).

## The two cursors

A pull carries **two** independent positions per table, and conflating them is the bug this design exists to prevent.

| | Where it lives | What it means | When it advances |
|---|---|---|---|
| **Window** | `_sync_state.last_synced_at` | "every row changed at or before this is already on this device" | only when the server reports `has_more: false` for the table and no record in the round was skipped |
| **Position** | `_sync_state.server_cursor` (JSON `{updated_at, id}`) | "how far into the current, still-undrained window this device has walked" | after **every** successfully committed page |

The window is what the server filters on (`_synced_at > X OR updated_at > X`). The position is a keyset seek *inside* that filtered set. Keeping them separate is what makes an interrupted round resumable without ever risking a skipped row: a round that stops early leaves the window exactly where it was, so nothing is declared synced that isn't, while the position it reached is preserved so the next round doesn't re-download what it already applied.

A drained table has `server_cursor = NULL`, so an ordinary incremental pull is byte-for-byte the request it always was.

## Why keyset, not OFFSET

`skip($offset)->limit(501)` makes MySQL walk and discard `$offset` rows on every page, so a full initial sync of a table with N changed rows costs O(N²/500). The keyset predicate is:

```
(updated_at, id) > (cursor.updated_at, cursor.id)
```

expressed as `updated_at > ? OR (updated_at = ? AND id > ?)`, over the same `ORDER BY updated_at, id` the pages were always emitted in. Every page costs the same as the first.

The `id` tie-break is not optional: `updated_at` has second precision, and a store that imports a catalogue or runs a bulk price update produces thousands of rows sharing one timestamp. A cursor on `updated_at` alone would either loop forever on that second or skip the rest of it.

**The cursor is formatted with the model's own date format, not ISO8601.** SQLite compares datetimes as text, so `'2026-09-28 10:00:00'` sorts *before* `'2026-09-28 10:00:00.000000'`; a cursor carrying a fractional part that no stored value has would put every row of that second on the wrong side of the `=` branch and drop them. `fetchPullPage()` therefore reformats through `$query->getModel()->getDateFormat()`.

## Compatibility

The change is deliberately additive in both directions, so client and server can deploy independently:

- The client sends **both** `page_offset` (the old contract) and `page_cursor`.
- The server prefers `page_cursor` when a table supplies one and falls back to `page_offset` otherwise, so a client older than this change pages exactly as before.
- A client newer than the server has its `page_cursor` ignored and its `page_offset` honoured, which is the pre-change behaviour.

`normalizePageCursor()` rejects anything that isn't a complete, parseable `(updated_at, id)` pair by returning `null`, which falls back to offset paging rather than throwing — a corrupt cursor costs a re-walk, never a failed pull.

## Held-back progress

Two cases deliberately do **not** persist the position for a page:

- **A skipped record.** If a pulled row was skipped (a pending local edit in `_sync_queue`, or a UNIQUE collision under the retry cap), that table's *persisted* position stops advancing for the rest of the round, exactly as its window stamp does — the row must stay re-offerable. The *in-memory* position keeps advancing regardless, or the next request would ask for the same page again and the round would never terminate.
- **`stock_movements` with deferred deltas.** A movement whose `stock_batches` row hadn't arrived yet has its quantity delta deferred to a final transaction. Persisting a position that claims those movements as pulled before their deltas land would lose the increments permanently (a movement is only seen by the insert branch once), so both the position and the window stamp are carried into that same final transaction.

## Tenant scoping cost

The six tables with no `store_id` of their own (`sale_items`, `return_items`, `prescription_items`, `purchase_order_items`, `stock_batches`, `sale_item_batches`) scope through their parent. They pass a **Builder** to `whereIn`, which Laravel compiles into a SQL subquery. They previously passed a **Collection** (`->pluck('id')`), which executed the parent query and inlined every id the tenant owned as bound literals — rebuilt once per table per page, several MB of query text for a mature store. `sale_item_batches` nests two levels deep (`sale_item_id IN (SELECT id FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE ...))`).

Soft-delete global scopes still apply to each subquery exactly as they did to the pluck. This matters: `counts()`'s `stock_batches` mirror depends on batches of a deleted product being excluded, and broadening that would make the health check permanently report a gap it can never close.

`resolvePullTenantScope()` resolves the owner, owned-store list and staff-id list **once per request** rather than once per table, and `applyPullCursor()`'s `Schema::hasColumn('_synced_at')` probe is memoized per request (Laravel does not cache it; it is a real `INFORMATION_SCHEMA` round trip).

## `MAX_PULL_PAGES`

Still present (1000), but it is a liveness bound, not a correctness one: it stops a single `sync()` call running forever if the server ever reports `has_more: true` indefinitely. Hitting it no longer discards anything, because every page committed its own position on the way.

## `forceFullResync()`

Unchanged and still correct: it deletes every `_sync_state` row, which clears both the window and the position, so the next pull walks each table from the beginning. With resumable paging, a full resync of a very large table is simply expected to span several rounds instead of needing to complete in one.
