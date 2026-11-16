import {
  Baby,
  Bandage,
  Beef,
  Beer,
  Bath,
  BookOpen,
  Bug,
  Candy,
  Citrus,
  Coffee,
  CookingPot,
  Cookie,
  Croissant,
  CupSoda,
  Droplet,
  Droplets,
  Ear,
  Egg,
  Eye,
  Fish,
  Flame,
  Flower2,
  HeartPulse,
  Layers,
  Milk,
  Nut,
  Pill,
  Scissors,
  Shirt,
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
  Zap,
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
  ["health", Syringe, "syringe injection injections inj needle needles cannula cannular infusion drip ampoule"],
  ["health", Droplet, "syrup syr sirop suspension susp drop drops eyedrop solution ors elixir mixture"],
  ["health", Bug, "coartem lonart amatem artemether arthemeter artesunate camosunate lokmal malaria quinine quinin proguanil mepacrine chloroquine chloroquin insecticide"],
  ["health", ShieldPlus, "amoxil augmentin ampiclox amoxicillin clav cipro ciprofloxacin zinnat cefuroxime ceftriaxone cefixime azithromycin erythromycin flagyl metronidazole antibiotic glove gloves mask condom condoms"],
  ["health", Citrus, "vitamin vitamins vit vitc multivit multivitamin multivitamine omega zinc calcium folic ferobin feroglobin chemiron daravite wellman wellwoman pregnacare"],
  ["health", Candy, "gummies gummy"],
  ["health", Wind, "inhaler nasal cough linctus expectorant cold"],
  ["health", HeartPulse, "bp bpm sphygmomanometer sphygomanometer glucometer oximeter strip strips amlodipine atenolol losartan lisinopril bisoprolol atorvastatin simvastatin"],
  ["health", Thermometer, "thermometer thermomether"],
  ["health", Pill, "capsule capsules cap caps tablet tablets tab tabs lozenge lozenges"],
  ["health", Sparkles, "cream creme ointment gel balm"],
  ["health", Bandage, "plaster bandage gauze cotton suture"],
  ["health", Eye, "eye"],
  ["health", Ear, "ear"],
  ["health", Baby, "baby infant diaper pregnancy"],
  ["health", Droplets, "oil"],
  ["beauty", Bug, "insecticide baygon raid boxer mosquito"],
  ["beauty", Shirt, "detergent omo klin"],
  ["beauty", Wind, "airfreshner freshener diffuser"],
  ["beauty", Scissors, "relaxer shampoo conditioner braid wig hair razor shaving blade"],
  ["beauty", Smile, "toothpaste toothpast paste toothbrush mouthwash"],
  ["beauty", Bath, "soap shower wash bath"],
  ["beauty", Flower2, "perfume parfum cologne eau perf pefume scent scents"],
  ["beauty", SprayCan, "spray bodyspray bodyspary bodysprays bodysplash bodymist deodorant roll rollon"],
  ["beauty", Layers, "wipes tissue pad pads liner"],
  ["beauty", Droplets, "lotion butter serum oil"],
  ["beauty", Sparkles, "scrub exfoliator mask toner polish"],
  ["beauty", Sun, "sunscreen sunblock"],
  ["beauty", Baby, "pampers diaper diapers baby kids"],
  ["beauty", BookOpen, "note book pen pencil envelope envelop"],
  ["beauty", Zap, "battery"],
  ["beauty", Flame, "lighter matches"],
  ["food", Wheat, "pasta spaghetti spagheti macaroni noodles indomie rice flour oats oat quaker cereal cornflakes cornflaks"],
  ["food", CookingPot, "tomato sauce ketchup vinegar mayonnaise mayonaise mayonase salad"],
  ["food", Milk, "milk yoghurt yogurt youghort youghurt cheese"],
  ["food", Wine, "wine vodka whisky whiskey gin champagne"],
  ["food", Beer, "beer stout lager guiness guinness heineken desperado desperados smirnoff"],
  ["food", Coffee, "tea coffee bournvita milo ovaltine nescafe lipton"],
  ["food", CupSoda, "juice malt water cola coke fanta pepsi mirinda spirite sprite lucozade ribena ribenna drink soda energy"],
  ["food", Cookie, "biscuit biscuits bisciut busicuit cookie cookies cracker crackers"],
  ["food", Candy, "chocolate candy gum lollipop sweet sugar"],
  ["food", Nut, "peanut peanuts groundnut cashew"],
  ["food", Croissant, "bread cake pie"],
  ["food", Egg, "egg eggs"],
  ["food", Fish, "fish sardine sardines tuna mackerel mackreal"],
  ["food", Beef, "meat chicken sausage beef"],
  ["food", Droplet, "oil"],
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
