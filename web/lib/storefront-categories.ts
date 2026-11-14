export type CategoryIcon =
  | "lighting"
  | "electrical"
  | "pill"
  | "spray"
  | "jar"
  | "droplet"
  | "tools"
  | "basket"
  | "box";

interface CategoryRule {
  icon: CategoryIcon;
  keywords: RegExp;
}

const ICON_RULES: CategoryRule[] = [
  { icon: "lighting", keywords: /(light|bulb|lamp|clairage|ampoule)/i },
  { icon: "electrical", keywords: /(electric|breaker|protection|switch|socket|cable|wire|disjoncteur)/i },
  { icon: "spray", keywords: /(spray|aerosol|inhaler)/i },
  { icon: "pill", keywords: /(drug|medicine|medication|tablet|capsule|pill|supplement|vitamin|gumm)/i },
  { icon: "jar", keywords: /(cream|lotion|balm|ointment|moisturi[sz]er|butter)/i },
  { icon: "droplet", keywords: /(serum|scrub|toner|cleanser|droplet)/i },
  { icon: "tools", keywords: /(tool|hardware|drill|wrench|outillage)/i },
  { icon: "basket", keywords: /(provision|grocer|food|drink|beverage|snack|biscuit|basket)/i },
];

const KNOWN_TYPOS: ReadonlyMap<string, string> = new Map([["busicuit", "biscuit"]]);

export function categoryIcon(name: string): CategoryIcon {
  return ICON_RULES.find((rule) => rule.keywords.test(name))?.icon ?? "box";
}

export function correctCategoryName(name: string): string {
  return name
    .split(/(\s+)/)
    .map((part) => {
      const fixed = KNOWN_TYPOS.get(part.toLowerCase());
      if (!fixed) return part;
      return /^\p{Lu}/u.test(part) ? fixed.charAt(0).toUpperCase() + fixed.slice(1) : fixed;
    })
    .join("");
}

const TINT_BASES = ["#F4EEDD", "#E8E9EB", "#EEE6DC", "#E2E8E3", "#E6ECF3", "#EEE3E8"] as const;
const ACCENT_SHARE_PERCENT = 12;

export function categoryTint(name: string): string {
  const normalised = name.trim().toLowerCase();
  let hash = 0;
  for (const char of normalised) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const base = TINT_BASES[hash % TINT_BASES.length];
  return `color-mix(in oklab, var(--primary) ${ACCENT_SHARE_PERCENT}%, ${base})`;
}
