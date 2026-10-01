# DumosRx In-App Assistant — Phase 1 Implementation Plan (Intent Router)

Branch: `feature/ai-assistant-intent-router`. Everything below is grounded in the current `client/` code as of 2026-09-29; no file was modified during planning.

## Scope decisions (already made)

- **No paid APIs, no API keys.** Phase 1 must work fully offline with zero network dependency and zero recurring cost.
- **Phase 1 approach: a custom intent-router, not an LLM.** Pattern/keyword-matching against a fixed set of intents, each mapped to a tool/function call — tiny, offline-safe, no model-download or bundle-size cost.
- **All platforms** — Tauri desktop app AND the PWA (mobile + desktop browser). No platform gating. (An earlier idea to restrict this to desktop-only was dropped once it was clear the intent-router has no meaningful bundle-size impact.)
- A future upgrade to a real (possibly free/local) LLM is an explicitly out-of-scope future phase. The tool/function layer is designed to be brain-agnostic so a future LLM could reuse the same tool definitions.

---

## 1. Architecture summary

Phase 1 is a **deterministic, offline, zero-dependency intent router** that lives entirely in `client/lib/assistant/` and reuses the existing SQLite query layer. There is no network call, no model, no new persisted state, and no schema change.

The pipeline for one message is:

```
utterance
  → normalize (lowercase, strip punctuation, collapse whitespace)
  → match against INTENT registry (phrase/keyword scoring; ambiguity + no-match handled)
  → extract entities (date/range phrase, product name) from the matched intent's capture groups
  → resolve to a ToolCall { tool, args }
  → permission gate (pure hasPermission() against the tool's requiredPermission)
  → execute tool (calls existing lib/db/queries/* functions with the active store scope)
  → format ToolResult into AssistantReply { text, actions[] }
```

Two layers are deliberately separated so the "brain" can be swapped later without touching the tools:

- **Brain** (`IntentRouterBrain`): turns text into a `ToolCall | Ambiguous | NoMatch`. Phase 1's only implementation is keyword/pattern matching.
- **Tools** (`AssistantTool` registry): named, described, typed-parameter functions with a required permission and an `execute(args, ctx)`. They are brain-agnostic and never read React state; they receive a plain `ToolContext`.

**Forward-compatibility note:** `AssistantTool` carries `name`, `description`, a hand-written JSON-schema-like `parameters` object, `requiredPermission`, `examples`, and `execute`. That is exactly the shape an LLM function-calling API consumes, so a future `LlmBrain` would emit the same `ToolCall` and reuse `tools/`, `reply-formatters.ts`, and the permission gate unchanged. The `AssistantBrain` interface (`resolve(utterance, ctx) → BrainOutcome`) is the only seam; defining it now costs one small type and no extra code paths. Nothing else about an LLM is designed in.

Relationship to the existing roadmap: `docs/FEATURE_ROADMAP_SPEC.md` §"AI Assistant Module" (lines 325-364) currently describes a server-proxied Gemini approach. Phase 1 does not replace that entry; it should be amended to record that the intent-router shipped first as the offline base, and that the LLM approach (if ever pursued) is a later phase reusing the tool layer. The roadmap's own rule at line 10 ("AI is NOT allowed to directly mutate state") is honoured trivially: every Phase 1 tool is read-only.

---

## 2. Where things live (file-level plan)

All new files respect the 350-line cap and the no-inline-comments rule (rationale goes into `client/AGENTS.md`, see §9).

### 2.1 Router core — `client/lib/assistant/`

| File | Responsibility |
|---|---|
| `types.ts` | `AssistantTool`, `ToolContext`, `ToolCall`, `ToolResult`, `IntentDefinition`, `BrainOutcome`, `AssistantBrain`, `AssistantReply`, `AssistantMessage`, `ReplyAction`. Types only. |
| `normalize.ts` | `normalizeUtterance(text)` → `{ raw, normalized, tokens }`. Lowercase, strip punctuation except `/` and `-` (dates), collapse whitespace, trim. |
| `date-phrases.ts` | `parseDatePhrase(text, now: Date)` → `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', label } \| null`. Handles: `today`, `yesterday`, `this week`, `last week`, `this month`, `last month`, `YYYY-MM-DD`, `DD/MM/YYYY` (via existing `parseDDMMYYYYToDate` in `lib/utils/date-utils.ts`), and `from X to Y`. `now` is injected for testability. Output is date-only strings so it plugs straight into `toQueryRange()` (`lib/utils/date-range.ts`). |
| `intent-matcher.ts` | `matchIntent(normalized, intents)` → `{ kind: 'match', intent, captures } \| { kind: 'ambiguous', candidates } \| { kind: 'none' }`. Scoring: each intent declares `phrases: RegExp[]` (multi-word anchors, +3 each, may carry named capture groups) and `keywords: string[]` (+1 each). Threshold = 3. If the top two scores tie, return `ambiguous` with both. Pure, synchronous. |
| `intents/finance-intents.ts` | Intent definitions that resolve to `profit_summary`. |
| `intents/sales-intents.ts` | Intents resolving to `sales_summary` / `my_sales_today`. |
| `intents/inventory-intents.ts` | Intents resolving to `inventory_status` / `product_stock`. |
| `intents/navigation-intents.ts` | "How do I…" / "Where is…" intents resolving to `navigate_help` with a `topic` argument. |
| `intents/index.ts` | `INTENTS: IntentDefinition[]` (ordered; more specific first, same convention as `PAGE_ROUTES`). |
| `help-catalog.ts` | `HELP_TOPICS: HelpTopic[]` — the procedural knowledge table: `{ id, title, href, steps: string[], keywords, requiredPermission?, settingsTab? }`. Routes come from the same paths `PAGE_ROUTES` (`lib/constants/dashboard-page-routes.ts`) and `SETTINGS_TAB_PERMISSIONS` (`lib/constants/settings-tabs.ts`) already use; do not invent new ones. |
| `tools/finance-tools.ts` | `profit_summary` tool. |
| `tools/sales-tools.ts` | `sales_summary`, `my_sales_today` tools. |
| `tools/inventory-tools.ts` | `inventory_status`, `product_stock` tools. |
| `tools/navigation-tools.ts` | `navigate_help` tool (reads `help-catalog.ts`). |
| `tools/index.ts` | `TOOL_REGISTRY: ReadonlyMap<string, AssistantTool>` (a `Map`, per `.agents/AGENTS.md` §8 — never `obj[key]` with user-derived keys). |
| `permission-gate.ts` | `authorizeToolCall(tool, ctx)` → `ok \| denied(reason)`. Uses the pure `hasPermission(user, group, key)` from `lib/hooks/use-permissions.ts` (already non-React). |
| `reply-formatters.ts` | `formatReply(tool, result, ctx)` → `AssistantReply`. Currency via `formatCurrency(amount, ctx.currencyCode)` (`lib/utils.ts`), dates via `formatDateToDDMMYYYY` (house DD/MM/YYYY rule, `.agents/AGENTS.md` §6). |
| `fallback-replies.ts` | `buildNoMatchReply(ctx)`, `buildAmbiguousReply(candidates)`, `buildDeniedReply(tool)`, `buildErrorReply()`. The no-match reply lists example questions pulled from each tool's `examples`, filtered by what `ctx` is permitted to run, plus a "Send feedback" action. |
| `intent-router-brain.ts` | `IntentRouterBrain implements AssistantBrain`: normalize → matchIntent → build `ToolCall` from captures (+ `parseDatePhrase`). |
| `router.ts` | `answer(utterance, ctx, brain = intentRouterBrain)` → `Promise<AssistantReply>`. Orchestrates brain → gate → execute → format, with a `try/catch` that returns `buildErrorReply()` and logs via `lib/utils/dev-log.ts` (never `logCrash()` — see §6). |

### 2.2 State + hooks

| File | Responsibility |
|---|---|
| `lib/store/use-assistant-panel.ts` | Zustand store, same shape as `lib/store/use-online-orders-modal.ts`: `{ isOpen, messages: AssistantMessage[], open(), close(), append(msg), clear() }`. In-memory only, not persisted (see §6). |
| `lib/hooks/use-assistant.ts` | Builds `ToolContext` from `useAuth()` (`user`, `permissionGroup`) and `useStore()` (`storeProfile.currency`, `storeProfile.expiry_warning_days`, `storeType`, `getTerm`), exposes `send(text)` which appends the user message, calls `answer()`, appends the reply, and tracks `isThinking`. Also exposes `suggestions` (permission-filtered examples) for the chips. No `useQuery` — tool executions are imperative, one-shot reads, exactly like `usePnLReport` in `lib/hooks/use-finance-data.ts`. |

### 2.3 UI — `client/components/assistant/`

| File | Responsibility |
|---|---|
| `assistant-panel.tsx` | The chat surface. Built on `components/ui/responsive-modal.tsx` (Dialog ≥768px, Drawer below), so mobile and desktop are handled by the house primitive. Mounted once, globally. |
| `assistant-message-list.tsx` | Renders `messages` (user bubble `bg-primary text-primary-foreground`, assistant bubble `bg-muted text-foreground`), each reply's `actions` as small `Button variant="outline"` links (Next `Link`), and a "thinking" skeleton. Wrapped in `ScrollFade` (`components/ui/scroll-fade.tsx`). |
| `assistant-composer.tsx` | Input + send button; Enter submits; disabled while `isThinking`. |
| `assistant-suggestion-chips.tsx` | The starter chips shown when the thread is empty ("How do I make a sale?", "Gross profit this month", "What's low on stock?"), filtered by permission. |
| `assistant-launcher.tsx` | Icon button (lucide `Sparkles` or `MessageCircleQuestion`) that calls `useAssistantPanel.getState().open()`. Tooltip with the house 1000ms delay. |

### 2.4 Existing files touched (small edits)

- `components/dashboard/dashboard-layout.tsx` — mount `<AssistantPanel />` next to `<OnlineOrdersModal />` (line ~277). Same global-mount pattern.
- `components/dashboard/dashboard-header.tsx` — render `<AssistantLauncher />` beside `<NotificationBell />` in the same `border border-border/50 rounded-full p-0.5` wrapper (line ~121). Header renders on every breakpoint and every route except POS/Settings.
- `lib/hooks/use-account-actions.ts` — add an "Ask the assistant" `NavAction` (icon `Sparkles`) before "Help & Feedback" that calls `useAssistantPanel.getState().open()` directly (no prop threading). Reachable from POS (sidebar `UserNav`) and from the mobile "More" drawer without touching either component.
- `lib/constants/permissions.ts` — **no new keys**. Update the hand-maintained call-site comments in `ENFORCED_PERMISSION_KEYS` for the keys the tools reuse (`view_financial_reports`, `view_reports`, `view_cost_fields`, `process_sales`, plus any `help-catalog` gating keys).

Nothing under `web/` or `laravel-server/` is involved.

---

## 3. Core types (load-bearing signatures)

```ts
// lib/assistant/types.ts
export interface ToolContext {
  user: { id: string; role: string; store_id?: string | null } | null;
  permissionGroup: { permissions: string[] } | null;
  currencyCode?: string;
  expiryWarningDays: number;      // storeProfile.expiry_warning_days || 90
  storeType: StoreType;
  term: (key: string) => string;  // store-context terminology
  now: Date;                      // injected; tests pin it
}

export interface AssistantTool<A = Record<string, unknown>, R = unknown> {
  name: string;
  description: string;
  parameters: Record<string, { type: "string" | "number"; description: string; required?: boolean }>;
  requiredPermission?: string | string[];
  examples: string[];
  execute: (args: A, ctx: ToolContext) => Promise<R>;
  format: (result: R, args: A, ctx: ToolContext) => AssistantReply;
}

export type ToolCall = { tool: string; args: Record<string, unknown> };
export type BrainOutcome =
  | { kind: "call"; call: ToolCall }
  | { kind: "ambiguous"; candidates: ToolCall[] }
  | { kind: "none" };

export interface AssistantBrain { resolve(utterance: string, ctx: ToolContext): BrainOutcome; }

export interface ReplyAction { label: string; href: string }
export interface AssistantReply {
  kind: "answer" | "help" | "fallback" | "denied" | "error";
  text: string;
  actions?: ReplyAction[];
}
export interface AssistantMessage { id: string; role: "user" | "assistant"; text: string; actions?: ReplyAction[]; at: string }
```

`IntentDefinition = { id, tool, phrases: RegExp[], keywords: string[], buildArgs: (captures, ctx) => Record<string, unknown> }`.

---

## 4. Initial intent / tool table (Phase 1 starter set)

Grounded in queries that exist today. Every data tool scopes to the active store automatically because the underlying query functions already read `getActiveStoreId()`.

| Tool | Answers | Backing query (existing) | Args | Required permission | Example utterances |
|---|---|---|---|---|---|
| `profit_summary` | Revenue, COGS, gross profit, expenses, net profit, margin for a date or range | `fetchProfitLossReportData(from, to)` in `lib/db/queries/reports.ts` — sum the returned month rows' `"Revenue"`, `"COGS"`, `"Gross Profit"`, `"Expenses"`, `"Net Profit"` (they are `.toFixed(2)` strings; `Number()` them). Window via `toQueryRange()`. | `from`, `to` (date-only), `metric?: "gross" \| "net" \| "revenue" \| "expenses"` | `view_financial_reports` (same key `report-center.tsx` gates P&L on) | "how much gross profit did we make on 2026-09-01", "net profit this month", "what was revenue last week", "profit yesterday" |
| `sales_summary` | Store-wide sales total + transaction count for a date | `getSalesTotalsByPaymentMethod(date)` (sum `total`) + `getTransactionCountByDate(date)` in `lib/db/queries/sales.ts`; both take `YYYY-MM-DD`. Single-day only in Phase 1; a range utterance is answered with the first day and a pointer to Reports. | `date` | `view_reports` | "how many sales today", "total sales yesterday", "sales on 15/09/2026" |
| `my_sales_today` | The signed-in cashier's own sales today (count + net total) | `getRecentSales(user.id, { from: today, to: today })` + `calculateNetSaleAmount()` — identical to `lib/hooks/use-my-today-sales.ts`. | none | `process_sales` | "my sales today", "how much have I sold today" |
| `inventory_status` | Low-stock count, expiring-soon count, expired count; top-5 low-stock names | `getStockBatchStats(expiryDays)` + `getLowStockAlerts()` in `lib/db/queries/inventory.ts`. Combine `low_stock_count + critical_stock_count` exactly as `use-stock-batch-stats.ts` does. Include `total_stock_batch_value` **only if** `view_cost_fields`. | none | `view_dashboard` (stock value additionally gated by `view_cost_fields`) | "what's low on stock", "anything expiring soon", "inventory status" |
| `product_stock` | On-hand quantity (+ reorder level) for a named product | `getProductsWithStock()` (`lib/db/queries/products.ts`, returns `POSProduct[]` with `stock`, `reorder_level`) filtered by `searchProducts(term, products)` (`lib/utils/search.ts`). Top match answered; up to 3 alternates listed if fuzzy. | `product` | none (POS already shows stock to every role) | "how many paracetamol do we have", "is amoxicillin in stock", "stock of X" |
| `navigate_help` | Procedural "how do I / where do I" answers with a deep link | `help-catalog.ts` lookup (no DB). | `topic` | per-topic (from the catalog entry; defaults to none) | "how do I make a sale", "where do I add a product", "how do I record an expense", "how do I run daily close", "how do I add staff" |

**Routing disambiguation rules:**
- A sales-shaped utterance from a `sales_staff` user (no `view_reports`) routes to `my_sales_today` instead of being denied — matches the "cashier visibility gating" rule in `client/AGENTS.md`.
- `profit_summary` and `sales_summary` both accept a date phrase; the presence of profit/revenue/expense/margin keywords wins for `profit_summary`.
- No date phrase on a date-taking tool defaults to **today** and the reply says so ("Today, 29/09/2026: …").

**Initial `help-catalog.ts` topics (all deep links already exist):**

| Topic id | Link | Gate |
|---|---|---|
| `make_sale` | `/pos` | `process_sales` |
| `add_product` | `/inventory/catalog?action=add` | `manage_products` |
| `adjust_stock` | `/inventory/adjustments?action=create` | `adjust_stock_counts` |
| `start_audit` | `/inventory/audits` | `perform_stock_audit` |
| `record_expense` | `/expenses?action=add` | `record_expenses` |
| `add_customer` | `/customers?action=add` | `manage_customers` |
| `create_purchase_order` | `/procurement/new` | `manage_purchase_orders` |
| `daily_close` | `/reports?tab=daily_close` | none (tab visible to all) |
| `view_reports` | `/reports` | `view_reports` |
| `add_staff` | `/settings/staff` | via `canAccessSettingsTab("staff", isAdmin, hasKey)` |
| `receipt_settings` | `/settings/receipt-settings` | `manage_store_settings` |
| `backup_data` | `/settings/data` | `backup_restore_data` |
| `switch_account` | no link; describe the user menu | none |

A topic the user cannot reach still gets an answer ("This is done in Settings → Staff; you'll need the Manage Staff permission from your store owner") with no link — the "disabled-with-a-reason, not hidden" stance already used by the catalog context menu.

**No-match handling:** `kind: "fallback"` reply: "I didn't catch that. Try one of these:" + up to 5 permission-filtered examples as chips, plus a "Send feedback" action that opens the existing `FeedbackForm` (drive via the same `onOpenFeedback` callback the layout already owns — expose an `openFeedback` in the assistant store that the layout wires to `setFeedbackOpen(true)`).

**Ambiguity handling:** two equal-score intents → "Did you mean: [A] / [B]?" with each as a chip that re-sends a canonical phrasing.

---

## 5. Chat UI surface (kept deliberately minimal)

- **Invocation:** header icon next to the bell (all breakpoints); "Ask the assistant" entry in the account menu (desktop dropdown, sidebar user nav on POS, mobile More drawer) via `useAccountActions`.
- **Container:** `ResponsiveModal` with `title="Assistant"`, `description="Ask how to do something, or ask for a quick number."`. Desktop: `sm:max-w-lg`, body `h-[60vh]` flex column. Mobile: Drawer (the primitive handles it). Inherits the glassmorphism dialog styling already in `components/ui/dialog.tsx`; no new colours — only `bg-primary`, `bg-muted`, `text-muted-foreground`, `border-border`.
- **Body:** suggestion chips (empty state) → message list → composer pinned via the modal's `footer` slot so it can't scroll away on mobile.
- **Reply actions** are `Link`s rendered as `Button variant="outline" size="sm"`; clicking closes the panel (`close()` then navigate) so two dismissable layers never overlap (the `pointerEvents` gotcha documented in `client/AGENTS.md`).
- **Accessibility:** composer `aria-label="Ask the assistant"`, message list `role="log" aria-live="polite"`.
- Thread is cleared on logout/store switch: subscribe in `use-assistant.ts` to `user?.id`/`activeStoreId` changes and call `clear()` — a cashier must never see the previous user's answers.

---

## 6. Persistence, schema and cross-repo implications (`.agents/AGENTS.md` §5)

- **No new tables or columns.** Conversation state is in-memory Zustand only. Therefore: no `schema.ts` change, no `SYNC_COLUMN_MIGRATIONS`, no Laravel migration, no sync-engine coverage, `npm run test:schema` unaffected.
- **No `localStorage`** either in Phase 1 (would otherwise require a `STORAGE_KEYS` entry per the registry rule). If chat history persistence is ever wanted, that is a separate decision and must go through `STORAGE_KEYS`, not a table.
- **No `audit_logs` writes.** The roadmap's "log AI decisions" observability line would, if implemented via `logAction()`, create a syncable `audit_logs` row per question — churn with no user action behind it, and it conflicts with the sync indicator's "audit_logs-only batches don't trigger instant sync" reasoning. Phase 1 logs nothing; document this as a deliberate choice in `client/AGENTS.md`. Dev builds may `devLog` the resolved `ToolCall`.
- **No crash reporting from the router.** `router.ts` catches and returns `buildErrorReply()`; it must not call `logCrash()` (the `feedback`-table self-nesting incident A-27 is exactly why a chatty new path should not write feedback rows).

---

## 7. Implementation sequence (ordered; each step leaves the suite green)

1. **Types + normalize + date-phrases** (`types.ts`, `normalize.ts`, `date-phrases.ts`) with their unit tests. No UI yet.
2. **Intent matcher** (`intent-matcher.ts`) + tests for scoring, threshold, ambiguity, no-match.
3. **Tool registry + permission gate** (`tools/index.ts`, `permission-gate.ts`) with `navigate_help` + `help-catalog.ts` first (no DB), so the router is end-to-end testable without sql.js.
4. **`router.ts` + `intent-router-brain.ts`** + router tests with a stubbed tool.
5. **Data tools** in this order: `product_stock` → `inventory_status` → `my_sales_today` → `sales_summary` → `profit_summary`. Each with a sql.js-backed test (see §8) before moving on.
6. **`reply-formatters.ts` + `fallback-replies.ts`**; assertion tests on the text (currency and DD/MM/YYYY formatting).
7. **Zustand store + `use-assistant.ts`**.
8. **UI components** (`components/assistant/*`), then the three small edits (`dashboard-layout.tsx`, `dashboard-header.tsx`, `use-account-actions.ts`).
9. **Browser smoke test** in the dev server: open from header on desktop, from More drawer on a narrow viewport, ask each example, follow a link, confirm the panel closes and navigation lands. Verify as a `sales_staff` login that profit questions are denied politely and "my sales today" works.
10. **E2E spec** `e2e/assistant.spec.ts`.
11. **Docs** (§9) in the same change. Run `npm run lint`, `npx tsc --noEmit -p .`, `npx vitest run`, and `knip` (`lib/assistant/**` is not in the knip ignore list, so every export must have a consumer).

---

## 8. Test plan (`.agents/AGENTS.md` §9 — data-returning tools are a calculation path and must be covered)

Unit (Vitest, `client/__tests__/`, TZ pinned to `Africa/Lagos` by `vitest.config.ts` — rely on it, never on host TZ):

- `assistant-normalize.test.ts` — punctuation/whitespace/case; keeps `2026-09-01` and `15/09/2026` intact.
- `assistant-date-phrases.test.ts` — injected `now`; today/yesterday/this month/last month/ISO/DD-MM-YYYY/"from … to …"; month-boundary case (e.g. `now = 2026-10-01T00:30 local` → "yesterday" is `2026-09-30`); invalid `31/02/2026` → null.
- `assistant-intent-matcher.test.ts` — each example utterance in §4 resolves to its tool; profit-vs-sales keyword precedence; tie → ambiguous; gibberish → none; threshold not met on a single stray keyword.
- `assistant-permission-gate.test.ts` — for each `DEFAULT_GROUP_PERMISSIONS` role (`lib/constants/permissions.ts`), which tools are allowed/denied; `store_owner` always allowed; `sales_staff` sales question re-routes to `my_sales_today`.
- `assistant-finance-tool.test.ts` — **real sql.js**, same harness as `__tests__/finance-reports.test.ts` (`initSqlJs`, `SCHEMA_SQL`, `core.__setDatabaseForTesting(db)`): seed sales/sale_items/returns/expenses across two days; assert `profit_summary` for one day equals the sum of `fetchProfitLossReportData` rows for the same `toQueryRange` window (consistency with the Report Center is the invariant), and assert the literal expected gross/net numbers including a refund and a prepaid expense.
- `assistant-sales-tools.test.ts` — sql.js: `sales_summary` count/total for a date; `my_sales_today` restricted to `user.id`; a sale at `23:30Z` on the previous UTC day lands on the correct local day.
- `assistant-inventory-tools.test.ts` — sql.js: low-stock count includes critical (qty 0) items; expiring-soon respects `expiryWarningDays`; stock value omitted without `view_cost_fields`; `product_stock` exact/fuzzy match and "not found".
- `assistant-router.test.ts` — end-to-end with a stubbed tool map: thrown tool error → `kind: "error"` reply, no throw; denied → `kind: "denied"`; none → fallback lists only permitted examples.
- `assistant-panel.test.tsx` — renders chips for the role, sends a message, shows reply and an action link; clicking the link closes the panel. Mock `useAuth`/`useStore` as sibling UI tests do.

E2E (Playwright, `e2e/assistant.spec.ts`, using `e2e/fixtures.ts`): open from header, ask "how do I make a sale" → link to `/pos`; ask "what's low on stock" → a numeric answer; navigate via sidebar clicks, not `page.goto`.

---

## 9. Documentation follow-through (`.agents/AGENTS.md` §2 — ships in the same change)

- **`client/AGENTS.md`**: new section "In-app assistant (intent router)" covering: the brain/tool split and the `AssistantBrain` seam, why Phase 1 is deterministic and offline, the permission-reuse decision (no new keys), the no-persistence / no-audit-log / no-`logCrash` decisions from §6, the date-defaulting rule, and the test harness. Add `lib/assistant/` and `components/assistant/` to the Directory map, and a "Current focus / recent work" entry.
- **`docs/FEATURE_ROADMAP_SPEC.md`**: amend "AI Assistant Module" — Phase 1 (offline intent router) is done; the Gemini/LLM proposal becomes an explicit future phase that must reuse `lib/assistant/tools/`. Do not delete the entry, since the LLM part is still roadmap.
- **`docs/SYSTEM_FEATURES_DOCUMENTATION.md`**: add "In-app Assistant" under "2. The Desktop POS App" (works offline, procedural help + live numbers, permission-aware).
- **`lib/constants/permissions.ts`**: extend the call-site comments in `ENFORCED_PERMISSION_KEYS` for keys the tools reuse.

---

## 10. Risks / things to watch

- `fetchProfitLossReportData` returns per-month rows and string amounts; summing across months for a multi-month range is fine but margin must be recomputed (`net / revenue`), not averaged.
- `getBIMetrics` was considered for `profit_summary` and rejected for Phase 1: it fans out ~22 queries and defines net differently (ex-VAT refunds, returned-COGS netting) from the exported P&L; the assistant should match the report the user can open, not a second definition. Note this in `client/AGENTS.md`.
- `getLowStockAlerts()` is `LIMIT 5` by design; the reply says "top 5 of N".
- `getProductsWithStock()` returns the whole catalog (~1900 rows on a large store) — acceptable for an on-demand question, but the reply must not be re-run on every keystroke; only on send.
- Keep `intents/*` regexes anchored on phrases, not bare nouns, or "sale" in "how do I refund a sale" will misroute to `sales_summary`; the matcher tests should include such negative cases.

---

### Critical files for implementation

- `client/lib/db/queries/reports.ts` (`fetchProfitLossReportData`, the P&L definition the `profit_summary` tool must match)
- `client/lib/hooks/use-permissions.ts` (pure `hasPermission()` used by the tool permission gate)
- `client/lib/constants/dashboard-page-routes.ts` (route/deep-link source for `help-catalog.ts`; also `lib/constants/settings-tabs.ts` for settings gating)
- `client/components/dashboard/dashboard-layout.tsx` (global mount point for the panel; `dashboard-header.tsx` for the launcher)
- `client/__tests__/finance-reports.test.ts` (the sql.js harness pattern every data-tool test copies)
