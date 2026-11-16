import {
  Baby,
  Bandage,
  Beef,
  Beer,
  Bath,
  Candy,
  Citrus,
  Coffee,
  CookingPot,
  Cookie,
  Croissant,
  CupSoda,
  Droplet,
  Droplets,
  Egg,
  Eye,
  Fish,
  Flower2,
  HeartPulse,
  Layers,
  Milk,
  Pill,
  Scissors,
  ShieldPlus,
  Smile,
  Sparkles,
  SprayCan,
  Sun,
  Syringe,
  Thermometer,
  Wheat,
  Wind,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { getCategoryIcon, matchCategoryIcon } from "@/lib/constants/category-icons";

type Family = "health" | "beauty" | "food";

const FAMILY_KEYWORDS: Record<Family, string[]> = {
  health: ["drug", "supplement", "medic", "pharm", "vitamin", "machine", "clinic"],
  beauty: ["cosmetic", "toiletr", "perfume", "lotion", "soap", "wash", "scrub", "spray", "skin", "hair", "body", "wipes", "face"],
  food: ["provision", "beverage", "wine", "sweet", "biscuit", "busicuit", "pasta", "tea", "tomato", "food", "grocery", "drink", "juice", "snack"],
};

const PRODUCT_RULES: [Family, LucideIcon, string][] = [
  ["health", Syringe, "syringe injection inj needle cannula"],
  ["health", Pill, "capsule capsules caps tablet tablets tab tabs"],
  ["health", Droplet, "syrup suspension susp drops solution ors rehydration"],
  ["health", Sparkles, "cream ointment gel"],
  ["health", Thermometer, "thermometer"],
  ["health", HeartPulse, "sphygmomanometer sphygomanometer glucometer oximeter"],
  ["health", Bandage, "plaster bandage gauze cotton"],
  ["health", ShieldPlus, "glove gloves mask condom"],
  ["health", Citrus, "vitamin"],
  ["health", Eye, "eye"],
  ["health", Wind, "inhaler nasal"],
  ["health", Baby, "baby infant diaper pregnancy"],
  ["beauty", Scissors, "relaxer shampoo conditioner braid wig hair"],
  ["beauty", Bath, "soap shower wash"],
  ["beauty", Droplets, "lotion butter serum oil"],
  ["beauty", Sparkles, "scrub exfoliator mask"],
  ["beauty", Flower2, "perfume parfum cologne eau"],
  ["beauty", SprayCan, "spray bodyspray bodysplash deodorant"],
  ["beauty", Layers, "wipes tissue"],
  ["beauty", Smile, "toothpaste toothbrush mouthwash"],
  ["beauty", Sun, "sunscreen sunblock"],
  ["beauty", Baby, "baby kids"],
  ["food", Wheat, "pasta spaghetti macaroni noodles indomie rice flour oats cereal cornflakes"],
  ["food", CookingPot, "tomato sauce ketchup vinegar paste"],
  ["food", Milk, "milk yoghurt yogurt cheese"],
  ["food", Wine, "wine vodka whisky whiskey gin champagne"],
  ["food", Beer, "beer stout lager"],
  ["food", Coffee, "tea coffee"],
  ["food", CupSoda, "juice malt water cola soda energy"],
  ["food", Cookie, "biscuit biscuits cookie cookies cracker"],
  ["food", Candy, "chocolate candy gum lollipop sweet"],
  ["food", Croissant, "bread cake pie"],
  ["food", Egg, "egg eggs"],
  ["food", Fish, "fish sardine tuna"],
  ["food", Beef, "meat chicken sausage beef"],
];

function categoryFamily(category: string): Family | null {
  const text = category.toLowerCase();
  const family = (Object.keys(FAMILY_KEYWORDS) as Family[]).find((key) =>
    FAMILY_KEYWORDS[key].some((keyword) => text.includes(keyword)),
  );
  return family ?? null;
}

function nameTokens(productName: string): Set<string> {
  return new Set(productName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

export function getProductIcon(categoryName?: string | null, productName?: string | null): LucideIcon {
  const category = categoryName ?? "";
  const family = category ? categoryFamily(category) : null;
  const categoryIcon = matchCategoryIcon(category);
  if (productName && (family || !categoryIcon)) {
    const tokens = nameTokens(productName);
    const rule = PRODUCT_RULES.find(
      ([ruleFamily, , words]) =>
        (!family || ruleFamily === family) && words.split(" ").some((word) => tokens.has(word)),
    );
    if (rule) return rule[1];
  }
  return categoryIcon ?? getCategoryIcon(categoryName);
}
