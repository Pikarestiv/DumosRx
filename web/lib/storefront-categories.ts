export type CategoryIcon =
  | "lighting"
  | "electrical"
  | "pill"
  | "spray"
  | "jar"
  | "droplet"
  | "tools"
  | "basket"
  | "box"
  | "perfume"
  | "bath"
  | "wipes"
  | "hair"
  | "wine"
  | "drink"
  | "sweet"
  | "biscuit"
  | "grain"
  | "sauce"
  | "device"
  | "air"
  | "syringe";

interface CategoryRule {
  icon: CategoryIcon;
  keywords: RegExp;
}

const ICON_RULES: CategoryRule[] = [
  { icon: "lighting", keywords: /(\blights?\b|\blighting\b|bulb|lamp|clairage|ampoule)/i },
  { icon: "electrical", keywords: /(lectri|breaker|switch|socket|cable|wire|disjoncteur)/i },
  { icon: "perfume", keywords: /(perfume|parfum|fragrance|cologne)/i },
  { icon: "spray", keywords: /(spray|aerosol|inhaler)/i },
  { icon: "wipes", keywords: /(wipes|lingette)/i },
  { icon: "bath", keywords: /(soap|wash|shower|savon|douche|toiletr)/i },
  { icon: "hair", keywords: /(\bhair\b|cheveux|relaxer|shampoo)/i },
  { icon: "pill", keywords: /(drug|medicine|medication|tablet|capsule|pill|supplement|vitamin|gumm)/i },
  { icon: "jar", keywords: /(cream|lotion|balm|ointment|moisturi[sz]er|butter|cosmetic)/i },
  { icon: "droplet", keywords: /(serum|scrub|toner|cleanser|droplet)/i },
  { icon: "tools", keywords: /(tool|hardware|drill|wrench|outillage)/i },
  { icon: "wine", keywords: /(\bwines?\b|\bvins?\b|spirit|liquor|champagne|whisk)/i },
  { icon: "drink", keywords: /(juice|\bjus\b|soda|beverage|\bwater\b|\btea\b|\bcoffee\b|malt|boisson)/i },
  { icon: "sweet", keywords: /(sweet|candy|confection|bonbon|chocolate)/i },
  { icon: "biscuit", keywords: /(biscuit|busicuit|cookie)/i },
  { icon: "grain", keywords: /(pasta|p[aâ]tes|\brice\b|\briz\b|flour|cereal|noodle)/i },
  { icon: "sauce", keywords: /(tomato|sauce|vinegar|pomodor|tomate)/i },
  { icon: "device", keywords: /(machine|device|apparatus|monitor|appareil)/i },
  { icon: "air", keywords: /(diffuser|humidifier)/i },
  { icon: "basket", keywords: /(provision|grocer|food|drink|beverage|snack|biscuit|basket)/i },
];

type Family = "health" | "beauty" | "food";

const ICON_FAMILY: ReadonlyMap<CategoryIcon, Family> = new Map<CategoryIcon, Family>([
  ["pill", "health"],
  ["device", "health"],
  ["syringe", "health"],
  ["jar", "beauty"],
  ["droplet", "beauty"],
  ["spray", "beauty"],
  ["bath", "beauty"],
  ["perfume", "beauty"],
  ["wipes", "beauty"],
  ["hair", "beauty"],
  ["basket", "food"],
  ["wine", "food"],
  ["drink", "food"],
  ["sweet", "food"],
  ["biscuit", "food"],
  ["grain", "food"],
  ["sauce", "food"],
]);

const NAME_RULES: [Family, CategoryIcon, string][] = [
  ["health", "syringe", "syringe injection injections inj needle cannula infusion drip ampoule"],
  ["health", "droplet", "syrup syr sirop suspension susp drop drops eyedrop solution ors elixir"],
  ["health", "pill", "capsule capsules cap caps tablet tablets tab tabs lozenge lozenges"],
  ["health", "device", "thermometer thermomether sphygmomanometer sphygomanometer glucometer oximeter bp bpm strip strips"],
  ["beauty", "hair", "relaxer shampoo conditioner braid wig hair razor shaving"],
  ["beauty", "bath", "soap shower wash bath"],
  ["beauty", "perfume", "perfume parfum cologne perf pefume scent scents"],
  ["beauty", "wipes", "wipes"],
  ["beauty", "spray", "spray bodyspray bodyspary bodysprays bodysplash bodymist deodorant roll rollon insecticide"],
  ["food", "grain", "pasta spaghetti spagheti macaroni noodles indomie rice flour oats oat cereal cornflakes cornflaks"],
  ["food", "sauce", "tomato sauce ketchup vinegar mayonnaise mayonaise mayonase salad"],
  ["food", "wine", "wine vodka whisky gin champagne"],
  ["food", "drink", "beer stout guiness guinness heineken juice malt water cola coke fanta pepsi mirinda lucozade tea coffee bournvita milo ovaltine drink soda"],
  ["food", "biscuit", "biscuit biscuits bisciut busicuit cookie cookies cracker crackers"],
  ["food", "sweet", "chocolate candy gum lollipop sweet sugar"],
];

const KNOWN_TYPOS: ReadonlyMap<string, string> = new Map([["busicuit", "biscuit"]]);

export function categoryIcon(name: string, productName?: string | null): CategoryIcon {
  const fromCategory = ICON_RULES.find((rule) => rule.keywords.test(name))?.icon ?? "box";
  const family = ICON_FAMILY.get(fromCategory);
  if (!family || !productName) return fromCategory;
  const tokens = new Set(productName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const rule = NAME_RULES.find(
    ([ruleFamily, , words]) => ruleFamily === family && words.split(" ").some((word) => tokens.has(word)),
  );
  return rule ? rule[1] : fromCategory;
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
