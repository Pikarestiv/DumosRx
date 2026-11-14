import { describe, it, expect } from "vitest";
import { matchIntent } from "@/lib/assistant/intent-matcher";
import { INTENTS } from "@/lib/assistant/intents";
import { HELP_TOPICS } from "@/lib/assistant/help-catalog";
import { normalizeUtterance } from "@/lib/assistant/normalize";

function routes(utterance: string): string | null {
  const result = matchIntent(normalizeUtterance(utterance).normalized, INTENTS);
  return result.kind === "match" ? result.intent.id : null;
}

describe("assistant catalog help topics", () => {
  it.each(["How do I add a product photo?", "upload an image for paracetamol", "where do product pictures go"])(
    "routes %j to the product image help topic",
    (utterance) => {
      expect(routes(utterance)).toBe("navigate_product_images");
    },
  );

  it.each(["print barcode labels", "I need price stickers"])("routes %j to the label printing topic (A-385)", (utterance) => {
    expect(routes(utterance)).toBe("navigate_print_labels");
  });

  it("holds no control characters in any help phrase, so a written \\b is a word boundary (A-385)", () => {
    const sources = HELP_TOPICS.flatMap((topic) => topic.phrases.map((phrase) => phrase.source));

    expect(sources.filter((source) => /[\u0000-\u001f]/.test(source))).toEqual([]);
  });
});
