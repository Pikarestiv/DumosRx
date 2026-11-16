import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { StoreClosedNotice } from "@/components/storefront/store-closed-notice";
import type { OpeningHours } from "@/lib/storefront-hours";

const HOURS: OpeningHours = {
  mon: { open: "08:00", close: "18:00" },
  tue: { open: "08:00", close: "18:00" },
};

describe("StoreClosedNotice", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("tells a visitor when the store opens, and that ordering still works", () => {
    vi.setSystemTime(new Date(2026, 10, 16, 19, 0));
    render(<StoreClosedNotice hours={HOURS} />);

    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain("Closed · opens tomorrow at 8:00 am");
    expect(notice.textContent).toMatch(/still order now/i);
  });

  it("says nothing while the store is open", () => {
    vi.setSystemTime(new Date(2026, 10, 16, 10, 0));
    const { container } = render(<StoreClosedNotice hours={HOURS} />);

    expect(container.textContent).toBe("");
  });

  it("says nothing for a store that has set no hours, rather than guessing it is closed", () => {
    vi.setSystemTime(new Date(2026, 10, 16, 3, 0));

    expect(render(<StoreClosedNotice hours={null} />).container.textContent).toBe("");
    expect(render(<StoreClosedNotice hours={{}} />).container.textContent).toBe("");
  });
});
