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
  type LucideIcon,
} from "lucide-react";

/** Substring-matched first — covers common pharmacy/retail category names with a purpose-built icon. */
const KEYWORD_ICONS: [string, LucideIcon][] = [
  ["pain", Pill],
  ["antibiotic", ShieldPlus],
  ["vitamin", Citrus],
  ["supplement", Leaf],
  ["antiseptic", Droplet],
  ["disinfect", Droplet],
  ["cardio", HeartPulse],
  ["heart", HeartPulse],
  ["diabet", Syringe],
  ["injection", Syringe],
  ["skin", Sparkles],
  ["derma", Sparkles],
  ["beauty", Sparkles],
  ["cosmetic", Sparkles],
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
  ["food", UtensilsCrossed],
  ["beverage", UtensilsCrossed],
  ["clean", SprayCan],
  ["hygiene", SprayCan],
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
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getCategoryIcon(categoryName?: string | null): LucideIcon {
  if (!categoryName) return Package;
  const normalized = categoryName.toLowerCase();

  const match = KEYWORD_ICONS.find(([keyword]) => normalized.includes(keyword));
  if (match) return match[1];

  return FALLBACK_ICONS[hashString(normalized) % FALLBACK_ICONS.length];
}
