import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const CLIENT_ROOT = resolve(__dirname, "..");

const SCANNED_DIRS = ["lib/db", "lib/hooks"];

const MONEY_COLUMNS = [
  "actual_cost_price",
  "actual_selling_price",
  "amount",
  "amount_paid",
  "change_given",
  "cost",
  "cost_price",
  "cost_price_difference",
  "cost_price_override",
  "credit_limit",
  "discount",
  "discount_amount",
  "discount_total",
  "discount_value",
  "expected_cost_price",
  "expected_selling_price",
  "min_spend",
  "outstanding_balance",
  "points_cost",
  "reseller_commission_amount",
  "reseller_commission_redeemed_amount",
  "reseller_markup_amount",
  "selling_price",
  "selling_price_difference",
  "subtotal",
  "tax_amount",
  "total_amount",
  "total_cost",
  "total_price",
  "total_refunded",
  "unit_cost",
  "unit_price",
];

const MONEY_KEY = new RegExp(`\\b(${MONEY_COLUMNS.join("|")})\\s*:`, "g");
const ARITHMETIC = /[+\-*/]/;
const OPENERS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

// Blanks comments in place rather than deleting them, so reported line
// numbers still match the real file.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (line) => " ".repeat(line.length));
}

// Reads the value expression after a `key:`, following nested brackets across
// line breaks so a multi-arg call or a wrapped expression is captured whole
// rather than being cut at its first comma.
function readExpression(source: string, start: number): string {
  const stack: string[] = [];
  let index = start;

  while (index < source.length) {
    const char = source[index];
    if (OPENERS[char]) stack.push(OPENERS[char]);
    else if (stack.length > 0 && char === stack[stack.length - 1]) stack.pop();
    else if (stack.length === 0 && (char === "," || char === ";" || char === ")" || char === "]" || char === "}")) break;
    index += 1;
  }

  return source.slice(start, index).trim();
}

// Removes each `roundMoney(...)` call whole, so arithmetic that is already
// rounded does not count while `roundMoney(a) * b` still does.
function stripRoundedCalls(expression: string): string {
  let result = expression;

  for (;;) {
    const open = result.indexOf("roundMoney(");
    if (open === -1) return result;

    let depth = 0;
    let index = open + "roundMoney(".length - 1;
    for (; index < result.length; index += 1) {
      if (result[index] === "(") depth += 1;
      else if (result[index] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) return result;

    result = result.slice(0, open) + result.slice(index + 1);
  }
}

export function unroundedMoneyWrites(source: string, label: string): string[] {
  const clean = stripComments(source);
  const offenders: string[] = [];

  for (const match of clean.matchAll(MONEY_KEY)) {
    const expression = readExpression(clean, match.index + match[0].length);
    if (!ARITHMETIC.test(stripRoundedCalls(expression))) continue;

    const line = clean.slice(0, match.index).split("\n").length;
    offenders.push(`${label}:${line} ${match[1]}: ${expression.replace(/\s+/g, " ")}`);
  }

  return offenders;
}

function scannedFiles(): string[] {
  const files: string[] = [];

  function walk(relativeDir: string) {
    for (const entry of readdirSync(resolve(CLIENT_ROOT, relativeDir), { withFileTypes: true })) {
      const next = join(relativeDir, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (entry.name.endsWith(".ts")) files.push(next);
    }
  }

  for (const dir of SCANNED_DIRS) walk(dir);
  return files;
}

describe("money write rounding convention", () => {
  const files = scannedFiles();

  it("scans the whole db and data-mutation hook layer", () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files).toContain("lib/db/queries/returns.ts");
    expect(files).toContain("lib/db/sync-engine/push.ts");
    expect(files).toContain("lib/hooks/use-pos-payment.ts");
  });

  it("rounds every computed money value it stores", () => {
    const offenders = files.flatMap((file) =>
      unroundedMoneyWrites(readFileSync(resolve(CLIENT_ROOT, file), "utf8"), file),
    );

    expect(offenders).toEqual([]);
  });

  it.each([
    ["total_cost: unitCost * quantity,", 1],
    ["outstanding_balance: Math.max(0, balance - forgiven),", 1],
    ["subtotal:\n  base *\n  quantity,", 1],
    ["total_cost: roundMoney(a) * b,", 1],
    ["total_cost: roundMoney(unitCost * quantity),", 0],
    ["total_cost: row.cost ? roundMoney(a * b) : null,", 0],
    ["cost_price: costPrice || 0,", 0],
    ["subtotal: number;", 0],
  ])("detector: %s flags %i", (snippet, expected) => {
    expect(unroundedMoneyWrites(`const row = { ${snippet} };`, "fixture")).toHaveLength(expected);
  });
});
