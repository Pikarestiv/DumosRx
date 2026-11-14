import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { LanguageSwitch } from "@/components/storefront/language-switch";
import { StorefrontI18nProvider, useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import type { StorefrontLocale } from "@/lib/storefront-i18n";

function Greeting() {
  const { t, locale } = useStorefrontI18n();
  return <p data-locale={locale}>{t("hero.browse")}</p>;
}

function renderStore(defaultLocale: StorefrontLocale, enabledLocales: StorefrontLocale[]) {
  return render(
    <StorefrontI18nProvider defaultLocale={defaultLocale} enabledLocales={enabledLocales}>
      <LanguageSwitch />
      <Greeting />
    </StorefrontI18nProvider>,
  );
}

describe("storefront language switch", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = "en";
  });

  it("starts in the store's default language and marks the document with it", () => {
    renderStore("fr", ["fr", "en"]);

    expect(screen.getByText("Voir les articles").getAttribute("data-locale")).toBe("fr");
    expect(document.documentElement.lang).toBe("fr");
  });

  it("switches language without a reload, remembers the choice, and updates the document language", () => {
    renderStore("fr", ["fr", "en"]);

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByText("Browse products")).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem("dumosrx-storefront-locale")).toBe("en");
    expect(screen.getByRole("button", { name: "English" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("opens in the language the visitor chose last time", () => {
    window.localStorage.setItem("dumosrx-storefront-locale", "en");
    renderStore("fr", ["fr", "en"]);

    expect(screen.getByText("Browse products")).toBeTruthy();
  });

  it("ignores a remembered language this store does not offer", () => {
    window.localStorage.setItem("dumosrx-storefront-locale", "en");
    renderStore("fr", ["fr"]);

    expect(screen.getByText("Voir les articles")).toBeTruthy();
  });

  it("ignores a remembered value that is not a language at all", () => {
    window.localStorage.setItem("dumosrx-storefront-locale", "klingon");
    renderStore("en", ["en", "fr"]);

    expect(screen.getByText("Browse products")).toBeTruthy();
  });

  it("shows no switch when the store offers a single language", () => {
    renderStore("fr", ["fr"]);

    expect(screen.queryByRole("group", { name: "Langue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "English" })).toBeNull();
  });

  it("labels each button with the language's own name so it can be found in any language", () => {
    renderStore("en", ["en", "fr"]);

    expect(screen.getByRole("button", { name: "Français" }).getAttribute("lang")).toBe("fr");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Français" }));
    });
    expect(screen.getByRole("group", { name: "Langue" })).toBeTruthy();
  });
});
