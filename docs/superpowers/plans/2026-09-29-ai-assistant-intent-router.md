# AI Assistant (Intent Router) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an offline, zero-cost, zero-API-key in-app assistant in `client/` that answers natural-language questions ("how do I make a sale", "gross profit this month") by matching them to a fixed set of permission-gated tools built on existing query functions, and surface it as a chat panel reachable from every platform (Tauri desktop + PWA, mobile + desktop).

**Architecture:** A deterministic pipeline — `normalize → matchIntent → build ToolCall → authorize → execute tool → format reply` — lives in `client/lib/assistant/`. A `AssistantBrain` interface separates the keyword-matching "brain" from a brain-agnostic `AssistantTool` registry so a future LLM brain could reuse the same tools untouched. No new DB tables, no network calls, no persisted chat history.

**Tech Stack:** TypeScript, React/Next.js, Zustand, Vitest + sql.js (existing patterns), Playwright (existing `e2e/fixtures.ts`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-ai-assistant-intent-router-design.md`

## Global Constraints

- No paid APIs, no API keys — Phase 1 must work fully offline with zero network dependency and zero recurring cost.
- No LLM, no model download — pure pattern/keyword matching only.
- All platforms — Tauri desktop AND PWA (mobile + desktop browser); no platform gating anywhere in the code.
- No new SQLite tables/columns, no `schema.ts` change, no sync-engine coverage needed (per `.agents/AGENTS.md` §5) — conversation state is in-memory only.
- No `localStorage` persistence of chat history in Phase 1.
- No `audit_logs` writes and no `logCrash()` calls from the assistant path — errors return a `buildErrorReply()` and log via `devLog` only.
- Every new file stays under 350 lines (`.agents/AGENTS.md` §4); no inline comments beyond a 2-line hack exception (`.agents/AGENTS.md` §3).
- No hardcoded colors — only semantic theme tokens (`bg-primary`, `bg-muted`, `text-muted-foreground`, `border-border`) (`.agents/AGENTS.md` §6).
- `profit_summary` must match the numbers a user sees in Report Center (`fetchProfitLossReportData`), not `getBIMetrics`'s different net-profit definition.
- Tool registry is a `Map`, never a plain object indexed by a user-derived key (`.agents/AGENTS.md` §8, prototype-pollution rule).
- Data-returning tools are a calculation/data-integrity path and must have automated test coverage (`.agents/AGENTS.md` §9).

## Review Focus

- **A cashier (`sales_staff`, no `view_reports`) asks a sales question** — the router must not deny them outright; it should re-route to `my_sales_today` instead of showing a permission error, matching the existing cashier-visibility convention. Covered in Task 5's permission-gate tests and Task 9's tool test.
- **An utterance contains a tool's keyword as a false-positive substring** — e.g. "how do I refund a **sale**" must resolve to `navigate_help`, not `sales_summary`, because "sale" alone is a weak signal. Covered in Task 3's matcher tests with an explicit negative case.
- **No date phrase given on a date-taking tool** — must default to *today* and say so in the reply, not throw or return an empty range. Covered in Task 2 and Task 10/11's tool tests.
- **User switches store or logs out mid-conversation** — stale answers from the previous user/store must not remain visible in the panel. Covered in Task 13's hook test (thread clears on `user.id`/`activeStoreId` change).
- **A tool throws (e.g. a query error)** — the router must catch it and return a graceful `error` reply, never crash the panel or silently swallow with no message. Covered in Task 6's router test.

---

## File Structure

```
client/lib/assistant/
  types.ts                    # shared types (Task 1)
  normalize.ts                 # utterance normalization (Task 1)
  date-phrases.ts               # date phrase parsing (Task 2)
  intent-matcher.ts             # scoring/matching (Task 3)
  help-catalog.ts                # procedural help topics (Task 4)
  intents/
    navigation-intents.ts        # (Task 4)
    inventory-intents.ts          # (Task 8)
    sales-intents.ts               # (Task 9, 10)
    finance-intents.ts              # (Task 11)
    index.ts                         # INTENTS[] aggregate (Task 4, extended per task)
  tools/
    navigation-tools.ts           # navigate_help (Task 4)
    inventory-tools.ts             # product_stock, inventory_status (Task 7, 8)
    sales-tools.ts                  # my_sales_today, sales_summary (Task 9, 10)
    finance-tools.ts                 # profit_summary (Task 11)
    index.ts                          # TOOL_REGISTRY Map (Task 5, extended per task)
  permission-gate.ts             # authorizeToolCall (Task 5)
  reply-formatters.ts             # formatReply (Task 12)
  fallback-replies.ts              # no-match/ambiguous/denied/error replies (Task 12)
  router-reroutes.ts                # REROUTE_ON_DENIAL map (Task 6, filled in Task 10)
  intent-router-brain.ts             # IntentRouterBrain (Task 6)
  router.ts                           # answer() orchestration (Task 6)

client/lib/store/use-assistant-panel.ts   # Zustand store (Task 13)
client/lib/hooks/use-assistant.ts          # send()/isThinking hook (Task 13)

client/components/assistant/
  assistant-panel.tsx             # (Task 14)
  assistant-message-list.tsx       # (Task 14)
  assistant-composer.tsx            # (Task 14)
  assistant-suggestion-chips.tsx     # (Task 14)
  assistant-launcher.tsx              # (Task 14)

client/__tests__/
  assistant-normalize.test.ts
  assistant-date-phrases.test.ts
  assistant-intent-matcher.test.ts
  assistant-permission-gate.test.ts
  assistant-router.test.ts
  assistant-inventory-tools.test.ts
  assistant-sales-tools.test.ts
  assistant-finance-tool.test.ts
  assistant-panel.test.tsx

client/e2e/assistant.spec.ts

Modified:
  client/components/dashboard/dashboard-layout.tsx     (mount AssistantPanel)
  client/components/dashboard/dashboard-header.tsx      (mount AssistantLauncher)
  client/lib/hooks/use-account-actions.ts                (add "Ask the assistant" NavAction)
  client/lib/constants/permissions.ts                     (call-site comments only)
  client/AGENTS.md                                          (new section)
  docs/FEATURE_ROADMAP_SPEC.md                               (amend AI Assistant Module entry)
  docs/SYSTEM_FEATURES_DOCUMENTATION.md                       (new entry)
```

---

## Task 1: Core types + utterance normalization

**Files:**
- Create: `client/lib/assistant/types.ts`
- Create: `client/lib/assistant/normalize.ts`
- Test: `client/__tests__/assistant-normalize.test.ts`

**Interfaces:**
- Produces (used by every later task):
  ```ts
  export type StoreType = "pharmacy" | "general" | "restaurant" | string; // matches existing StoreType from store-context

  export interface ToolContext {
    user: { id: string; role: string; store_id?: string | null } | null;
    permissionGroup: { permissions: string[] } | null;
    currencyCode?: string;
    expiryWarningDays: number;
    storeType: StoreType;
    t: (key: string) => string;
    now: Date;
  }

  export interface ReplyAction { label: string; href: string }

  export interface AssistantReply {
    kind: "answer" | "help" | "fallback" | "denied" | "error";
    text: string;
    actions?: ReplyAction[];
  }

  export interface AssistantMessage {
    id: string;
    role: "user" | "assistant";
    text: string;
    actions?: ReplyAction[];
    at: string;
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

  export interface AssistantBrain {
    resolve(utterance: string, ctx: ToolContext): BrainOutcome;
  }

  export interface IntentDefinition {
    id: string;
    tool: string;
    phrases: RegExp[];
    keywords: string[];
    buildArgs: (captures: Record<string, string>, ctx: ToolContext) => Record<string, unknown>;
  }

  export interface NormalizedUtterance {
    raw: string;
    normalized: string;
    tokens: string[];
  }

  export function normalizeUtterance(text: string): NormalizedUtterance;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// client/__tests__/assistant-normalize.test.ts
import { describe, it, expect } from "vitest";
import { normalizeUtterance } from "@/lib/assistant/normalize";

describe("normalizeUtterance", () => {
  it("lowercases and collapses whitespace", () => {
    const result = normalizeUtterance("  How much GROSS profit   did we make?  ");
    expect(result.normalized).toBe("how much gross profit did we make");
    expect(result.tokens).toEqual(["how", "much", "gross", "profit", "did", "we", "make"]);
  });

  it("keeps ISO dates and DD/MM/YYYY dates intact", () => {
    const result = normalizeUtterance("profit on 2026-09-01 and stock on 15/09/2026?");
    expect(result.normalized).toContain("2026-09-01");
    expect(result.normalized).toContain("15/09/2026");
  });

  it("strips punctuation that is not part of a date", () => {
    const result = normalizeUtterance("What's low on stock, exactly!!");
    expect(result.normalized).toBe("whats low on stock exactly");
  });

  it("preserves the raw input untouched", () => {
    const result = normalizeUtterance("  Hello World  ");
    expect(result.raw).toBe("  Hello World  ");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/assistant-normalize.test.ts`
Expected: FAIL — `Cannot find module '@/lib/assistant/normalize'`

- [ ] **Step 3: Write the types file**

```ts
// client/lib/assistant/types.ts
export type StoreType = string;

export interface ToolContext {
  user: { id: string; role: string; store_id?: string | null } | null;
  permissionGroup: { permissions: string[] } | null;
  currencyCode?: string;
  expiryWarningDays: number;
  storeType: StoreType;
  t: (key: string) => string;
  now: Date;
}

export interface ReplyAction {
  label: string;
  href: string;
}

export interface AssistantReply {
  kind: "answer" | "help" | "fallback" | "denied" | "error";
  text: string;
  actions?: ReplyAction[];
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions?: ReplyAction[];
  at: string;
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

export type ToolCall = {
  tool: string;
  args: Record<string, unknown>;
};

export type BrainOutcome =
  | { kind: "call"; call: ToolCall }
  | { kind: "ambiguous"; candidates: ToolCall[] }
  | { kind: "none" };

export interface AssistantBrain {
  resolve(utterance: string, ctx: ToolContext): BrainOutcome;
}

export interface IntentDefinition {
  id: string;
  tool: string;
  phrases: RegExp[];
  keywords: string[];
  buildArgs: (captures: Record<string, string>, ctx: ToolContext) => Record<string, unknown>;
}

export interface NormalizedUtterance {
  raw: string;
  normalized: string;
  tokens: string[];
}
```

- [ ] **Step 4: Write the minimal implementation**

```ts
// client/lib/assistant/normalize.ts
import type { NormalizedUtterance } from "./types";

const DATE_SAFE_PUNCTUATION = /[^a-z0-9\s/-]/g;

export function normalizeUtterance(text: string): NormalizedUtterance {
  const lowered = text.toLowerCase();
  const stripped = lowered.replace(DATE_SAFE_PUNCTUATION, "");
  const normalized = stripped.replace(/\s+/g, " ").trim();
  const tokens = normalized.length > 0 ? normalized.split(" ") : [];

  return { raw: text, normalized, tokens };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/assistant-normalize.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/lib/assistant/types.ts client/lib/assistant/normalize.ts client/__tests__/assistant-normalize.test.ts
git commit -m "feat: add assistant types and utterance normalization"
```

---

## Task 2: Date phrase parsing

**Files:**
- Create: `client/lib/assistant/date-phrases.ts`
- Test: `client/__tests__/assistant-date-phrases.test.ts`

**Interfaces:**
- Consumes: nothing new (uses native `Date` only; deliberately does NOT import `parseDDMMYYYYToDate` because that function expects an already-isolated `DD/MM/YYYY` string and Phase 1 needs to *find* such a substring inside a full sentence first — the plan keeps its own tiny regex parser to avoid depending on a function that returns `null` for partial matches).
- Produces (used by Task 6, 9, 10, 11):
  ```ts
  export interface DatePhraseResult { from: string; to: string; label: string }
  export function parseDatePhrase(text: string, now: Date): DatePhraseResult | null;
  export function toDateOnly(d: Date): string; // "YYYY-MM-DD"
  ```

- [ ] **Step 1: Write the failing test**

```ts
// client/__tests__/assistant-date-phrases.test.ts
import { describe, it, expect } from "vitest";
import { parseDatePhrase } from "@/lib/assistant/date-phrases";

const NOW = new Date(2026, 8, 29, 14, 30, 0); // 29 Sep 2026, local time

describe("parseDatePhrase", () => {
  it("resolves 'today'", () => {
    expect(parseDatePhrase("sales today", NOW)).toEqual({
      from: "2026-09-29",
      to: "2026-09-29",
      label: "today",
    });
  });

  it("resolves 'yesterday'", () => {
    expect(parseDatePhrase("profit yesterday", NOW)).toEqual({
      from: "2026-09-28",
      to: "2026-09-28",
      label: "yesterday",
    });
  });

  it("resolves 'yesterday' correctly across a month boundary", () => {
    const firstOfMonth = new Date(2026, 9, 1, 0, 30, 0); // 1 Oct 2026, 00:30 local
    expect(parseDatePhrase("sales yesterday", firstOfMonth)).toEqual({
      from: "2026-09-30",
      to: "2026-09-30",
      label: "yesterday",
    });
  });

  it("resolves 'this month'", () => {
    expect(parseDatePhrase("gross profit this month", NOW)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
      label: "this month",
    });
  });

  it("resolves 'last month'", () => {
    expect(parseDatePhrase("net profit last month", NOW)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
      label: "last month",
    });
  });

  it("resolves an ISO date", () => {
    expect(parseDatePhrase("profit on 2026-09-01", NOW)).toEqual({
      from: "2026-09-01",
      to: "2026-09-01",
      label: "2026-09-01",
    });
  });

  it("resolves a DD/MM/YYYY date", () => {
    expect(parseDatePhrase("sales on 15/09/2026", NOW)).toEqual({
      from: "2026-09-15",
      to: "2026-09-15",
      label: "15/09/2026",
    });
  });

  it("resolves 'from X to Y'", () => {
    expect(parseDatePhrase("profit from 2026-09-01 to 2026-09-10", NOW)).toEqual({
      from: "2026-09-01",
      to: "2026-09-10",
      label: "2026-09-01 to 2026-09-10",
    });
  });

  it("returns null for an invalid date like 31/02/2026", () => {
    expect(parseDatePhrase("sales on 31/02/2026", NOW)).toBeNull();
  });

  it("returns null when no date phrase is present", () => {
    expect(parseDatePhrase("what's low on stock", NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/assistant-date-phrases.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the minimal implementation**

```ts
// client/lib/assistant/date-phrases.ts
export interface DatePhraseResult {
  from: string;
  to: string;
  label: string;
}

export function toDateOnly(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function monthRange(d: Date, monthOffset: number): { from: string; to: string } {
  const first = new Date(d.getFullYear(), d.getMonth() + monthOffset, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + monthOffset + 1, 0);
  return { from: toDateOnly(first), to: toDateOnly(last) };
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const DD_MM_YYYY = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;
const RANGE_PHRASE = /\bfrom\s+(.+?)\s+to\s+(.+?)\b/;

function parseSingleDateToken(token: string): { iso: string; label: string } | null {
  const iso = token.match(ISO_DATE);
  if (iso) {
    const [, y, m, d] = iso;
    if (!isValidCalendarDate(Number(y), Number(m), Number(d))) return null;
    return { iso: `${y}-${m}-${d}`, label: `${y}-${m}-${d}` };
  }

  const ddmmyyyy = token.match(DD_MM_YYYY);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    if (!isValidCalendarDate(Number(y), Number(m), Number(d))) return null;
    return { iso: `${y}-${m}-${d}`, label: `${d}/${m}/${y}` };
  }

  return null;
}

export function parseDatePhrase(text: string, now: Date): DatePhraseResult | null {
  const rangeMatch = text.match(RANGE_PHRASE);
  if (rangeMatch) {
    const from = parseSingleDateToken(rangeMatch[1]);
    const to = parseSingleDateToken(rangeMatch[2]);
    if (from && to) {
      return { from: from.iso, to: to.iso, label: `${from.label} to ${to.label}` };
    }
    return null;
  }

  if (/\btoday\b/.test(text)) {
    const today = toDateOnly(now);
    return { from: today, to: today, label: "today" };
  }

  if (/\byesterday\b/.test(text)) {
    const yesterday = toDateOnly(addDays(now, -1));
    return { from: yesterday, to: yesterday, label: "yesterday" };
  }

  if (/\blast\s+month\b/.test(text)) {
    const range = monthRange(now, -1);
    return { ...range, label: "last month" };
  }

  if (/\bthis\s+month\b/.test(text)) {
    const range = monthRange(now, 0);
    return { ...range, label: "this month" };
  }

  const single = parseSingleDateToken(text);
  if (single) {
    return { from: single.iso, to: single.iso, label: single.label };
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/assistant-date-phrases.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/lib/assistant/date-phrases.ts client/__tests__/assistant-date-phrases.test.ts
git commit -m "feat: add date phrase parsing for the assistant"
```

---

## Task 3: Intent matcher

**Files:**
- Create: `client/lib/assistant/intent-matcher.ts`
- Test: `client/__tests__/assistant-intent-matcher.test.ts`

**Interfaces:**
- Consumes: `IntentDefinition` from `./types` (Task 1).
- Produces (used by Task 6):
  ```ts
  export type MatchOutcome =
    | { kind: "match"; intent: IntentDefinition; captures: Record<string, string> }
    | { kind: "ambiguous"; candidates: IntentDefinition[] }
    | { kind: "none" };

  export function matchIntent(normalized: string, intents: IntentDefinition[]): MatchOutcome;
  ```
  Scoring: each matched `phrase` regex contributes 3 points, each matched `keyword` (whole-word match via `\b`) contributes 1 point. Threshold to count as a match is 3. If the two highest-scoring intents (score >= 3) tie, return `ambiguous`.

- [ ] **Step 1: Write the failing test**

```ts
// client/__tests__/assistant-intent-matcher.test.ts
import { describe, it, expect } from "vitest";
import { matchIntent } from "@/lib/assistant/intent-matcher";
import type { IntentDefinition } from "@/lib/assistant/types";

function intent(id: string, tool: string, phrases: RegExp[], keywords: string[]): IntentDefinition {
  return { id, tool, phrases, keywords, buildArgs: () => ({}) };
}

const SALES_INTENT = intent(
  "sales_summary",
  "sales_summary",
  [/\btotal sales\b/, /\bhow many sales\b/],
  ["sales", "sold"],
);

const NAV_REFUND_INTENT = intent(
  "navigate_refund",
  "navigate_help",
  [/\bhow do i refund\b/, /\brefund a sale\b/],
  ["refund"],
);

const PROFIT_INTENT = intent(
  "profit_summary",
  "profit_summary",
  [/\bgross profit\b/, /\bnet profit\b/],
  ["profit", "margin"],
);

const INTENTS = [SALES_INTENT, NAV_REFUND_INTENT, PROFIT_INTENT];

describe("matchIntent", () => {
  it("matches a clear phrase hit", () => {
    const result = matchIntent("how many sales today", INTENTS);
    expect(result).toEqual({ kind: "match", intent: SALES_INTENT, captures: {} });
  });

  it("matches on keyword accumulation reaching the threshold", () => {
    const result = matchIntent("gross profit and margin", INTENTS);
    expect(result.kind).toBe("match");
    if (result.kind === "match") expect(result.intent.id).toBe("profit_summary");
  });

  it("routes a refund question to navigate_help, not sales_summary, despite the word 'sale'", () => {
    const result = matchIntent("how do i refund a sale", INTENTS);
    expect(result.kind).toBe("match");
    if (result.kind === "match") expect(result.intent.id).toBe("navigate_refund");
  });

  it("returns none when no intent reaches the threshold", () => {
    const result = matchIntent("sold", INTENTS); // single keyword, only 1 point
    expect(result).toEqual({ kind: "none" });
  });

  it("returns none for a completely unrelated utterance", () => {
    expect(matchIntent("what is the weather today", INTENTS)).toEqual({ kind: "none" });
  });

  it("returns ambiguous when two intents tie at the top score", () => {
    const tiedA = intent("a", "tool_a", [/\bfoo bar\b/], []);
    const tiedB = intent("b", "tool_b", [/\bfoo bar\b/], []);
    const result = matchIntent("foo bar", [tiedA, tiedB]);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates.map((c) => c.id).sort()).toEqual(["a", "b"]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/assistant-intent-matcher.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the minimal implementation**

```ts
// client/lib/assistant/intent-matcher.ts
import type { IntentDefinition } from "./types";

export type MatchOutcome =
  | { kind: "match"; intent: IntentDefinition; captures: Record<string, string> }
  | { kind: "ambiguous"; candidates: IntentDefinition[] }
  | { kind: "none" };

const MATCH_THRESHOLD = 3;
const PHRASE_SCORE = 3;
const KEYWORD_SCORE = 1;

function scoreIntent(normalized: string, intent: IntentDefinition): { score: number; captures: Record<string, string> } {
  let score = 0;
  let captures: Record<string, string> = {};

  for (const phrase of intent.phrases) {
    const match = normalized.match(phrase);
    if (match) {
      score += PHRASE_SCORE;
      if (match.groups) captures = { ...captures, ...match.groups };
    }
  }

  for (const keyword of intent.keywords) {
    const pattern = new RegExp(`\\b${keyword}\\b`);
    if (pattern.test(normalized)) score += KEYWORD_SCORE;
  }

  return { score, captures };
}

export function matchIntent(normalized: string, intents: IntentDefinition[]): MatchOutcome {
  const scored = intents
    .map((intent) => ({ intent, ...scoreIntent(normalized, intent) }))
    .filter((entry) => entry.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { kind: "none" };

  const topScore = scored[0].score;
  const topEntries = scored.filter((entry) => entry.score === topScore);

  if (topEntries.length > 1) {
    return { kind: "ambiguous", candidates: topEntries.map((entry) => entry.intent) };
  }

  return { kind: "match", intent: topEntries[0].intent, captures: topEntries[0].captures };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/assistant-intent-matcher.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/lib/assistant/intent-matcher.ts client/__tests__/assistant-intent-matcher.test.ts
git commit -m "feat: add keyword/phrase intent matcher for the assistant"
```

---

## Task 4: Help catalog, navigation intents/tool, and INTENTS/TOOL_REGISTRY scaffolding

**Files:**
- Create: `client/lib/assistant/help-catalog.ts`
- Create: `client/lib/assistant/intents/navigation-intents.ts`
- Create: `client/lib/assistant/intents/index.ts`
- Create: `client/lib/assistant/tools/navigation-tools.ts`
- Create: `client/lib/assistant/tools/index.ts`
- Test: `client/__tests__/assistant-navigation-tool.test.ts`

**Interfaces:**
- Consumes: `PAGE_ROUTES` from `@/lib/constants/dashboard-page-routes`, `SETTINGS_TAB_PERMISSIONS`/`canAccessSettingsTab` from `@/lib/constants/settings-tabs`, `hasPermission` from `@/lib/hooks/use-permissions`, `AssistantTool`/`ToolContext`/`AssistantReply`/`IntentDefinition` from `../types` (Task 1).
- Produces (used by Task 5, 6, and every later tool task, which each append to `INTENTS` and `TOOL_REGISTRY`):
  ```ts
  export interface HelpTopic {
    id: string;
    title: string;
    href: string | null;
    steps: string[];
    keywords: string[];
    requiredPermission?: string;
  }
  export const HELP_TOPICS: HelpTopic[];

  export const NAVIGATION_INTENTS: IntentDefinition[];
  export const navigateHelpTool: AssistantTool<{ topic: string }, HelpTopic | null>;

  // intents/index.ts
  export const INTENTS: IntentDefinition[]; // starts as [...NAVIGATION_INTENTS], grows in later tasks

  // tools/index.ts
  export const TOOL_REGISTRY: ReadonlyMap<string, AssistantTool>; // starts with navigate_help, grows in later tasks
  ```

- [ ] **Step 1: Write the failing test**

```ts
// client/__tests__/assistant-navigation-tool.test.ts
import { describe, it, expect } from "vitest";
import { navigateHelpTool } from "@/lib/assistant/tools/navigation-tools";
import { HELP_TOPICS } from "@/lib/assistant/help-catalog";
import type { ToolContext } from "@/lib/assistant/types";

const ctx: ToolContext = {
  user: { id: "u1", role: "store_owner" },
  permissionGroup: { permissions: [] },
  currencyCode: "NGN",
  expiryWarningDays: 90,
  storeType: "pharmacy",
  t: (k) => k,
  now: new Date(2026, 8, 29),
};

describe("navigateHelpTool", () => {
  it("finds the make_sale topic and returns its href", async () => {
    const topic = HELP_TOPICS.find((t) => t.id === "make_sale")!;
    const result = await navigateHelpTool.execute({ topic: "make_sale" }, ctx);
    const reply = navigateHelpTool.format(result, { topic: "make_sale" }, ctx);
    expect(reply.kind).toBe("help");
    expect(reply.actions?.[0]).toEqual({ label: topic.title, href: topic.href });
  });

  it("returns a reply with no link for a topic the user lacks permission for, when denied elsewhere", async () => {
    const result = await navigateHelpTool.execute({ topic: "add_staff" }, ctx);
    expect(result?.id).toBe("add_staff");
  });

  it("returns null for an unknown topic id", async () => {
    const result = await navigateHelpTool.execute({ topic: "not_a_real_topic" }, ctx);
    expect(result).toBeNull();
    const reply = navigateHelpTool.format(result, { topic: "not_a_real_topic" }, ctx);
    expect(reply.kind).toBe("fallback");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/assistant-navigation-tool.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write `help-catalog.ts`**

```ts
// client/lib/assistant/help-catalog.ts
export interface HelpTopic {
  id: string;
  title: string;
  href: string | null;
  steps: string[];
  keywords: string[];
  requiredPermission?: string;
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "make_sale",
    title: "Make a sale",
    href: "/pos",
    steps: ["Open POS", "Search or scan the product", "Add it to the cart", "Tap Charge and choose a payment method"],
    keywords: ["sale", "sell", "checkout", "pos"],
    requiredPermission: "process_sales",
  },
  {
    id: "add_product",
    title: "Add a product",
    href: "/inventory/catalog?action=add",
    steps: ["Go to Inventory > Catalog", "Tap Add Product", "Fill in the product details and save"],
    keywords: ["add product", "new product", "create product"],
    requiredPermission: "manage_products",
  },
  {
    id: "adjust_stock",
    title: "Adjust stock",
    href: "/inventory/adjustments?action=create",
    steps: ["Go to Inventory > Adjustments", "Tap New Adjustment", "Select the product and enter the correction"],
    keywords: ["adjust stock", "correct stock", "stock adjustment"],
    requiredPermission: "adjust_stock_counts",
  },
  {
    id: "start_audit",
    title: "Start a stock audit",
    href: "/inventory/audits",
    steps: ["Go to Inventory > Audits", "Tap Start Audit", "Count and confirm each product"],
    keywords: ["stock audit", "stocktake", "count stock"],
    requiredPermission: "perform_stock_audit",
  },
  {
    id: "record_expense",
    title: "Record an expense",
    href: "/expenses?action=add",
    steps: ["Go to Expenses", "Tap Add Expense", "Enter the amount, category, and date"],
    keywords: ["record expense", "add expense", "log expense"],
    requiredPermission: "record_expenses",
  },
  {
    id: "add_customer",
    title: "Add a customer",
    href: "/customers?action=add",
    steps: ["Go to Customers", "Tap Add Customer", "Fill in their details and save"],
    keywords: ["add customer", "new customer"],
    requiredPermission: "manage_customers",
  },
  {
    id: "create_purchase_order",
    title: "Create a purchase order",
    href: "/procurement/new",
    steps: ["Go to Procurement", "Tap New Purchase Order", "Select a supplier and add line items"],
    keywords: ["purchase order", "reorder from supplier", "procurement"],
    requiredPermission: "manage_purchase_orders",
  },
  {
    id: "daily_close",
    title: "Run daily close",
    href: "/reports?tab=daily_close",
    steps: ["Go to Reports > Daily Close", "Review the summary", "Confirm to close the day"],
    keywords: ["daily close", "close the day", "end of day"],
  },
  {
    id: "view_reports",
    title: "View reports",
    href: "/reports",
    steps: ["Go to Reports from the sidebar", "Choose a report tab (Sales, Finance, Daily Close)"],
    keywords: ["view reports", "see reports", "reports page"],
    requiredPermission: "view_reports",
  },
  {
    id: "add_staff",
    title: "Add a staff member",
    href: "/settings/staff",
    steps: ["Go to Settings > Staff", "Tap Add Staff", "Set their name, PIN, and permission group"],
    keywords: ["add staff", "new staff", "add employee", "add cashier"],
    requiredPermission: "manage_store_settings",
  },
  {
    id: "receipt_settings",
    title: "Change receipt settings",
    href: "/settings/receipt-settings",
    steps: ["Go to Settings > Receipt Settings", "Edit the receipt header/footer text or logo"],
    keywords: ["receipt settings", "receipt logo", "receipt footer"],
    requiredPermission: "manage_store_settings",
  },
  {
    id: "backup_data",
    title: "Back up or restore data",
    href: "/settings/data",
    steps: ["Go to Settings > Data", "Choose Backup or Restore"],
    keywords: ["backup data", "restore data", "export data"],
    requiredPermission: "backup_restore_data",
  },
  {
    id: "switch_account",
    title: "Switch account",
    href: null,
    steps: ["Open the account menu (top right / user icon)", "Choose Switch Account"],
    keywords: ["switch account", "change user", "log in as someone else"],
  },
];
```

- [ ] **Step 4: Write `intents/navigation-intents.ts`**

```ts
// client/lib/assistant/intents/navigation-intents.ts
import type { IntentDefinition } from "../types";
import { HELP_TOPICS } from "../help-catalog";

export const NAVIGATION_INTENTS: IntentDefinition[] = HELP_TOPICS.map((topic) => ({
  id: `navigate_${topic.id}`,
  tool: "navigate_help",
  phrases: [
    new RegExp(`\\bhow do i ${escapeRegex(topic.keywords[0])}\\b`),
    new RegExp(`\\bwhere (do i|can i) ${escapeRegex(topic.keywords[0])}\\b`),
  ],
  keywords: topic.keywords,
  buildArgs: () => ({ topic: topic.id }),
}));

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 5: Write `tools/navigation-tools.ts`**

```ts
// client/lib/assistant/tools/navigation-tools.ts
import type { AssistantTool, ReplyAction } from "../types";
import { HELP_TOPICS, type HelpTopic } from "../help-catalog";

export const navigateHelpTool: AssistantTool<{ topic: string }, HelpTopic | null> = {
  name: "navigate_help",
  description: "Explains how to do something in the app and links to the right screen.",
  parameters: { topic: { type: "string", description: "The help topic id", required: true } },
  examples: HELP_TOPICS.map((t) => `how do i ${t.keywords[0]}`),
  execute: async ({ topic }) => HELP_TOPICS.find((t) => t.id === topic) ?? null,
  format: (result) => {
    if (!result) {
      return { kind: "fallback", text: "I don't have help for that yet." };
    }

    const actions: ReplyAction[] = result.href ? [{ label: result.title, href: result.href }] : [];
    return {
      kind: "help",
      text: `${result.title}: ${result.steps.join(" → ")}`,
      actions,
    };
  },
};
```

- [ ] **Step 6: Write `intents/index.ts` and `tools/index.ts`**

```ts
// client/lib/assistant/intents/index.ts
import type { IntentDefinition } from "../types";
import { NAVIGATION_INTENTS } from "./navigation-intents";

export const INTENTS: IntentDefinition[] = [...NAVIGATION_INTENTS];
```

```ts
// client/lib/assistant/tools/index.ts
import type { AssistantTool } from "../types";
import { navigateHelpTool } from "./navigation-tools";

export const TOOL_REGISTRY: ReadonlyMap<string, AssistantTool> = new Map([
  [navigateHelpTool.name, navigateHelpTool],
]);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/assistant-navigation-tool.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 8: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/lib/assistant/help-catalog.ts client/lib/assistant/intents client/lib/assistant/tools client/__tests__/assistant-navigation-tool.test.ts
git commit -m "feat: add help catalog and navigate_help tool for the assistant"
```

---

## Task 5: Permission gate

**Files:**
- Create: `client/lib/assistant/permission-gate.ts`
- Test: `client/__tests__/assistant-permission-gate.test.ts`

**Interfaces:**
- Consumes: `hasPermission(user, group, key, mode?)` from `@/lib/hooks/use-permissions` (signature: `(user: {role:string}|null|undefined, group: {permissions:string[]}|null|undefined, key: string|string[], mode?: "any"|"all") => boolean`), `AssistantTool`/`ToolContext` from `../types`.
- Produces (used by Task 6):
  ```ts
  export type Authorization = { ok: true } | { ok: false; reason: string };
  export function authorizeToolCall(tool: AssistantTool, ctx: ToolContext): Authorization;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// client/__tests__/assistant-permission-gate.test.ts
import { describe, it, expect } from "vitest";
import { authorizeToolCall } from "@/lib/assistant/permission-gate";
import type { AssistantTool, ToolContext } from "@/lib/assistant/types";

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    user: { id: "u1", role: "sales_staff" },
    permissionGroup: { permissions: [] },
    currencyCode: "NGN",
    expiryWarningDays: 90,
    storeType: "pharmacy",
    t: (k) => k,
    now: new Date(2026, 8, 29),
    ...overrides,
  };
}

const gatedTool: AssistantTool = {
  name: "profit_summary",
  description: "d",
  parameters: {},
  requiredPermission: "view_financial_reports",
  examples: [],
  execute: async () => ({}),
  format: () => ({ kind: "answer", text: "" }),
};

const openTool: AssistantTool = {
  name: "product_stock",
  description: "d",
  parameters: {},
  examples: [],
  execute: async () => ({}),
  format: () => ({ kind: "answer", text: "" }),
};

describe("authorizeToolCall", () => {
  it("allows a tool with no requiredPermission for any signed-in user", () => {
    expect(authorizeToolCall(openTool, makeCtx())).toEqual({ ok: true });
  });

  it("denies a gated tool when the user's group lacks the permission", () => {
    const result = authorizeToolCall(gatedTool, makeCtx());
    expect(result.ok).toBe(false);
  });

  it("allows a gated tool when the user's group has the permission", () => {
    const ctx = makeCtx({ permissionGroup: { permissions: ["view_financial_reports"] } });
    expect(authorizeToolCall(gatedTool, ctx)).toEqual({ ok: true });
  });

  it("denies any tool call when there is no signed-in user", () => {
    const ctx = makeCtx({ user: null });
    const result = authorizeToolCall(openTool, ctx);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/assistant-permission-gate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the minimal implementation**

```ts
// client/lib/assistant/permission-gate.ts
import { hasPermission } from "@/lib/hooks/use-permissions";
import type { AssistantTool, ToolContext } from "./types";

export type Authorization = { ok: true } | { ok: false; reason: string };

export function authorizeToolCall(tool: AssistantTool, ctx: ToolContext): Authorization {
  if (!ctx.user) {
    return { ok: false, reason: "You need to be signed in to do that." };
  }

  if (!tool.requiredPermission) {
    return { ok: true };
  }

  const allowed = hasPermission(ctx.user, ctx.permissionGroup, tool.requiredPermission, "any");
  if (!allowed) {
    return { ok: false, reason: "You don't have permission to see that." };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/assistant-permission-gate.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/lib/assistant/permission-gate.ts client/__tests__/assistant-permission-gate.test.ts
git commit -m "feat: add permission gate for assistant tool calls"
```

---

## Task 6: Reply formatters, fallback replies, router, and IntentRouterBrain

**Files:**
- Create: `client/lib/assistant/reply-formatters.ts`
- Create: `client/lib/assistant/fallback-replies.ts`
- Create: `client/lib/assistant/router-reroutes.ts`
- Create: `client/lib/assistant/intent-router-brain.ts`
- Create: `client/lib/assistant/router.ts`
- Test: `client/__tests__/assistant-router.test.ts`

**Interfaces:**
- Consumes: `matchIntent` (Task 3), `INTENTS` (Task 4), `TOOL_REGISTRY` (Task 4), `authorizeToolCall` (Task 5), `AssistantBrain`/`AssistantReply`/`BrainOutcome`/`ToolContext` (Task 1), `devLog` from `@/lib/utils/dev-log`.
- Produces (used by Task 13):
  ```ts
  export function buildNoMatchReply(ctx: ToolContext): AssistantReply;
  export function buildAmbiguousReply(candidateLabels: string[]): AssistantReply;
  export function buildDeniedReply(reason: string): AssistantReply;
  export function buildErrorReply(): AssistantReply;

  export class IntentRouterBrain implements AssistantBrain {
    resolve(utterance: string, ctx: ToolContext): BrainOutcome;
  }
  export const intentRouterBrain: IntentRouterBrain;

  export const REROUTE_ON_DENIAL: Record<string, string>; // tool name -> fallback tool name, tried when the first is denied

  export async function answer(utterance: string, ctx: ToolContext, brain?: AssistantBrain): Promise<AssistantReply>;
  ```

  `REROUTE_ON_DENIAL` implements the spec's rule: "a sales-shaped utterance from a `sales_staff` user (no `view_reports`) routes to `my_sales_today` instead of being denied." Task 10 (`sales_summary`) registers the `{ sales_summary: "my_sales_today" }` entry once that tool exists; this task ships the empty-safe mechanism and its test with local stub tools so it doesn't depend on Task 10's tools yet.

- [ ] **Step 1: Write the failing test**

```ts
// client/__tests__/assistant-router.test.ts
import { describe, it, expect, vi } from "vitest";
import { answer } from "@/lib/assistant/router";
import type { AssistantBrain, AssistantTool, ToolContext } from "@/lib/assistant/types";

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    user: { id: "u1", role: "store_owner" },
    permissionGroup: { permissions: ["some_permission"] },
    currencyCode: "NGN",
    expiryWarningDays: 90,
    storeType: "pharmacy",
    t: (k) => k,
    now: new Date(2026, 8, 29),
    ...overrides,
  };
}

function brainThatCalls(tool: string, args: Record<string, unknown> = {}): AssistantBrain {
  return { resolve: () => ({ kind: "call", call: { tool, args } }) };
}

function brainWith(outcome: ReturnType<AssistantBrain["resolve"]>): AssistantBrain {
  return { resolve: () => outcome };
}

vi.mock("@/lib/assistant/tools", () => {
  const okTool: AssistantTool = {
    name: "ok_tool",
    description: "d",
    parameters: {},
    examples: ["ok"],
    execute: async () => ({ value: 1 }),
    format: (result) => ({ kind: "answer", text: `value is ${(result as { value: number }).value}` }),
  };

  const throwingTool: AssistantTool = {
    name: "throwing_tool",
    description: "d",
    parameters: {},
    examples: ["throw"],
    execute: async () => {
      throw new Error("boom");
    },
    format: () => ({ kind: "answer", text: "unreachable" }),
  };

  const deniedTool: AssistantTool = {
    name: "denied_tool",
    description: "d",
    parameters: {},
    requiredPermission: "nope_permission",
    examples: ["denied"],
    execute: async () => ({}),
    format: () => ({ kind: "answer", text: "unreachable" }),
  };

  const deniedReroutableTool: AssistantTool = {
    name: "denied_reroutable_tool",
    description: "d",
    parameters: {},
    requiredPermission: "view_reports",
    examples: ["denied reroutable"],
    execute: async () => ({}),
    format: () => ({ kind: "answer", text: "unreachable" }),
  };

  const rerouteTargetTool: AssistantTool = {
    name: "reroute_target_tool",
    description: "d",
    parameters: {},
    requiredPermission: "process_sales",
    examples: ["reroute target"],
    execute: async () => ({}),
    format: () => ({ kind: "answer", text: "rerouted answer" }),
  };

  return {
    TOOL_REGISTRY: new Map([
      [okTool.name, okTool],
      [throwingTool.name, throwingTool],
      [deniedTool.name, deniedTool],
      [deniedReroutableTool.name, deniedReroutableTool],
      [rerouteTargetTool.name, rerouteTargetTool],
    ]),
  };
});

vi.mock("@/lib/assistant/router-reroutes", () => ({
  REROUTE_ON_DENIAL: { denied_reroutable_tool: "reroute_target_tool" },
}));

describe("answer", () => {
  it("returns the formatted reply for a matched, authorized tool", async () => {
    const reply = await answer("anything", makeCtx(), brainThatCalls("ok_tool"));
    expect(reply).toEqual({ kind: "answer", text: "value is 1" });
  });

  it("returns a denied reply when the tool call is not authorized and has no reroute", async () => {
    const reply = await answer("anything", makeCtx(), brainThatCalls("denied_tool"));
    expect(reply.kind).toBe("denied");
  });

  it("reroutes sales_summary to my_sales_today when denied view_reports but permitted process_sales", async () => {
    const cashierCtx = makeCtx({
      user: { id: "u1", role: "sales_staff" },
      permissionGroup: { permissions: ["process_sales"] },
    });
    const reply = await answer("total sales today", cashierCtx, brainThatCalls("denied_reroutable_tool"));
    expect(reply.kind).toBe("answer");
    expect(reply.text).toContain("rerouted");
  });

  it("returns an error reply, not a throw, when the tool execute() throws", async () => {
    const reply = await answer("anything", makeCtx(), brainThatCalls("throwing_tool"));
    expect(reply.kind).toBe("error");
  });

  it("returns a fallback reply when the brain finds no match", async () => {
    const reply = await answer("gibberish", makeCtx(), brainWith({ kind: "none" }));
    expect(reply.kind).toBe("fallback");
  });

  it("returns an ambiguous-style fallback when the brain is unsure", async () => {
    const reply = await answer(
      "ambiguous input",
      makeCtx(),
      brainWith({ kind: "ambiguous", candidates: [{ tool: "ok_tool", args: {} }] }),
    );
    expect(reply.kind).toBe("fallback");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/assistant-router.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write `reply-formatters.ts`**

```ts
// client/lib/assistant/reply-formatters.ts
import { formatCurrency } from "@/lib/utils";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import type { ToolContext } from "./types";

export function formatMoney(amount: number, ctx: ToolContext): string {
  return formatCurrency(amount, ctx.currencyCode ?? "NGN");
}

export function formatDateLabel(iso: string): string {
  return formatDateToDDMMYYYY(iso);
}
```

- [ ] **Step 4: Write `fallback-replies.ts`**

```ts
// client/lib/assistant/fallback-replies.ts
import type { AssistantReply, ToolContext } from "./types";
import { TOOL_REGISTRY } from "./tools";
import { authorizeToolCall } from "./permission-gate";

function permittedExamples(ctx: ToolContext, limit: number): string[] {
  const examples: string[] = [];
  for (const tool of TOOL_REGISTRY.values()) {
    if (authorizeToolCall(tool, ctx).ok) {
      examples.push(...tool.examples.slice(0, 1));
    }
    if (examples.length >= limit) break;
  }
  return examples.slice(0, limit);
}

export function buildNoMatchReply(ctx: ToolContext): AssistantReply {
  const examples = permittedExamples(ctx, 5);
  const suggestionText = examples.length > 0 ? ` Try one of these:\n${examples.join("\n")}` : "";
  return { kind: "fallback", text: `I didn't catch that.${suggestionText}` };
}

export function buildAmbiguousReply(candidateLabels: string[]): AssistantReply {
  return { kind: "fallback", text: `Did you mean: ${candidateLabels.join(" or ")}?` };
}

export function buildDeniedReply(reason: string): AssistantReply {
  return { kind: "denied", text: reason };
}

export function buildErrorReply(): AssistantReply {
  return { kind: "error", text: "Something went wrong answering that. Please try again." };
}
```

- [ ] **Step 5: Write `intent-router-brain.ts`**

```ts
// client/lib/assistant/intent-router-brain.ts
import type { AssistantBrain, BrainOutcome, ToolContext } from "./types";
import { normalizeUtterance } from "./normalize";
import { matchIntent } from "./intent-matcher";
import { INTENTS } from "./intents";

export class IntentRouterBrain implements AssistantBrain {
  resolve(utterance: string, ctx: ToolContext): BrainOutcome {
    const { normalized } = normalizeUtterance(utterance);
    const result = matchIntent(normalized, INTENTS);

    if (result.kind === "none") return { kind: "none" };

    if (result.kind === "ambiguous") {
      return {
        kind: "ambiguous",
        candidates: result.candidates.map((intent) => ({
          tool: intent.tool,
          args: intent.buildArgs({}, ctx),
        })),
      };
    }

    return {
      kind: "call",
      call: { tool: result.intent.tool, args: result.intent.buildArgs(result.captures, ctx) },
    };
  }
}

export const intentRouterBrain = new IntentRouterBrain();
```

- [ ] **Step 6: Write `router-reroutes.ts`**

```ts
// client/lib/assistant/router-reroutes.ts
export const REROUTE_ON_DENIAL: Record<string, string> = {};
```

- [ ] **Step 7: Write `router.ts`**

```ts
// client/lib/assistant/router.ts
import type { AssistantBrain, AssistantReply, AssistantTool, ToolContext } from "./types";
import { intentRouterBrain } from "./intent-router-brain";
import { authorizeToolCall } from "./permission-gate";
import { buildNoMatchReply, buildAmbiguousReply, buildDeniedReply, buildErrorReply } from "./fallback-replies";
import { REROUTE_ON_DENIAL } from "./router-reroutes";
import { devLog } from "@/lib/utils/dev-log";

async function runTool(tool: AssistantTool, args: Record<string, unknown>, ctx: ToolContext): Promise<AssistantReply> {
  try {
    const result = await tool.execute(args, ctx);
    return tool.format(result, args, ctx);
  } catch (error) {
    devLog("[assistant] tool execution failed:", tool.name, error);
    return buildErrorReply();
  }
}

export async function answer(
  utterance: string,
  ctx: ToolContext,
  brain: AssistantBrain = intentRouterBrain,
): Promise<AssistantReply> {
  const { TOOL_REGISTRY } = await import("./tools");
  const outcome = brain.resolve(utterance, ctx);

  if (outcome.kind === "none") {
    return buildNoMatchReply(ctx);
  }

  if (outcome.kind === "ambiguous") {
    const labels = outcome.candidates.map((c) => c.tool);
    return buildAmbiguousReply(labels);
  }

  const tool = TOOL_REGISTRY.get(outcome.call.tool);
  if (!tool) {
    devLog("[assistant] unknown tool resolved:", outcome.call.tool);
    return buildErrorReply();
  }

  const authorization = authorizeToolCall(tool, ctx);
  if (authorization.ok) {
    return runTool(tool, outcome.call.args, ctx);
  }

  const fallbackName = REROUTE_ON_DENIAL[tool.name];
  const fallbackTool = fallbackName ? TOOL_REGISTRY.get(fallbackName) : undefined;
  if (fallbackTool && authorizeToolCall(fallbackTool, ctx).ok) {
    return runTool(fallbackTool, {}, ctx);
  }

  return buildDeniedReply(authorization.reason);
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/assistant-router.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 9: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/lib/assistant/reply-formatters.ts client/lib/assistant/fallback-replies.ts client/lib/assistant/router-reroutes.ts client/lib/assistant/intent-router-brain.ts client/lib/assistant/router.ts client/__tests__/assistant-router.test.ts
git commit -m "feat: add assistant router, brain, reroute mechanism, and fallback replies"
```

---

## Task 7: `product_stock` tool

**Files:**
- Modify: `client/lib/assistant/tools/inventory-tools.ts` (create)
- Modify: `client/lib/assistant/intents/inventory-intents.ts` (create)
- Modify: `client/lib/assistant/intents/index.ts` (append)
- Modify: `client/lib/assistant/tools/index.ts` (append)
- Test: `client/__tests__/assistant-inventory-tools.test.ts` (create; Task 8 extends this same file)

**Interfaces:**
- Consumes: `getProductsWithStock(): Promise<POSProduct[]>` from `@/lib/db/queries/products`, `searchProducts<T>(searchTerm: string, products: T[]): SearchProductResult<T>` from `@/lib/utils/search`, `formatMoney` (Task 6).
- Produces: `productStockTool: AssistantTool<{ product: string }, POSProduct[] | null>` appended to `TOOL_REGISTRY` as `"product_stock"`.

This task uses the real sql.js harness because `getProductsWithStock()` reads from the DB.

- [ ] **Step 1: Write the failing test**

```ts
// client/__tests__/assistant-inventory-tools.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import initSqlJs, { type Database } from "sql.js";

describe("assistant inventory tools", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let productStockTool: typeof import("@/lib/assistant/tools/inventory-tools").productStockTool;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const tools = await import("@/lib/assistant/tools/inventory-tools");
    productStockTool = tools.productStockTool;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM stock_batches; DELETE FROM products;`);
    db.run(`INSERT INTO products (id, store_id, name, generic_name, reorder_level, created_at, updated_at)
            VALUES ('p1', 'store1', 'Paracetamol 500mg', 'Paracetamol', 10, '2026-01-01', '2026-01-01')`);
    db.run(`INSERT INTO stock_batches (id, store_id, product_id, quantity, created_at, updated_at)
            VALUES ('b1', 'store1', 'p1', 25, '2026-01-01', '2026-01-01')`);
  });

  const ctx = {
    user: { id: "u1", role: "store_owner" },
    permissionGroup: { permissions: [] },
    currencyCode: "NGN",
    expiryWarningDays: 90,
    storeType: "pharmacy",
    t: (k: string) => k,
    now: new Date(2026, 8, 29),
  };

  it("finds an exact-match product and reports its stock", async () => {
    const result = await productStockTool.execute({ product: "Paracetamol 500mg" }, ctx);
    const reply = productStockTool.format(result, { product: "Paracetamol 500mg" }, ctx);
    expect(reply.kind).toBe("answer");
    expect(reply.text).toContain("25");
  });

  it("returns a not-found reply when nothing matches", async () => {
    const result = await productStockTool.execute({ product: "Nonexistent Drug XYZ" }, ctx);
    const reply = productStockTool.format(result, { product: "Nonexistent Drug XYZ" }, ctx);
    expect(reply.kind).toBe("fallback");
  });
});
```

*Note: this test assumes `products` and `stock_batches` columns named above exist in `SCHEMA_SQL`. Before writing the implementation, run `grep -n "CREATE TABLE products" -A 20 client/lib/db/schema.ts` and `grep -n "CREATE TABLE stock_batches" -A 20 client/lib/db/schema.ts` to confirm exact column names, and adjust the INSERTs in this test to match if they differ (e.g. `store_id` might be `active_store_id`, or stock may be tracked as `quantity_on_hand`). Do not guess — read the schema first.*

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/assistant-inventory-tools.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write `tools/inventory-tools.ts` (product_stock only for now)**

```ts
// client/lib/assistant/tools/inventory-tools.ts
import { getProductsWithStock } from "@/lib/db/queries/products";
import { searchProducts } from "@/lib/utils/search";
import type { AssistantTool } from "../types";
import type { POSProduct } from "@/lib/db/queries/products";

export const productStockTool: AssistantTool<{ product: string }, POSProduct[] | null> = {
  name: "product_stock",
  description: "Looks up on-hand quantity for a named product.",
  parameters: { product: { type: "string", description: "Product name to search for", required: true } },
  examples: ["how many paracetamol do we have", "is amoxicillin in stock"],
  execute: async ({ product }) => {
    const products = await getProductsWithStock();
    const { results } = searchProducts(product, products);
    return results.length > 0 ? results : null;
  },
  format: (result) => {
    if (!result || result.length === 0) {
      return { kind: "fallback", text: "I couldn't find a product matching that name." };
    }

    const top = result[0];
    const stock = (top as unknown as { stock: number }).stock;
    const reorderLevel = (top as unknown as { reorder_level: number }).reorder_level;
    let text = `${top.name}: ${stock} in stock`;
    if (typeof reorderLevel === "number") text += ` (reorder level: ${reorderLevel})`;

    if (result.length > 1) {
      const alternates = result.slice(1, 4).map((p) => p.name).join(", ");
      text += `. Did you mean one of: ${alternates}?`;
    }

    return { kind: "answer", text };
  },
};
```

- [ ] **Step 4: Write `intents/inventory-intents.ts` (product_stock portion)**

```ts
// client/lib/assistant/intents/inventory-intents.ts
import type { IntentDefinition } from "../types";

export const INVENTORY_INTENTS: IntentDefinition[] = [
  {
    id: "product_stock",
    tool: "product_stock",
    phrases: [/\bhow many (?<product>.+) do we have\b/, /\bis (?<product>.+) in stock\b/, /\bstock of (?<product>.+)\b/],
    keywords: ["stock", "have", "inventory"],
    buildArgs: (captures) => ({ product: captures.product ?? "" }),
  },
];
```

- [ ] **Step 5: Register in `intents/index.ts` and `tools/index.ts`**

```ts
// client/lib/assistant/intents/index.ts
import type { IntentDefinition } from "../types";
import { NAVIGATION_INTENTS } from "./navigation-intents";
import { INVENTORY_INTENTS } from "./inventory-intents";

export const INTENTS: IntentDefinition[] = [...NAVIGATION_INTENTS, ...INVENTORY_INTENTS];
```

```ts
// client/lib/assistant/tools/index.ts
import type { AssistantTool } from "../types";
import { navigateHelpTool } from "./navigation-tools";
import { productStockTool } from "./inventory-tools";

export const TOOL_REGISTRY: ReadonlyMap<string, AssistantTool> = new Map([
  [navigateHelpTool.name, navigateHelpTool],
  [productStockTool.name, productStockTool],
]);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/assistant-inventory-tools.test.ts`
Expected: PASS (2 tests) — fix any column-name mismatches found in Step 1's schema check before this passes.

- [ ] **Step 7: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/lib/assistant/tools/inventory-tools.ts client/lib/assistant/intents/inventory-intents.ts client/lib/assistant/intents/index.ts client/lib/assistant/tools/index.ts client/__tests__/assistant-inventory-tools.test.ts
git commit -m "feat: add product_stock tool to the assistant"
```

---

## Task 8: `inventory_status` tool

**Files:**
- Modify: `client/lib/assistant/tools/inventory-tools.ts` (append `inventoryStatusTool`)
- Modify: `client/lib/assistant/intents/inventory-intents.ts` (append intent)
- Modify: `client/lib/assistant/intents/index.ts`, `client/lib/assistant/tools/index.ts` (register)
- Modify: `client/__tests__/assistant-inventory-tools.test.ts` (append tests)

**Interfaces:**
- Consumes: `getStockBatchStats(expiryDays?: number): Promise<StockBatchStatsRow[]>` and `getLowStockAlerts(): Promise<{product,quantity,threshold,baseUnit}[]>` from `@/lib/db/queries/inventory`; `ctx.expiryWarningDays`; permission `view_cost_fields` gates whether `total_stock_batch_value` is included in the reply text.
- Produces: `inventoryStatusTool: AssistantTool<Record<string, never>, { stats: StockBatchStatsRow; lowStock: {product:string;quantity:number;threshold:number}[]; includeValue: boolean }>` registered as `"inventory_status"`.

- [ ] **Step 1: Add the failing tests (append to the existing file)**

```ts
// append inside the same describe block in client/__tests__/assistant-inventory-tools.test.ts
it("reports low-stock and expiring counts without cost value for a role lacking view_cost_fields", async () => {
  const { inventoryStatusTool } = await import("@/lib/assistant/tools/inventory-tools");
  const result = await inventoryStatusTool.execute({}, ctx);
  const reply = inventoryStatusTool.format(result, {}, ctx);
  expect(reply.kind).toBe("answer");
  expect(reply.text).not.toMatch(/NGN|value/i);
});

it("includes stock value when the caller has view_cost_fields", async () => {
  const { inventoryStatusTool } = await import("@/lib/assistant/tools/inventory-tools");
  const privilegedCtx = { ...ctx, permissionGroup: { permissions: ["view_cost_fields"] } };
  const result = await inventoryStatusTool.execute({}, privilegedCtx);
  const reply = inventoryStatusTool.format(result, {}, privilegedCtx);
  expect(reply.text).toMatch(/value/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/assistant-inventory-tools.test.ts`
Expected: FAIL — `inventoryStatusTool` not exported

- [ ] **Step 3: Append `inventoryStatusTool` to `tools/inventory-tools.ts`**

```ts
// append to client/lib/assistant/tools/inventory-tools.ts
import { getStockBatchStats, getLowStockAlerts } from "@/lib/db/queries/inventory";
import { hasPermission } from "@/lib/hooks/use-permissions";
import { formatMoney } from "../reply-formatters";

interface InventoryStatusResult {
  lowStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  stockValue: number;
  lowStockItems: { product: string; quantity: number; threshold: number }[];
  includeValue: boolean;
}

export const inventoryStatusTool: AssistantTool<Record<string, never>, InventoryStatusResult> = {
  name: "inventory_status",
  description: "Reports low-stock, expiring-soon, and expired counts, and the top low-stock items.",
  parameters: {},
  examples: ["what's low on stock", "anything expiring soon", "inventory status"],
  execute: async (_args, ctx) => {
    const [stats] = await getStockBatchStats(ctx.expiryWarningDays);
    const lowStockAlerts = await getLowStockAlerts();
    const includeValue = hasPermission(ctx.user, ctx.permissionGroup, "view_cost_fields", "any");

    return {
      lowStockCount: stats.low_stock_count + stats.critical_stock_count,
      expiringSoonCount: stats.expiring_soon_count,
      expiredCount: stats.expired_count,
      stockValue: stats.total_stock_batch_value,
      lowStockItems: lowStockAlerts.map((a) => ({ product: a.product, quantity: a.quantity, threshold: a.threshold })),
      includeValue,
    };
  },
  format: (result, _args, ctx) => {
    const parts = [
      `${result.lowStockCount} product(s) low on stock`,
      `${result.expiringSoonCount} expiring soon`,
      `${result.expiredCount} expired`,
    ];
    if (result.includeValue) {
      parts.push(`stock value: ${formatMoney(result.stockValue, ctx)}`);
    }

    let text = parts.join(", ") + ".";
    if (result.lowStockItems.length > 0) {
      const names = result.lowStockItems.map((i) => i.product).join(", ");
      text += ` Top low-stock items (of ${result.lowStockCount}): ${names}.`;
    }

    return { kind: "answer", text };
  },
};
```

- [ ] **Step 4: Append the intent to `intents/inventory-intents.ts`**

```ts
// append to the INVENTORY_INTENTS array in client/lib/assistant/intents/inventory-intents.ts
{
  id: "inventory_status",
  tool: "inventory_status",
  phrases: [/\blow on stock\b/, /\bexpiring soon\b/, /\binventory status\b/],
  keywords: ["inventory", "expiring", "expired"],
  buildArgs: () => ({}),
},
```

- [ ] **Step 5: Register the tool in `tools/index.ts`**

```ts
// client/lib/assistant/tools/index.ts
import { productStockTool, inventoryStatusTool } from "./inventory-tools";

export const TOOL_REGISTRY: ReadonlyMap<string, AssistantTool> = new Map([
  [navigateHelpTool.name, navigateHelpTool],
  [productStockTool.name, productStockTool],
  [inventoryStatusTool.name, inventoryStatusTool],
]);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/assistant-inventory-tools.test.ts`
Expected: PASS (4 tests total)

- [ ] **Step 7: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/lib/assistant/tools/inventory-tools.ts client/lib/assistant/intents/inventory-intents.ts client/lib/assistant/tools/index.ts client/__tests__/assistant-inventory-tools.test.ts
git commit -m "feat: add inventory_status tool to the assistant"
```

---

## Task 9: `my_sales_today` tool

**Files:**
- Create: `client/lib/assistant/tools/sales-tools.ts`
- Create: `client/lib/assistant/intents/sales-intents.ts`
- Modify: `client/lib/assistant/intents/index.ts`, `client/lib/assistant/tools/index.ts`
- Test: `client/__tests__/assistant-sales-tools.test.ts` (create; Task 10 extends it)

**Interfaces:**
- Consumes: `getRecentSales(userId?: string, dateRange?: {from?:string; to?:string}): Promise<SaleRow[]>` and `calculateNetSaleAmount(totalAmount: number, totalRefunded: number): number` from `@/lib/db/queries/sales` and `@/lib/utils/pos-calculations` respectively.
- Produces: `mySalesTodayTool: AssistantTool<Record<string, never>, {count: number; netTotal: number}>` registered as `"my_sales_today"`, required permission `"process_sales"`.

- [ ] **Step 1: Write the failing test**

```ts
// client/__tests__/assistant-sales-tools.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import initSqlJs, { type Database } from "sql.js";

describe("assistant sales tools", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let mySalesTodayTool: typeof import("@/lib/assistant/tools/sales-tools").mySalesTodayTool;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const tools = await import("@/lib/assistant/tools/sales-tools");
    mySalesTodayTool = tools.mySalesTodayTool;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales; DELETE FROM users;`);
  });

  const baseCtx = {
    user: { id: "cashier1", role: "sales_staff" },
    permissionGroup: { permissions: ["process_sales"] },
    currencyCode: "NGN",
    expiryWarningDays: 90,
    storeType: "pharmacy",
    t: (k: string) => k,
    now: new Date(),
  };

  it("counts only the signed-in cashier's own sales for today", async () => {
    const today = new Date().toISOString().split("T")[0];
    db.run(`INSERT INTO users (id, store_id, name, created_at, updated_at) VALUES ('cashier1', 'store1', 'Cashier One', '2026-01-01', '2026-01-01')`);
    db.run(`INSERT INTO users (id, store_id, name, created_at, updated_at) VALUES ('cashier2', 'store1', 'Cashier Two', '2026-01-01', '2026-01-01')`);
    db.run(`INSERT INTO sales (id, store_id, user_id, total, created_at, updated_at) VALUES ('s1', 'store1', 'cashier1', 100, '${today}T10:00:00.000Z', '${today}T10:00:00.000Z')`);
    db.run(`INSERT INTO sales (id, store_id, user_id, total, created_at, updated_at) VALUES ('s2', 'store1', 'cashier2', 200, '${today}T10:00:00.000Z', '${today}T10:00:00.000Z')`);

    const result = await mySalesTodayTool.execute({}, baseCtx);
    expect(result.count).toBe(1);
    expect(result.netTotal).toBe(100);
  });
});
```

*Note: as in Task 7, confirm exact `sales`/`users` column names against `client/lib/db/schema.ts` before finalizing these INSERTs (e.g. whether it's `total` or `total_amount`).*

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/assistant-sales-tools.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write `tools/sales-tools.ts` (my_sales_today only)**

```ts
// client/lib/assistant/tools/sales-tools.ts
import { getRecentSales } from "@/lib/db/queries/sales";
import { calculateNetSaleAmount } from "@/lib/utils/pos-calculations";
import type { AssistantTool } from "../types";
import { toDateOnly } from "../date-phrases";
import { formatMoney } from "../reply-formatters";

interface MySalesTodayResult {
  count: number;
  netTotal: number;
}

export const mySalesTodayTool: AssistantTool<Record<string, never>, MySalesTodayResult> = {
  name: "my_sales_today",
  description: "Reports the signed-in cashier's own sales for today.",
  parameters: {},
  requiredPermission: "process_sales",
  examples: ["my sales today", "how much have i sold today"],
  execute: async (_args, ctx) => {
    const today = toDateOnly(ctx.now);
    const sales = await getRecentSales(ctx.user?.id, { from: today, to: today });

    let netTotal = 0;
    for (const sale of sales as Array<{ total_amount?: number; total?: number; total_refunded?: number }>) {
      netTotal += calculateNetSaleAmount(
        Number(sale.total_amount) || Number(sale.total) || 0,
        Number(sale.total_refunded) || 0,
      );
    }

    return { count: sales.length, netTotal };
  },
  format: (result, _args, ctx) => ({
    kind: "answer",
    text: `You've made ${result.count} sale(s) today, totalling ${formatMoney(result.netTotal, ctx)}.`,
  }),
};
```

- [ ] **Step 4: Write `intents/sales-intents.ts` (my_sales_today only)**

```ts
// client/lib/assistant/intents/sales-intents.ts
import type { IntentDefinition } from "../types";

export const SALES_INTENTS: IntentDefinition[] = [
  {
    id: "my_sales_today",
    tool: "my_sales_today",
    phrases: [/\bmy sales today\b/, /\bhow much have i sold\b/],
    keywords: ["my", "sold"],
    buildArgs: () => ({}),
  },
];
```

- [ ] **Step 5: Register in `intents/index.ts` and `tools/index.ts`**

```ts
// client/lib/assistant/intents/index.ts
import { SALES_INTENTS } from "./sales-intents";

export const INTENTS: IntentDefinition[] = [...NAVIGATION_INTENTS, ...INVENTORY_INTENTS, ...SALES_INTENTS];
```

```ts
// client/lib/assistant/tools/index.ts
import { mySalesTodayTool } from "./sales-tools";

export const TOOL_REGISTRY: ReadonlyMap<string, AssistantTool> = new Map([
  [navigateHelpTool.name, navigateHelpTool],
  [productStockTool.name, productStockTool],
  [inventoryStatusTool.name, inventoryStatusTool],
  [mySalesTodayTool.name, mySalesTodayTool],
]);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/assistant-sales-tools.test.ts`
Expected: PASS (1 test) — fix column names first if the schema check surfaced differences.

- [ ] **Step 7: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/lib/assistant/tools/sales-tools.ts client/lib/assistant/intents/sales-intents.ts client/lib/assistant/intents/index.ts client/lib/assistant/tools/index.ts client/__tests__/assistant-sales-tools.test.ts
git commit -m "feat: add my_sales_today tool to the assistant"
```

---

## Task 10: `sales_summary` tool

**Files:**
- Modify: `client/lib/assistant/tools/sales-tools.ts` (append `salesSummaryTool`)
- Modify: `client/lib/assistant/intents/sales-intents.ts` (append intent)
- Modify: `client/lib/assistant/intents/index.ts`, `client/lib/assistant/tools/index.ts`
- Modify: `client/__tests__/assistant-sales-tools.test.ts` (append test)

**Interfaces:**
- Consumes: `getSalesTotalsByPaymentMethod(date: string): Promise<{payment_method:string; total:number}[]>` and `getTransactionCountByDate(date: string): Promise<number>` from `@/lib/db/queries/sales`; `parseDatePhrase` (Task 2) for the date arg; defaults to today when no date phrase is found (this default is applied in the intent's `buildArgs`, not inside the tool, so the tool always receives an explicit `date`).
- Produces: `salesSummaryTool: AssistantTool<{date:string}, {total:number; count:number; date:string}>` registered as `"sales_summary"`, required permission `"view_reports"`.

- [ ] **Step 1: Append the failing test**

```ts
// append inside the describe block in client/__tests__/assistant-sales-tools.test.ts
it("summarizes store-wide sales total and count for a date", async () => {
  const { salesSummaryTool } = await import("@/lib/assistant/tools/sales-tools");
  const today = new Date().toISOString().split("T")[0];
  db.run(`INSERT INTO users (id, store_id, name, created_at, updated_at) VALUES ('cashier1', 'store1', 'Cashier One', '2026-01-01', '2026-01-01')`);
  db.run(`INSERT INTO sales (id, store_id, user_id, total, payment_method, created_at, updated_at) VALUES ('s1', 'store1', 'cashier1', 150, 'cash', '${today}T09:00:00.000Z', '${today}T09:00:00.000Z')`);

  const result = await salesSummaryTool.execute({ date: today }, baseCtx);
  expect(result.count).toBe(1);
  expect(result.total).toBe(150);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/assistant-sales-tools.test.ts`
Expected: FAIL — `salesSummaryTool` not exported

- [ ] **Step 3: Append `salesSummaryTool` to `tools/sales-tools.ts`**

```ts
// append to client/lib/assistant/tools/sales-tools.ts
import { getSalesTotalsByPaymentMethod, getTransactionCountByDate } from "@/lib/db/queries/sales";
import { formatDateLabel } from "../reply-formatters";

interface SalesSummaryResult {
  total: number;
  count: number;
  date: string;
}

export const salesSummaryTool: AssistantTool<{ date: string }, SalesSummaryResult> = {
  name: "sales_summary",
  description: "Reports store-wide sales total and transaction count for a date.",
  parameters: { date: { type: "string", description: "Date in YYYY-MM-DD", required: true } },
  requiredPermission: "view_reports",
  examples: ["how many sales today", "total sales yesterday"],
  execute: async ({ date }) => {
    const totals = await getSalesTotalsByPaymentMethod(date);
    const count = await getTransactionCountByDate(date);
    const total = totals.reduce((sum, row) => sum + row.total, 0);
    return { total, count, date };
  },
  format: (result, _args, ctx) => ({
    kind: "answer",
    text: `${formatDateLabel(result.date)}: ${result.count} sale(s) totalling ${formatMoney(result.total, ctx)}.`,
  }),
};
```

- [ ] **Step 4: Append the intent to `intents/sales-intents.ts`**

```ts
// append to the SALES_INTENTS array in client/lib/assistant/intents/sales-intents.ts
import { parseDatePhrase, toDateOnly } from "../date-phrases";

{
  id: "sales_summary",
  tool: "sales_summary",
  phrases: [/\btotal sales\b/, /\bhow many sales\b/, /\bsales on\b/],
  keywords: ["sales", "transactions"],
  buildArgs: (_captures, ctx) => {
    const parsed = parseDatePhrase(ctx.now.toString(), ctx.now); // placeholder replaced in Step 4b below
    return { date: parsed?.from ?? toDateOnly(ctx.now) };
  },
},
```

*Step 4b — correction: `buildArgs` only receives `captures` from the matched regex, not the raw utterance, so it cannot re-run `parseDatePhrase` on the original text. Fix this properly:*

```ts
// client/lib/assistant/intents/sales-intents.ts — corrected buildArgs
import type { IntentDefinition } from "../types";
import { parseDatePhrase, toDateOnly } from "../date-phrases";

export const SALES_INTENTS: IntentDefinition[] = [
  {
    id: "my_sales_today",
    tool: "my_sales_today",
    phrases: [/\bmy sales today\b/, /\bhow much have i sold\b/],
    keywords: ["my", "sold"],
    buildArgs: () => ({}),
  },
  {
    id: "sales_summary",
    tool: "sales_summary",
    phrases: [/\btotal sales\b/, /\bhow many sales\b/, /\bsales on\b/],
    keywords: ["sales", "transactions"],
    buildArgs: (captures, ctx) => {
      const date = captures.__utterance ? parseDatePhrase(captures.__utterance, ctx.now)?.from : undefined;
      return { date: date ?? toDateOnly(ctx.now) };
    },
  },
];
```

*This requires `IntentRouterBrain.resolve` (Task 6) to pass the normalized utterance into `captures` as `__utterance` so date-taking intents can re-parse it. Update `intent-router-brain.ts`:*

```ts
// client/lib/assistant/intent-router-brain.ts — update resolve()
resolve(utterance: string, ctx: ToolContext): BrainOutcome {
  const { normalized } = normalizeUtterance(utterance);
  const result = matchIntent(normalized, INTENTS);

  if (result.kind === "none") return { kind: "none" };

  if (result.kind === "ambiguous") {
    return {
      kind: "ambiguous",
      candidates: result.candidates.map((intent) => ({
        tool: intent.tool,
        args: intent.buildArgs({ ...intent, __utterance: normalized } as unknown as Record<string, string>, ctx),
      })),
    };
  }

  return {
    kind: "call",
    call: {
      tool: result.intent.tool,
      args: result.intent.buildArgs({ ...result.captures, __utterance: normalized }, ctx),
    },
  };
}
```

- [ ] **Step 5: Register in `intents/index.ts` and `tools/index.ts`, and add the cashier reroute**

```ts
// client/lib/assistant/tools/index.ts
import { mySalesTodayTool, salesSummaryTool } from "./sales-tools";

export const TOOL_REGISTRY: ReadonlyMap<string, AssistantTool> = new Map([
  [navigateHelpTool.name, navigateHelpTool],
  [productStockTool.name, productStockTool],
  [inventoryStatusTool.name, inventoryStatusTool],
  [mySalesTodayTool.name, mySalesTodayTool],
  [salesSummaryTool.name, salesSummaryTool],
]);
```

```ts
// client/lib/assistant/router-reroutes.ts — replace the empty object from Task 6
export const REROUTE_ON_DENIAL: Record<string, string> = {
  sales_summary: "my_sales_today",
};
```

- [ ] **Step 6: Re-run the router test suite (Task 6) to confirm the `__utterance` change didn't break it**

Run: `cd client && npx vitest run __tests__/assistant-router.test.ts __tests__/assistant-intent-matcher.test.ts`
Expected: PASS (both files, no regressions)

- [ ] **Step 7: Append an end-to-end reroute test using the real `answer()` function**

```ts
// append inside the describe block in client/__tests__/assistant-sales-tools.test.ts
it("reroutes a sales_staff cashier's sales question to my_sales_today via answer()", async () => {
  const { answer } = await import("@/lib/assistant/router");
  const today = new Date().toISOString().split("T")[0];
  db.run(`INSERT INTO users (id, store_id, name, created_at, updated_at) VALUES ('cashier1', 'store1', 'Cashier One', '2026-01-01', '2026-01-01')`);
  db.run(`INSERT INTO sales (id, store_id, user_id, total, created_at, updated_at) VALUES ('s1', 'store1', 'cashier1', 100, '${today}T10:00:00.000Z', '${today}T10:00:00.000Z')`);

  const cashierCtx = {
    user: { id: "cashier1", role: "sales_staff" },
    permissionGroup: { permissions: ["process_sales"] },
    currencyCode: "NGN",
    expiryWarningDays: 90,
    storeType: "pharmacy",
    t: (k: string) => k,
    now: new Date(),
  };

  const reply = await answer("how many sales today", cashierCtx);
  expect(reply.kind).toBe("answer");
  expect(reply.text).toContain("You've made");
});
```

- [ ] **Step 8: Run test to verify all new tests pass**

Run: `cd client && npx vitest run __tests__/assistant-sales-tools.test.ts`
Expected: PASS (3 tests total)

- [ ] **Step 9: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/lib/assistant/tools/sales-tools.ts client/lib/assistant/intents/sales-intents.ts client/lib/assistant/intent-router-brain.ts client/lib/assistant/router-reroutes.ts client/lib/assistant/tools/index.ts client/__tests__/assistant-sales-tools.test.ts
git commit -m "feat: add sales_summary tool with cashier reroute and utterance-aware date parsing"
```

---

## Task 11: `profit_summary` tool

**Files:**
- Create: `client/lib/assistant/tools/finance-tools.ts`
- Create: `client/lib/assistant/intents/finance-intents.ts`
- Modify: `client/lib/assistant/intents/index.ts`, `client/lib/assistant/tools/index.ts`
- Test: `client/__tests__/assistant-finance-tool.test.ts`

**Interfaces:**
- Consumes: `fetchProfitLossReportData(dateFrom?: string, dateTo?: string, filters?: SalesFilters)` from `@/lib/db/queries/reports` — returns per-month rows with string-formatted `"Revenue"`, `"COGS"`, `"Gross Profit"`, `"Expenses"`, `"Net Profit"` fields (verify exact key casing against `reports.ts` before writing the tool — read the function body's return shape directly, don't assume).
- Produces: `profitSummaryTool: AssistantTool<{from:string; to:string}, {revenue:number; cogs:number; grossProfit:number; expenses:number; netProfit:number; margin:number}>` registered as `"profit_summary"`, required permission `"view_financial_reports"`.

- [ ] **Step 1: Read the exact return shape before writing the test**

Run: `grep -n "return" /Users/admin/Documents/Projects/DumosRx/client/lib/db/queries/reports.ts | grep -i -A2 "Revenue\|profit"` and open `fetchProfitLossReportData`'s full body to confirm the literal keys and whether values are numbers or `.toFixed(2)` strings. Use the confirmed keys in Steps 2-3 below (the spec says they are `.toFixed(2)` strings — confirm, don't assume).

- [ ] **Step 2: Write the failing test**

```ts
// client/__tests__/assistant-finance-tool.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import initSqlJs, { type Database } from "sql.js";

describe("assistant finance tool", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let profitSummaryTool: typeof import("@/lib/assistant/tools/finance-tools").profitSummaryTool;
  let fetchProfitLossReportData: typeof import("@/lib/db/queries/reports").fetchProfitLossReportData;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const tools = await import("@/lib/assistant/tools/finance-tools");
    profitSummaryTool = tools.profitSummaryTool;
    const reports = await import("@/lib/db/queries/reports");
    fetchProfitLossReportData = reports.fetchProfitLossReportData;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales; DELETE FROM sale_items; DELETE FROM expenses; DELETE FROM users;
            DELETE FROM returns; DELETE FROM return_items; DELETE FROM stock_batches;`);
  });

  const ctx = {
    user: { id: "u1", role: "store_owner" },
    permissionGroup: { permissions: ["view_financial_reports"] },
    currencyCode: "NGN",
    expiryWarningDays: 90,
    storeType: "pharmacy",
    t: (k: string) => k,
    now: new Date(2026, 8, 15),
  };

  it("matches the numbers fetchProfitLossReportData reports for the same window", async () => {
    db.run(`INSERT INTO users (id, store_id, name, created_at, updated_at) VALUES ('u1', 'store1', 'Owner', '2026-01-01', '2026-01-01')`);
    db.run(`INSERT INTO sales (id, store_id, user_id, total, created_at, updated_at) VALUES ('s1', 'store1', 'u1', 500, '2026-09-15T10:00:00.000Z', '2026-09-15T10:00:00.000Z')`);

    const reportRows = await fetchProfitLossReportData("2026-09-15", "2026-09-15");
    const expectedRevenue = reportRows.reduce((sum, row) => sum + Number(row["Revenue"]), 0);

    const result = await profitSummaryTool.execute({ from: "2026-09-15", to: "2026-09-15" }, ctx);
    expect(result.revenue).toBeCloseTo(expectedRevenue, 2);
  });

  it("defaults the date range to today when the utterance has no date phrase", async () => {
    const { FINANCE_INTENTS } = await import("@/lib/assistant/intents/finance-intents");
    const intent = FINANCE_INTENTS.find((i) => i.id === "profit_summary")!;
    const args = intent.buildArgs({ __utterance: "gross profit" }, ctx) as { from: string; to: string };
    expect(args.from).toBe("2026-09-15");
    expect(args.to).toBe("2026-09-15");
  });
});
```

*Adjust the `row["Revenue"]` key to whatever Step 1 confirmed.*

- [ ] **Step 3: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/assistant-finance-tool.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Write `tools/finance-tools.ts`**

Use the exact field keys confirmed in Step 1 in place of `"Revenue"` etc. below if they differ.

```ts
// client/lib/assistant/tools/finance-tools.ts
import { fetchProfitLossReportData } from "@/lib/db/queries/reports";
import type { AssistantTool } from "../types";
import { formatMoney, formatDateLabel } from "../reply-formatters";

interface ProfitSummaryResult {
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  margin: number;
  from: string;
  to: string;
}

export const profitSummaryTool: AssistantTool<{ from: string; to: string }, ProfitSummaryResult> = {
  name: "profit_summary",
  description: "Reports revenue, COGS, gross/net profit, expenses, and margin for a date range.",
  parameters: {
    from: { type: "string", description: "Start date YYYY-MM-DD", required: true },
    to: { type: "string", description: "End date YYYY-MM-DD", required: true },
  },
  requiredPermission: "view_financial_reports",
  examples: ["how much gross profit did we make on 2026-09-01", "net profit this month"],
  execute: async ({ from, to }) => {
    const rows = await fetchProfitLossReportData(from, to);

    let revenue = 0, cogs = 0, grossProfit = 0, expenses = 0, netProfit = 0;
    for (const row of rows) {
      revenue += Number(row["Revenue"]);
      cogs += Number(row["COGS"]);
      grossProfit += Number(row["Gross Profit"]);
      expenses += Number(row["Expenses"]);
      netProfit += Number(row["Net Profit"]);
    }

    const margin = revenue > 0 ? netProfit / revenue : 0;
    return { revenue, cogs, grossProfit, expenses, netProfit, margin, from, to };
  },
  format: (result, _args, ctx) => {
    const range = result.from === result.to
      ? formatDateLabel(result.from)
      : `${formatDateLabel(result.from)} to ${formatDateLabel(result.to)}`;

    return {
      kind: "answer",
      text: `${range}: revenue ${formatMoney(result.revenue, ctx)}, gross profit ${formatMoney(result.grossProfit, ctx)}, net profit ${formatMoney(result.netProfit, ctx)} (margin ${(result.margin * 100).toFixed(1)}%).`,
    };
  },
};
```

- [ ] **Step 5: Write `intents/finance-intents.ts`**

```ts
// client/lib/assistant/intents/finance-intents.ts
import type { IntentDefinition } from "../types";
import { parseDatePhrase, toDateOnly } from "../date-phrases";

export const FINANCE_INTENTS: IntentDefinition[] = [
  {
    id: "profit_summary",
    tool: "profit_summary",
    phrases: [/\bgross profit\b/, /\bnet profit\b/, /\brevenue\b.*\b(today|yesterday|month)\b/],
    keywords: ["profit", "margin", "revenue", "expenses"],
    buildArgs: (captures, ctx) => {
      const utterance = captures.__utterance ?? "";
      const parsed = parseDatePhrase(utterance, ctx.now);
      const today = toDateOnly(ctx.now);
      return { from: parsed?.from ?? today, to: parsed?.to ?? today };
    },
  },
];
```

- [ ] **Step 6: Register in `intents/index.ts` and `tools/index.ts`**

```ts
// client/lib/assistant/intents/index.ts
import { FINANCE_INTENTS } from "./finance-intents";

export const INTENTS: IntentDefinition[] = [
  ...NAVIGATION_INTENTS,
  ...INVENTORY_INTENTS,
  ...SALES_INTENTS,
  ...FINANCE_INTENTS,
];
```

```ts
// client/lib/assistant/tools/index.ts
import { profitSummaryTool } from "./finance-tools";

export const TOOL_REGISTRY: ReadonlyMap<string, AssistantTool> = new Map([
  [navigateHelpTool.name, navigateHelpTool],
  [productStockTool.name, productStockTool],
  [inventoryStatusTool.name, inventoryStatusTool],
  [mySalesTodayTool.name, mySalesTodayTool],
  [salesSummaryTool.name, salesSummaryTool],
  [profitSummaryTool.name, profitSummaryTool],
]);
```

- [ ] **Step 7: Run the full assistant test suite**

Run: `cd client && npx vitest run __tests__/assistant-*.test.ts`
Expected: PASS (all files)

- [ ] **Step 8: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/lib/assistant/tools/finance-tools.ts client/lib/assistant/intents/finance-intents.ts client/lib/assistant/intents/index.ts client/lib/assistant/tools/index.ts client/__tests__/assistant-finance-tool.test.ts
git commit -m "feat: add profit_summary tool to the assistant"
```

---

## Task 12: Zustand panel store and `use-assistant` hook

**Files:**
- Create: `client/lib/store/use-assistant-panel.ts`
- Create: `client/lib/hooks/use-assistant.ts`
- Test: `client/__tests__/use-assistant.test.ts`

**Interfaces:**
- Consumes: `answer` from `@/lib/assistant/router`, `useAuth()` (`user`, `permissionGroup`) from `@/lib/context/auth-context`, `useStore()` (`storeProfile.currency`, `storeProfile.expiry_warning_days`, `storeType`, `t`, `activeStoreId`) from `@/lib/context/store-context`, `TOOL_REGISTRY` (for building `suggestions`), `authorizeToolCall` (Task 5).
- Produces:
  ```ts
  // use-assistant-panel.ts
  export interface AssistantPanelStore {
    isOpen: boolean;
    messages: AssistantMessage[];
    open: () => void;
    close: () => void;
    append: (msg: AssistantMessage) => void;
    clear: () => void;
  }
  export const useAssistantPanel: UseBoundStore<StoreApi<AssistantPanelStore>>;

  // use-assistant.ts
  export function useAssistant(): {
    messages: AssistantMessage[];
    isThinking: boolean;
    suggestions: string[];
    send: (text: string) => Promise<void>;
  };
  ```

- [ ] **Step 1: Write the failing test**

```ts
// client/__tests__/use-assistant.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", role: "store_owner" },
    permissionGroup: { permissions: ["view_reports"] },
  }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeProfile: { currency: "NGN", expiry_warning_days: 90 },
    storeType: "pharmacy",
    t: (k: string) => k,
    activeStoreId: "store1",
  }),
}));

vi.mock("@/lib/assistant/router", () => ({
  answer: vi.fn(async (text: string) => ({ kind: "answer", text: `echo: ${text}` })),
}));

describe("useAssistant", () => {
  beforeEach(async () => {
    const { useAssistantPanel } = await import("@/lib/store/use-assistant-panel");
    useAssistantPanel.getState().clear();
  });

  it("appends the user message and the assistant reply", async () => {
    const { useAssistant } = await import("@/lib/hooks/use-assistant");
    const { result } = renderHook(() => useAssistant());

    await act(async () => {
      await result.current.send("hello");
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });
    expect(result.current.messages[0]).toMatchObject({ role: "user", text: "hello" });
    expect(result.current.messages[1]).toMatchObject({ role: "assistant", text: "echo: hello" });
    expect(result.current.isThinking).toBe(false);
  });

  it("clears the thread when the store switches", async () => {
    const { useAssistantPanel } = await import("@/lib/store/use-assistant-panel");
    const { useAssistant } = await import("@/lib/hooks/use-assistant");
    const { result, rerender } = renderHook(() => useAssistant());

    await act(async () => {
      await result.current.send("hello");
    });
    expect(useAssistantPanel.getState().messages.length).toBeGreaterThan(0);

    const storeContext = await import("@/lib/context/store-context");
    vi.mocked(storeContext.useStore).mockReturnValue({
      storeProfile: { currency: "NGN", expiry_warning_days: 90 },
      storeType: "pharmacy",
      t: (k: string) => k,
      activeStoreId: "store2",
    } as ReturnType<typeof storeContext.useStore>);

    rerender();
    await waitFor(() => {
      expect(useAssistantPanel.getState().messages).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/use-assistant.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Write `use-assistant-panel.ts`**

```ts
// client/lib/store/use-assistant-panel.ts
import { create } from "zustand";
import type { AssistantMessage } from "@/lib/assistant/types";

interface AssistantPanelStore {
  isOpen: boolean;
  messages: AssistantMessage[];
  open: () => void;
  close: () => void;
  append: (msg: AssistantMessage) => void;
  clear: () => void;
}

export const useAssistantPanel = create<AssistantPanelStore>((set) => ({
  isOpen: false,
  messages: [],
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  append: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  clear: () => set({ messages: [] }),
}));
```

- [ ] **Step 4: Write `use-assistant.ts`**

```ts
// client/lib/hooks/use-assistant.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { answer } from "@/lib/assistant/router";
import { TOOL_REGISTRY } from "@/lib/assistant/tools";
import { authorizeToolCall } from "@/lib/assistant/permission-gate";
import { useAssistantPanel } from "@/lib/store/use-assistant-panel";
import type { ToolContext } from "@/lib/assistant/types";

function buildToolContext(
  user: { id: string; role: string; store_id?: string | null } | null,
  permissionGroup: { permissions: string[] } | null,
  storeProfile: { currency?: string; expiry_warning_days?: number } | null,
  storeType: string,
  t: (key: string) => string,
): ToolContext {
  return {
    user,
    permissionGroup,
    currencyCode: storeProfile?.currency,
    expiryWarningDays: storeProfile?.expiry_warning_days ?? 90,
    storeType,
    t,
    now: new Date(),
  };
}

export function useAssistant() {
  const { user, permissionGroup } = useAuth();
  const { storeProfile, storeType, t, activeStoreId } = useStore();
  const { messages, append, clear } = useAssistantPanel();
  const [isThinking, setIsThinking] = useState(false);
  const identityRef = useRef<string>("");

  useEffect(() => {
    const identity = `${user?.id ?? ""}:${activeStoreId ?? ""}`;
    if (identityRef.current !== "" && identityRef.current !== identity) {
      clear();
    }
    identityRef.current = identity;
  }, [user?.id, activeStoreId, clear]);

  const send = useCallback(
    async (text: string) => {
      const ctx = buildToolContext(user, permissionGroup, storeProfile, storeType, t);
      append({ id: crypto.randomUUID(), role: "user", text, at: new Date().toISOString() });
      setIsThinking(true);
      try {
        const reply = await answer(text, ctx);
        append({ id: crypto.randomUUID(), role: "assistant", text: reply.text, actions: reply.actions, at: new Date().toISOString() });
      } finally {
        setIsThinking(false);
      }
    },
    [user, permissionGroup, storeProfile, storeType, t, append],
  );

  const suggestions = Array.from(TOOL_REGISTRY.values())
    .filter((tool) => authorizeToolCall(tool, buildToolContext(user, permissionGroup, storeProfile, storeType, t)).ok)
    .flatMap((tool) => tool.examples.slice(0, 1))
    .slice(0, 5);

  return { messages, isThinking, suggestions, send };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/use-assistant.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/lib/store/use-assistant-panel.ts client/lib/hooks/use-assistant.ts client/__tests__/use-assistant.test.ts
git commit -m "feat: add assistant panel store and use-assistant hook"
```

---

## Task 13: Chat UI components

**Files:**
- Create: `client/components/assistant/assistant-panel.tsx`
- Create: `client/components/assistant/assistant-message-list.tsx`
- Create: `client/components/assistant/assistant-composer.tsx`
- Create: `client/components/assistant/assistant-suggestion-chips.tsx`
- Create: `client/components/assistant/assistant-launcher.tsx`
- Test: `client/__tests__/assistant-panel.test.tsx`

**Interfaces:**
- Consumes: `useAssistant()` (Task 12), `useAssistantPanel` (Task 12), `ResponsiveModal` from `@/components/ui/responsive-modal`, `ScrollFade` from `@/components/ui/scroll-fade`, `Button` from `@/components/ui/button`, `Input` from `@/components/ui/input`.
- Produces: `<AssistantPanel />` (mounted globally, reads `isOpen`/`close` itself from `useAssistantPanel`), `<AssistantLauncher />` (calls `useAssistantPanel.getState().open()`).

- [ ] **Step 1: Write the failing test**

```tsx
// client/__tests__/assistant-panel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", role: "store_owner" }, permissionGroup: { permissions: ["view_reports"] } }),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeProfile: { currency: "NGN", expiry_warning_days: 90 },
    storeType: "pharmacy",
    t: (k: string) => k,
    activeStoreId: "store1",
  }),
}));

vi.mock("@/lib/assistant/router", () => ({
  answer: vi.fn(async () => ({
    kind: "help",
    text: "Make a sale: Open POS",
    actions: [{ label: "Make a sale", href: "/pos" }],
  })),
}));

describe("AssistantPanel", () => {
  beforeEach(async () => {
    const { useAssistantPanel } = await import("@/lib/store/use-assistant-panel");
    useAssistantPanel.setState({ isOpen: true, messages: [] });
  });

  it("sends a message and shows the reply with an action link", async () => {
    const { AssistantPanel } = await import("@/components/assistant/assistant-panel");
    render(<AssistantPanel />);

    const input = screen.getByLabelText("Ask the assistant");
    fireEvent.change(input, { target: { value: "how do i make a sale" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText(/Make a sale: Open POS/)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Make a sale" })).toHaveAttribute("href", "/pos");
  });

  it("closes the panel when an action link is clicked", async () => {
    const { AssistantPanel } = await import("@/components/assistant/assistant-panel");
    const { useAssistantPanel } = await import("@/lib/store/use-assistant-panel");
    render(<AssistantPanel />);

    const input = screen.getByLabelText("Ask the assistant");
    fireEvent.change(input, { target: { value: "how do i make a sale" } });
    fireEvent.submit(input.closest("form")!);

    const link = await screen.findByRole("link", { name: "Make a sale" });
    fireEvent.click(link);

    expect(useAssistantPanel.getState().isOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run __tests__/assistant-panel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write `assistant-suggestion-chips.tsx`**

```tsx
// client/components/assistant/assistant-suggestion-chips.tsx
import { Button } from "@/components/ui/button";

interface AssistantSuggestionChipsProps {
  suggestions: string[];
  onPick: (text: string) => void;
}

export function AssistantSuggestionChips({ suggestions, onPick }: AssistantSuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-3">
      {suggestions.map((suggestion) => (
        <Button key={suggestion} variant="outline" size="sm" onClick={() => onPick(suggestion)}>
          {suggestion}
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `assistant-message-list.tsx`**

```tsx
// client/components/assistant/assistant-message-list.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ScrollFade } from "@/components/ui/scroll-fade";
import type { AssistantMessage } from "@/lib/assistant/types";

interface AssistantMessageListProps {
  messages: AssistantMessage[];
  isThinking: boolean;
  onActionClick: () => void;
}

export function AssistantMessageList({ messages, isThinking, onActionClick }: AssistantMessageListProps) {
  return (
    <ScrollFade className="flex-1 min-h-0" containerClassName="flex flex-col gap-2 p-3">
      <div role="log" aria-live="polite" className="flex flex-col gap-2">
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user"
                ? "self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                : "self-start rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
            }
          >
            <p>{message.text}</p>
            {message.actions?.map((action) => (
              <Button key={action.href} asChild variant="outline" size="sm" className="mt-2" onClick={onActionClick}>
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ))}
          </div>
        ))}
        {isThinking && <div className="self-start rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Thinking…</div>}
      </div>
    </ScrollFade>
  );
}
```

- [ ] **Step 5: Write `assistant-composer.tsx`**

```tsx
// client/components/assistant/assistant-composer.tsx
import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AssistantComposerProps {
  isThinking: boolean;
  onSend: (text: string) => void;
}

export function AssistantComposer({ isThinking, onSend }: AssistantComposerProps) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isThinking) return;
    onSend(trimmed);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-3">
      <Input
        aria-label="Ask the assistant"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask a question…"
        disabled={isThinking}
      />
      <Button type="submit" disabled={isThinking || value.trim().length === 0}>
        Send
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Write `assistant-panel.tsx`**

```tsx
// client/components/assistant/assistant-panel.tsx
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { useAssistant } from "@/lib/hooks/use-assistant";
import { useAssistantPanel } from "@/lib/store/use-assistant-panel";
import { AssistantMessageList } from "./assistant-message-list";
import { AssistantComposer } from "./assistant-composer";
import { AssistantSuggestionChips } from "./assistant-suggestion-chips";

export function AssistantPanel() {
  const isOpen = useAssistantPanel((state) => state.isOpen);
  const close = useAssistantPanel((state) => state.close);
  const { messages, isThinking, suggestions, send } = useAssistant();

  return (
    <ResponsiveModal
      open={isOpen}
      onOpenChange={(open) => (open ? undefined : close())}
      title="Assistant"
      description="Ask how to do something, or ask for a quick number."
      className="sm:max-w-lg"
      footer={<AssistantComposer isThinking={isThinking} onSend={send} />}
    >
      <div className="flex h-[60vh] flex-col">
        {messages.length === 0 && <AssistantSuggestionChips suggestions={suggestions} onPick={send} />}
        <AssistantMessageList messages={messages} isThinking={isThinking} onActionClick={close} />
      </div>
    </ResponsiveModal>
  );
}
```

- [ ] **Step 7: Write `assistant-launcher.tsx`**

```tsx
// client/components/assistant/assistant-launcher.tsx
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAssistantPanel } from "@/lib/store/use-assistant-panel";

export function AssistantLauncher() {
  const open = useAssistantPanel((state) => state.open);

  return (
    <Tooltip delayDuration={1000}>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open assistant" onClick={open}>
          <Sparkles className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Ask the assistant</TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd client && npx vitest run __tests__/assistant-panel.test.tsx`
Expected: PASS (2 tests) — if `ResponsiveModal`'s `footer` prop name or `Tooltip` import paths differ from what Step 6/7 assume, fix the import/prop name to match the real files (read them if the test fails on a prop-shape error, not a missing-module error).

- [ ] **Step 9: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/components/assistant client/__tests__/assistant-panel.test.tsx
git commit -m "feat: add assistant chat panel UI components"
```

---

## Task 14: Wire the assistant into the dashboard shell

**Files:**
- Modify: `client/components/dashboard/dashboard-layout.tsx`
- Modify: `client/components/dashboard/dashboard-header.tsx`
- Modify: `client/lib/hooks/use-account-actions.ts`

**Interfaces:**
- Consumes: `<AssistantPanel />` and `<AssistantLauncher />` (Task 13), `useAssistantPanel.getState().open` (Task 12).
- No new exports for later tasks — this is a leaf wiring task.

- [ ] **Step 1: Mount `<AssistantPanel />` in `dashboard-layout.tsx`**

Open `client/components/dashboard/dashboard-layout.tsx`, find the `<OnlineOrdersModal />` line (near where `<FeedbackForm .../>` is mounted), and add the import and the mount alongside it:

```tsx
import { AssistantPanel } from "@/components/assistant/assistant-panel";
```

```tsx
<FeedbackForm open={feedbackOpen} onOpenChange={setFeedbackOpen} />
<OnlineOrdersModal />
<AssistantPanel />
```

- [ ] **Step 2: Add the launcher to `dashboard-header.tsx`**

Open `client/components/dashboard/dashboard-header.tsx`, find the `<NotificationBell />` wrapper block, and add the launcher beside it using the same wrapper style:

```tsx
import { AssistantLauncher } from "@/components/assistant/assistant-launcher";
```

```tsx
{/* Assistant */}
<div className="relative border border-border/50 rounded-full p-0.5">
  <AssistantLauncher />
</div>

{/* Notification Bell */}
<div className="relative border border-border/50 rounded-full p-0.5">
  <NotificationBell />
</div>
```

- [ ] **Step 3: Add "Ask the assistant" to the account menu in `use-account-actions.ts`**

Open `client/lib/hooks/use-account-actions.ts` and add the new action to the `navActions` array, before the `feedback` entry:

```ts
import { Sparkles } from "lucide-react";
import { useAssistantPanel } from "@/lib/store/use-assistant-panel";
```

```ts
const navActions: NavAction[] = [
  {
    key: "assistant",
    label: "Ask the assistant",
    icon: Sparkles,
    onClick: () => {
      onClose();
      useAssistantPanel.getState().open();
    },
  },
  ...(onOpenFeedback ? [{ key: "feedback", label: "Help & Feedback", icon: MessageSquare, onClick: () => { onClose(); onOpenFeedback(); } }] : []),
  { key: "switch", label: "Switch Account", icon: Repeat, onClick: handleSwitchAccount },
  { key: "logout", label: "Log out completely", icon: LogOut, onClick: handleFullLogout, destructive: true },
];
```

- [ ] **Step 4: Run the full unit test suite to check nothing broke**

Run: `cd client && npx vitest run`
Expected: PASS, no regressions in `dashboard-layout`/`dashboard-header`/`use-account-actions` existing tests (if any exist, check `client/__tests__/` for their names first).

- [ ] **Step 5: Type-check and lint**

Run: `cd client && npx tsc --noEmit -p . && npm run lint`
Expected: no errors

- [ ] **Step 6: Browser smoke test**

Run the dev server (`cd client && npm run dev`), then:
1. Open the app logged in as a `store_owner`. Click the assistant icon in the header — confirm the panel opens with suggestion chips.
2. Ask "how do I make a sale" — confirm it replies with steps and a "Make a sale" link; click it and confirm the panel closes and the app navigates to `/pos`.
3. Ask "what's low on stock" — confirm a numeric reply.
4. Ask "gross profit this month" — confirm a currency-formatted reply.
5. Resize to a narrow (mobile) viewport, open the "More" drawer, tap "Ask the assistant" — confirm the same panel opens as a drawer.
6. Log in as a `sales_staff` user with no `view_reports`/`view_financial_reports` permission. Ask "total sales today" — confirm it answers with "my sales" data instead of denying. Ask "gross profit this month" — confirm a polite denial, not a crash.

- [ ] **Step 7: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/components/dashboard/dashboard-layout.tsx client/components/dashboard/dashboard-header.tsx client/lib/hooks/use-account-actions.ts
git commit -m "feat: wire the assistant panel and launcher into the dashboard shell"
```

---

## Task 15: E2E coverage

**Files:**
- Create: `client/e2e/assistant.spec.ts`

**Interfaces:**
- Consumes: `test`/`expect` from `@playwright/test` and the existing `e2e/fixtures.ts` authenticated-session fixture (check its exported fixture name — likely `test` re-exported with a logged-in page — before writing this file; follow the pattern used by a sibling spec, e.g. `e2e/pos.spec.ts` if one exists).

- [ ] **Step 1: Check the fixture pattern**

Run: `grep -n "export" client/e2e/fixtures.ts | head -20` and open one existing spec file under `client/e2e/` to copy its opening imports and login boilerplate exactly.

- [ ] **Step 2: Write the E2E spec, following that pattern**

```ts
// client/e2e/assistant.spec.ts
import { test, expect } from "./fixtures";

test.describe("assistant", () => {
  test("answers a how-do-i question with a working link", async ({ page }) => {
    await page.getByRole("button", { name: "Open assistant" }).click();
    await page.getByLabel("Ask the assistant").fill("how do i make a sale");
    await page.getByLabel("Ask the assistant").press("Enter");

    await expect(page.getByText(/Make a sale/)).toBeVisible();
    await page.getByRole("link", { name: "Make a sale" }).click();
    await expect(page).toHaveURL(/\/pos/);
  });

  test("answers a numeric inventory question", async ({ page }) => {
    await page.getByRole("button", { name: "Open assistant" }).click();
    await page.getByLabel("Ask the assistant").fill("what's low on stock");
    await page.getByLabel("Ask the assistant").press("Enter");

    await expect(page.getByText(/low on stock/)).toBeVisible();
  });
});
```

*Adjust the import path/fixture usage and the login/navigation steps to match whatever `client/e2e/fixtures.ts` actually exports — do not assume `test`/`expect` are re-exported with that exact shape without checking.*

- [ ] **Step 3: Run the E2E spec**

Run: `cd client && npx playwright test e2e/assistant.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/e2e/assistant.spec.ts
git commit -m "test: add e2e coverage for the assistant panel"
```

---

## Task 16: Documentation

**Files:**
- Modify: `client/AGENTS.md`
- Modify: `docs/FEATURE_ROADMAP_SPEC.md`
- Modify: `docs/SYSTEM_FEATURES_DOCUMENTATION.md`
- Modify: `client/lib/constants/permissions.ts` (comments only)

**Interfaces:** none — this task ships no code, only documentation, per `.agents/AGENTS.md` §2's "docs ship with the code, never after it" rule.

- [ ] **Step 1: Add a new section to `client/AGENTS.md`**

Open `client/AGENTS.md`, find its Directory map / "Current focus" sections, and add:

```markdown
## In-app Assistant (Intent Router)

`lib/assistant/` implements an offline, zero-cost, zero-API-key chat assistant. A deterministic
pipeline (`normalize → matchIntent → authorize → execute tool → format`) resolves a typed
question to one of a fixed set of `AssistantTool`s in `tools/` — each wraps an existing
query function and is permission-gated via the same `hasPermission()` used elsewhere.

- **Why deterministic, not an LLM:** no model download, no bundle-size cost, works identically
  offline on Tauri and the PWA on any platform. The `AssistantBrain` interface is the only
  seam a future LLM brain would need — it would reuse `tools/`, `reply-formatters.ts`, and
  `permission-gate.ts` unchanged.
- **No persistence:** conversation state lives only in the `useAssistantPanel` Zustand store,
  in memory. No new SQLite table, no `localStorage`, no sync-engine coverage needed.
- **No audit logging, no crash reporting:** the router never calls `logAction()` or
  `logCrash()` — every question would otherwise create sync churn with no user action behind it.
- **Cashier sales routing:** a `sales_staff` user without `view_reports` asking a sales
  question is routed to `my_sales_today` rather than denied, matching the existing
  cashier-visibility convention used elsewhere in the dashboard.
- **profit_summary matches Report Center, not BI metrics:** it sums `fetchProfitLossReportData`
  rows, not `getBIMetrics`, because the assistant must report the same numbers a user can
  already see in the exported P&L, not a second net-profit definition.
- Add a new capability by: adding an `AssistantTool` in `tools/`, an `IntentDefinition` in
  `intents/`, and registering both in `tools/index.ts` / `intents/index.ts`.
```

- [ ] **Step 2: Amend `docs/FEATURE_ROADMAP_SPEC.md`**

Open the file, find the "AI Assistant Module" section (around lines 325-364), and prepend:

```markdown
**Update (2026-09-29):** Phase 1 shipped as an offline, deterministic intent-router
(`client/lib/assistant/`) — no LLM, no API keys, all platforms. The Gemini/LLM approach
described below remains a possible future phase and, if pursued, must reuse the
`AssistantTool` definitions in `lib/assistant/tools/` rather than redefining them.
```

Do not delete the rest of the section — the LLM proposal is still a live future phase.

- [ ] **Step 3: Add an entry to `docs/SYSTEM_FEATURES_DOCUMENTATION.md`**

Under "2. The Desktop POS App" (or the equivalent current section number — check the file's current numbering first), add:

```markdown
### In-app Assistant

A chat panel (header icon, or "Ask the assistant" in the account menu) that answers
natural-language questions offline: procedural "how do I…" questions link to the right
screen, and data questions ("gross profit this month", "what's low on stock") are answered
from live local data. Fully offline, no API keys, permission-aware (a user only gets answers
they're allowed to see).
```

- [ ] **Step 4: Update `ENFORCED_PERMISSION_KEYS` call-site comments in `permissions.ts`**

Open `client/lib/constants/permissions.ts`, find the comments next to `view_financial_reports`, `view_reports`, `view_cost_fields`, and `process_sales` in `ENFORCED_PERMISSION_KEYS`, and append `; also gates the assistant's <tool_name> tool` to each (one line, no more than the existing 2-line comment convention).

- [ ] **Step 5: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add client/AGENTS.md docs/FEATURE_ROADMAP_SPEC.md docs/SYSTEM_FEATURES_DOCUMENTATION.md client/lib/constants/permissions.ts
git commit -m "docs: document the offline assistant and amend the AI roadmap entry"
```

---

## Final verification (run once, after Task 16)

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
npx vitest run
npx tsc --noEmit -p .
npm run lint
npx knip
npm run test:schema
```

All must pass with zero errors before this branch is considered ready for review/merge.
