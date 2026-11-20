import { describe, it, expect } from "vitest";
import { getCategoryListIcon, matchCategoryIcon } from "@/lib/constants/category-icons";

describe("settings category list icon", () => {
  it("gives every category with no keyword match the same neutral icon", () => {
    expect(matchCategoryIcon("Zzqx Wumpf")).toBeNull();
    expect(matchCategoryIcon("Plmkn Qwrt")).toBeNull();
    expect(getCategoryListIcon("Zzqx Wumpf")).toBe(getCategoryListIcon("Plmkn Qwrt"));
  });

  it("keeps the matched icon when the name has a keyword", () => {
    const matched = matchCategoryIcon("Body wash");
    expect(matched).not.toBeNull();
    expect(getCategoryListIcon("Body wash")).toBe(matched);
    expect(getCategoryListIcon("Zzqx Wumpf")).not.toBe(matched);
  });

  it("handles a missing name", () => {
    expect(getCategoryListIcon(null)).toBe(getCategoryListIcon(undefined));
  });
});
