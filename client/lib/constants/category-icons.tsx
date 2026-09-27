import {
  Package,
  Pill,
  ShieldPlus,
  Citrus,
  Droplet,
  HeartPulse,
  Syringe,
  Sparkles,
  Wind,
  Eye,
  Ear,
  Baby,
  Bandage,
  Leaf,
  UtensilsCrossed,
  SprayCan,
  Bone,
  Brain,
  Stethoscope,
  Thermometer,
  CupSoda,
  Wine,
  Beer,
  Coffee,
  Milk,
  Fish,
  Beef,
  Carrot,
  IceCreamCone,
  Candy,
  Croissant,
  Cigarette,
  Shirt,
  Smartphone,
  Gamepad2,
  Snowflake,
  ShoppingBasket,
  PawPrint,
  Wrench,
  BookOpen,
  Gem,
  Bug,
  Cookie,
  Construction,
  Building2,
  Hammer,
  Zap,
  Cable,
  Plug,
  Lightbulb,
  PaintBucket,
  Bath,
  HardHat,
  type LucideIcon,
} from "lucide-react";
import { calculateLevenshteinDistance } from "@/lib/utils/search";

/** Substring-matched first (longest keyword wins on overlap — see
 * KEYWORD_ICONS_BY_SPECIFICITY below): covers common pharmacy/retail
 * category names with a purpose-built icon. Declaration order here doesn't
 * affect matching, only readability. */
const KEYWORD_ICONS: [string, LucideIcon][] = [
  ["analges", Pill],
  ["antacid", Pill],
  ["pain", Pill],
  ["antibiotic", ShieldPlus],
  ["vitamin", Citrus],
  ["supplement", Leaf],
  ["antiseptic", Droplet],
  ["disinfect", Droplet],
  ["hypertens", HeartPulse],
  ["cardio", HeartPulse],
  ["heart", HeartPulse],
  ["diabet", Syringe],
  ["injection", Syringe],
  ["malaria", Bug],
  ["cream", Sparkles],
  ["skin", Sparkles],
  ["derma", Sparkles],
  ["beauty", Sparkles],
  ["cosmetic", Sparkles],
  ["perfume", Sparkles],
  ["fragrance", Sparkles],
  ["histamine", Wind],
  ["cough", Wind],
  ["cold", Wind],
  ["respirat", Wind],
  ["eye", Eye],
  ["ear", Ear],
  ["baby", Baby],
  ["child", Baby],
  ["first aid", Bandage],
  ["wound", Bandage],
  ["bone", Bone],
  ["ortho", Bone],
  ["mental", Brain],
  ["neuro", Brain],
  ["clinic", Stethoscope],
  ["diagnostic", Stethoscope],
  ["fever", Thermometer],
  ["drug", Pill],

  // Retail/grocery categories commonly brought in via imports (e.g. QuickBooks)
  ["wine", Wine],
  ["beer", Beer],
  ["alcohol", Wine],
  ["liquor", Wine],
  ["coffee", Coffee],
  ["tea", Coffee],
  ["juice", CupSoda],
  ["soda", CupSoda],
  ["soft drink", CupSoda],
  ["water", CupSoda],
  ["beverage", CupSoda],
  ["drink", CupSoda],
  ["dairy", Milk],
  ["milk", Milk],
  ["meat", Beef],
  ["poultry", Beef],
  ["seafood", Fish],
  ["fish", Fish],
  ["produce", Carrot],
  ["vegetable", Carrot],
  ["fruit", Carrot],
  ["bakery", Croissant],
  ["bread", Croissant],
  ["biscuit", Cookie],
  ["cookie", Cookie],
  ["snack", Candy],
  ["candy", Candy],
  ["confection", Candy],
  ["ice cream", IceCreamCone],
  ["frozen", Snowflake],
  ["tobacco", Cigarette],
  ["cigar", Cigarette],
  ["apparel", Shirt],
  ["clothing", Shirt],
  ["electronics", Smartphone],
  ["toy", Gamepad2],
  ["game", Gamepad2],
  ["machine", Wrench],
  ["hardware", Wrench],
  ["tool", Wrench],
  ["stationery", BookOpen],
  ["book", BookOpen],
  ["jewel", Gem],
  ["pet", PawPrint],
  ["provision", ShoppingBasket],
  ["grocery", ShoppingBasket],
  ["toiletr", SprayCan],
  ["food", UtensilsCrossed],
  ["clean", SprayCan],
  ["hygiene", SprayCan],

  // Construction/hardware-store categories (e.g. a building-materials
  // retailer) — a domain the pharmacy and grocery/retail sets above don't
  // cover at all, previously landing on an arbitrary FALLBACK_ICONS
  // rotation or, worse, a fuzzy-matched icon from an unrelated domain
  // ("wine" for "site"/"ware"/"pipe" — see the fuzzy-matcher fix below).
  ["construction", Construction],
  ["building material", Building2],
  ["cement", Building2],
  ["concrete", Building2],
  ["block", Building2],
  ["timber", Hammer],
  ["lumber", Hammer],
  ["electrical", Zap],
  ["electric", Zap],
  ["wiring", Zap],
  ["wire", Zap],
  ["switch", Zap],
  ["cable", Cable],
  ["socket", Plug],
  ["lighting", Lightbulb],
  ["bulb", Lightbulb],
  ["lamp", Lightbulb],
  ["plumbing", Droplet],
  ["pipe", Droplet],
  ["fitting", Droplet],
  ["faucet", Droplet],
  ["paint", PaintBucket],
  ["coating", PaintBucket],
  ["varnish", PaintBucket],
  ["sanitary", Bath],
  ["toilet", Bath],
  ["bathroom", Bath],
  ["safety", HardHat],
  ["helmet", HardHat],
  ["fastener", Wrench],
  ["adhesive", Wrench],
];

/** Deterministic fallback rotation so any custom/unrecognized category still gets a consistent, distinct-looking icon. */
const FALLBACK_ICONS: LucideIcon[] = [
  Pill,
  Leaf,
  Sparkles,
  Droplet,
  HeartPulse,
  Syringe,
  Wind,
  Bandage,
  Bone,
  Brain,
  Stethoscope,
  Thermometer,
  Citrus,
  Ear,
  Eye,
  ShoppingBasket,
  Gem,
  Wrench,
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Catches misspellings/import noise that share no substring with a canonical
// keyword (e.g. "BUSICUIT" for "biscuit") by allowing a few edits, scaled to
// keyword length so short keywords like "tea" don't match everything.
//
// Keywords under 5 letters are excluded entirely (not just given a tighter
// threshold): a 4-letter keyword like "wine" is short enough that ordinary,
// unrelated English words routinely land within 2 edits of it by pure
// coincidence - "site", "ware" (from "sanitary WARE"), and "pipe" (from
// "PIPE fittings") all did, each wrongly picking up the Wine icon. Exact
// substring matches for short keywords still work via KEYWORD_ICONS above;
// only the fuzzy/misspelling path needs the longer floor.
//
// The threshold itself is a flat ~30% of keyword length (floored), not
// ceil(length / 3): that was loose enough to let "electrical" fuzzy-match
// "electronics" (distance 4 out of 11 - the ceil formula's threshold was
// also 4) despite the two naming unrelated things (wiring/lighting
// hardware vs. consumer electronics). 30% still catches genuine
// misspellings the flooring was built for ("BUSICUIT" vs "biscuit" is
// distance 2 of 7, comfortably under floor(7*0.3)=2) while rejecting
// same-ballpark-length words that just happen to share a stem.
function fuzzyKeywordMatch(word: string): LucideIcon | null {
  let best: { icon: LucideIcon; distance: number } | null = null;
  for (const [keyword, icon] of KEYWORD_ICONS) {
    if (keyword.length < 5) continue;
    if (Math.abs(word.length - keyword.length) > 3) continue;
    const distance = calculateLevenshteinDistance(word, keyword);
    const threshold = Math.floor(keyword.length * 0.3);
    if (distance <= threshold && (!best || distance < best.distance)) {
      best = { icon, distance };
    }
  }
  return best?.icon ?? null;
}

// Checked longest-keyword-first rather than in KEYWORD_ICONS' declared
// order: a short keyword that happens to be a substring of a longer,
// unrelated one (e.g. "pain" inside "paint") would otherwise win just
// because it was declared earlier, regardless of which one actually
// describes the category. Sorting once by length means a new keyword added
// anywhere in the list above automatically gets correct priority without
// anyone having to reason about array position.
const KEYWORD_ICONS_BY_SPECIFICITY = [...KEYWORD_ICONS].sort(
  (a, b) => b[0].length - a[0].length,
);

export function getCategoryIcon(categoryName?: string | null): LucideIcon {
  if (!categoryName) return Package;
  const normalized = categoryName.toLowerCase();

  const substringMatch = KEYWORD_ICONS_BY_SPECIFICITY.find(([keyword]) =>
    normalized.includes(keyword),
  );
  if (substringMatch) return substringMatch[1];

  const words = normalized.split(/[^a-z]+/).filter((w) => w.length >= 4);
  for (const word of words) {
    const fuzzyMatch = fuzzyKeywordMatch(word);
    if (fuzzyMatch) return fuzzyMatch;
  }

  return FALLBACK_ICONS[hashString(normalized) % FALLBACK_ICONS.length];
}
