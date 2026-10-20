import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Every search surface in the app drives its expensive downstream work off useDebouncedValue, binding the input itself to…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-search-surfaces-debounced-test-ts-L5

const CLIENT_ROOT = join(__dirname, "..");

const SEARCH_SURFACES = [
  "components/products/product-database.tsx",
  "components/pos/pos-transaction-history.tsx",
  "components/pos/request-item-dialog.tsx",
  "lib/hooks/use-customer-management.ts",
  "lib/hooks/use-expenses-page.ts",
];

describe("search surfaces debounce their expensive work", () => {
  it.each(SEARCH_SURFACES)("%s drives its search off a debounced value", (relativePath) => {
    const code = readFileSync(join(CLIENT_ROOT, relativePath), "utf8");
    expect(code).toContain("useDebouncedValue");
  });

  it("the product catalog keys its fuzzy search on the debounced term, not the raw one", () => {
    const code = readFileSync(
      join(CLIENT_ROOT, "components/products/product-database.tsx"),
      "utf8",
    );

    const searchCall = code.match(/genericFuzzySearch\(\s*([A-Za-z0-9_]+)/);
    expect(searchCall, "genericFuzzySearch call not found").not.toBeNull();
    expect(searchCall![1]).toBe("debouncedSearchTerm");
  });
});
