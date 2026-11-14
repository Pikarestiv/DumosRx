import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { describeOpenStatus, formatClock, openStatus, summarizeHours } from "@/lib/storefront-hours";
import {
  STOREFRONT_LOCALES,
  formatStorefrontMoney,
  pluralForm,
  resolveEnabledLocales,
  resolveLocale,
  translate,
  translatePlural,
} from "@/lib/storefront-i18n";
import { EN_MESSAGES } from "@/lib/storefront-messages-en";
import { FR_MESSAGES } from "@/lib/storefront-messages-fr";
import { viewAllProductsLabel } from "@/lib/storefront-display";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("storefront messages", () => {
  it("translates every English message, and each translation keeps exactly the same placeholders", () => {
    for (const key of Object.keys(EN_MESSAGES) as (keyof typeof EN_MESSAGES)[]) {
      expect(FR_MESSAGES[key], `fr is missing ${key}`).toBeTruthy();
      expect(placeholders(FR_MESSAGES[key]), `placeholders differ for ${key}`).toEqual(placeholders(EN_MESSAGES[key]));
    }
    expect(Object.keys(FR_MESSAGES).sort()).toEqual(Object.keys(EN_MESSAGES).sort());
  });

  it("never leaves a French message identical to its English one, except names that are the same in both", () => {
    const sameInBoth = new Set(["hero.whatsapp.short", "cart.total", "checkout.total"]);
    for (const key of Object.keys(EN_MESSAGES) as (keyof typeof EN_MESSAGES)[]) {
      if (sameInBoth.has(key)) continue;
      expect(FR_MESSAGES[key], `${key} looks untranslated`).not.toBe(EN_MESSAGES[key]);
    }
  });

  it("offers exactly the languages the server accepts", () => {
    const php = readFileSync(resolve(__dirname, "..", "..", "laravel-server/app/Support/StorefrontLocales.php"), "utf8");
    const serverIds = [...(/public const IDS = \[([^\]]*)\]/.exec(php)?.[1] ?? "").matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

    expect(serverIds).toEqual([...STOREFRONT_LOCALES]);
  });
});

describe("translate", () => {
  it("fills placeholders and leaves an unknown one visible rather than printing undefined", () => {
    expect(translate("en", "card.added", { name: "Bulb" })).toBe("Bulb added to cart");
    expect(translate("fr", "card.added", { name: "Ampoule" })).toBe("Ampoule ajouté au panier");
    expect(translate("en", "card.added")).toBe("{name} added to cart");
  });

  it("pluralises by each language's rule: French treats zero as singular, English does not", () => {
    expect([0, 1, 2].map((n) => pluralForm("en", n))).toEqual(["other", "one", "other"]);
    expect([0, 1, 2].map((n) => pluralForm("fr", n))).toEqual(["one", "one", "other"]);
    expect(translatePlural("en", "products.count", 1)).toBe("1 item");
    expect(translatePlural("fr", "products.count", 12)).toBe("12 articles");
    expect(translatePlural("fr", "shop.count", 0)).toBe("0 article");
  });

  it("labels the view-all link in the visitor's language", () => {
    expect(viewAllProductsLabel(16, 16, "fr")).toBe("Voir les 16 articles");
    expect(viewAllProductsLabel(1, 1, "fr")).toBe("Voir 1 article");
    expect(viewAllProductsLabel(50, undefined, "fr")).toBe("Voir tous les articles");
  });
});

describe("resolving a store's languages", () => {
  it("falls back to English for anything unsupported", () => {
    expect([undefined, null, "", "de", "FR", 5].map(resolveLocale)).toEqual(["en", "en", "en", "en", "en", "en"]);
    expect(resolveLocale("fr")).toBe("fr");
  });

  it("always includes the default language, drops unknown ones and repeats", () => {
    expect(resolveEnabledLocales("fr", ["en", "fr", "de", "en"])).toEqual(["fr", "en"]);
    expect(resolveEnabledLocales("en", null)).toEqual(["en"]);
    expect(resolveEnabledLocales("fr", ["en"])).toEqual(["fr", "en"]);
  });
});

describe("money in each language", () => {
  it("writes English naira as ₦1,500 and French CFA francs as 1 500 FCFA", () => {
    expect(formatStorefrontMoney(1500, "NGN", "en")).toBe("₦1,500");
    expect(formatStorefrontMoney(1500, "XAF", "fr").replace(/\s/g, " ")).toBe("1 500 FCFA");
  });

  it("keeps real decimals and drops empty ones", () => {
    expect(formatStorefrontMoney(1500.5, "NGN", "en")).toBe("₦1,500.5");
    expect(formatStorefrontMoney(0, "NGN", "en")).toBe("₦0");
  });
});

describe("opening hours in French", () => {
  const hours = { mon: { open: "08:00", close: "18:00" }, tue: { open: "08:00", close: "18:00" } };

  it("writes times as 08h00 and days in French", () => {
    expect(formatClock("18:00", "fr")).toBe("18h00");
    expect(formatClock("08:05", "fr")).toBe("08h05");
    expect(summarizeHours(hours, "fr")).toBe("lun – mar · 08h00 – 18h00");
  });

  it("says when the store opens, in French", () => {
    const status = openStatus(hours, new Date(2026, 10, 16, 19, 0))!;
    expect(describeOpenStatus(status, "fr")).toBe("Fermé · ouvre demain à 08h00");
    expect(describeOpenStatus(openStatus(hours, new Date(2026, 10, 16, 10, 0))!, "fr")).toBe("Ouvert · ferme à 18h00");
  });
});
