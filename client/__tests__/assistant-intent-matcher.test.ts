import { describe, it, expect } from "vitest";
import { matchIntent } from "@/lib/assistant/intent-matcher";
import type { IntentDefinition } from "@/lib/assistant/types";

function intent(id: string, tool: string, phrases: RegExp[], keywords: string[], label = id): IntentDefinition {
  return { id, tool, label, phrases, keywords, buildArgs: () => ({}) };
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
    const result = matchIntent("sold", INTENTS);
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

  it("captures named groups from a matching phrase", () => {
    const withGroup = intent("stock", "stock_lookup", [new RegExp("\\bstock for (?<product>[a-z]+)\\b")], []);
    const result = matchIntent("stock for paracetamol", [withGroup]);
    expect(result.kind).toBe("match");
    if (result.kind === "match") expect(result.captures).toEqual({ product: "paracetamol" });
  });

  it("keeps the first phrase's capture when a later phrase matches with an empty group", () => {
    const twoPhrase = intent(
      "stock",
      "stock_lookup",
      [
        new RegExp("\\bstock for (?<product>[a-z]+)$"),
        new RegExp("\\bstock for (?<product>panadol only)?"),
      ],
      [],
    );
    const result = matchIntent("stock for paracetamol", [twoPhrase]);
    expect(result.kind).toBe("match");
    if (result.kind === "match") expect(result.captures).toEqual({ product: "paracetamol" });
  });

  it("does not break on keywords containing regex metacharacters", () => {
    const priced = intent("priced", "price_lookup", [], ["c++", "n/a", "50%"]);
    expect(() => matchIntent("c++ and n/a and 50%", [priced])).not.toThrow();
  });
});
