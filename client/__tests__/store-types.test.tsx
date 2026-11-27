import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { STORE_TYPES, normalizeStoreType } from "@/lib/constants/store-types";
import { terminology } from "@/lib/context/store-terminology";
import { BusinessVerticalCard } from "@/components/settings/store/business-vertical-card";
import { RegisterAccountFields } from "@/components/setup/steps/register-account-fields";

const VALUES = STORE_TYPES.map((type) => type.value);

function renderRegisterFields(storeType: string) {
  const noop = () => {};
  render(
    <RegisterAccountFields
      storeType={storeType}
      setStoreType={noop}
      email=""
      setEmail={noop}
      phone=""
      setPhone={noop}
      password=""
      setPassword={noop}
      confirmPassword=""
      setConfirmPassword={noop}
      passwordError=""
      clearPasswordError={noop}
    />,
  );
}

describe("store type list", () => {
  it("matches the server's accepted list, in the same order", () => {
    const php = readFileSync(resolve(__dirname, "..", "..", "laravel-server/app/Support/StoreTypes.php"), "utf8");
    const serverList = /public const IDS = \[([^\]]*)\]/.exec(php)?.[1] ?? "";

    expect(VALUES).toEqual([...serverList.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
  });

  it.each(VALUES)("keeps a stored %s as it is", (value) => {
    expect(normalizeStoreType(value)).toBe(value);
  });

  it.each([null, undefined, ""])("reads an empty %j as the legacy pharmacy default", (value) => {
    expect(normalizeStoreType(value)).toBe("pharmacy");
  });

  it.each(["store", "florist", "retail", "__proto__"])("reads %j as general", (value) => {
    expect(normalizeStoreType(value)).toBe("general");
  });

  it("gives every store type its terminology, with only pharmacy using NAFDAC", () => {
    for (const value of VALUES) {
      const words = terminology(value);
      expect(words.products).toBeTruthy();
      expect(words.registration_number === "NAFDAC Number").toBe(value === "pharmacy");
    }
  });
});

describe("store type pickers", () => {
  it("offers every store type in settings and switches to the one clicked", () => {
    const onSwitch = vi.fn();
    render(<BusinessVerticalCard storeType="pharmacy" handleSwitchVertical={onSwitch} />);

    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(STORE_TYPES.map((t) => t.label));
    expect(screen.getByRole("button", { name: "Pharmacy" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Hardware & Building Materials" }));
    expect(onSwitch).toHaveBeenCalledWith("hardware");
  });

  it("offers the same list when registering a new store", () => {
    renderRegisterFields("beauty");
    const select = screen.getByLabelText("Store Type") as HTMLSelectElement;

    expect([...select.options].map((o) => o.value)).toEqual(VALUES);
    expect(select.value).toBe("beauty");
  });
});
