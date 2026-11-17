import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({ uppercase: 1, desktop: true }));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { uppercase_display_enabled: state.uppercase } }),
}));
vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => state.desktop,
}));

import { ServicesList } from "@/components/services/services-list";
import type { Service } from "@/lib/types/service";

const services = [
  { id: "s1", name: "blood pressure check", category: "consultation", code: "BP1", price: 500, is_active: 1 } as Service,
];

function expectCaps(className: string) {
  expect(screen.getByText("blood pressure check").className).toContain(className);
  expect(screen.getByText("consultation").className).toContain(className);
}

describe("Services list and the store's capitalisation setting", () => {
  for (const desktop of [true, false]) {
    const view = desktop ? "table" : "mobile cards";

    it(`shows names and categories in capitals in the ${view} when the setting is on`, () => {
      state.uppercase = 1;
      state.desktop = desktop;
      render(<ServicesList services={services} />);
      expectCaps("uppercase");
    });

    it(`capitalises words in the ${view} when the setting is off`, () => {
      state.uppercase = 0;
      state.desktop = desktop;
      render(<ServicesList services={services} />);
      expectCaps("capitalize");
    });
  }
});
