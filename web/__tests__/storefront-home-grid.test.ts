import { describe, expect, it } from "vitest";

import { PRODUCT_GRID_CAPACITY, SERVICE_GRID_CAPACITY, homeGridLayout } from "@/lib/storefront-home-grid";

describe("storefront home grid: two rows on desktop, the last tile a '+ N more' card", () => {
  it("fills two rows at every width and ends each with a more tile counting what is left", () => {
    const layout = homeGridLayout(20, 20, PRODUCT_GRID_CAPACITY);

    expect(layout.shownCount).toBe(9);
    expect(layout.itemClasses.slice(0, 7).every((c) => c === "block")).toBe(true);
    expect(layout.itemClasses.slice(7)).toEqual(["hidden xl:block", "hidden xl:block"]);
    expect(layout.moreTile).toEqual({
      className: "block",
      counts: [
        { value: 13, className: "block xl:hidden" },
        { value: 11, className: "hidden xl:block" },
      ],
    });
  });

  it("shows everything with no more tile when it all fits", () => {
    const layout = homeGridLayout(8, 8, PRODUCT_GRID_CAPACITY);

    expect(layout.shownCount).toBe(8);
    expect(layout.itemClasses.every((c) => c === "block")).toBe(true);
    expect(layout.moreTile).toBeNull();
  });

  it("adds the more tile only below xl when the extra items fit the wider desktop grid", () => {
    const layout = homeGridLayout(9, 9, PRODUCT_GRID_CAPACITY);

    expect(layout.shownCount).toBe(9);
    expect(layout.itemClasses.slice(7)).toEqual(["hidden xl:block", "hidden xl:block"]);
    expect(layout.moreTile).toEqual({ className: "block xl:hidden", counts: [{ value: 2, className: "block xl:hidden" }] });
  });

  it("keeps services to three rows on a phone and two on desktop", () => {
    const layout = homeGridLayout(12, 12, SERVICE_GRID_CAPACITY);

    expect(layout.itemClasses.slice(5, 7)).toEqual(["hidden lg:block", "hidden lg:block"]);
    expect(layout.itemClasses.slice(7)).toEqual(["hidden xl:block", "hidden xl:block"]);
    expect(layout.moreTile?.counts).toEqual([
      { value: 7, className: "block lg:hidden" },
      { value: 5, className: "hidden lg:block xl:hidden" },
      { value: 3, className: "hidden xl:block" },
    ]);
  });

  it("counts the uncapped total even when fewer items are loaded than the grid holds", () => {
    const layout = homeGridLayout(128, 4, PRODUCT_GRID_CAPACITY);

    expect(layout.shownCount).toBe(4);
    expect(layout.moreTile?.counts.map((c) => c.value)).toEqual([124]);
  });

  it("renders nothing for an empty list", () => {
    expect(homeGridLayout(0, 0, SERVICE_GRID_CAPACITY)).toEqual({ shownCount: 0, itemClasses: [], moreTile: null });
  });
});
