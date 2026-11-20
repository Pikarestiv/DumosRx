import { matchCategoryIcon } from "@/lib/constants/category-icons";
import { Hand, Leaf, Scissors, Smile, Sparkles, Stethoscope, Zap, type LucideIcon } from "lucide-react";

const SERVICE_RULES: [LucideIcon, string[]][] = [
  [Smile, ["dental", "dentist", "teeth", "tooth", "gum", "oral", "braces", "veneer", "denture", "orthodont"]],
  [Zap, ["laser", "removal", "electrolysis"]],
  [Hand, ["massage", "manicure", "pedicure", "nail", "foot", "reflexology"]],
  [Scissors, ["hair", "barb", "braid", "haircut", "salon", "wig"]],
  [Leaf, ["wellness", "detox", "spa", "aroma", "therapy"]],
  [Stethoscope, ["consult", "examination", "clinic", "checkup", "screening", "test"]],
  [Sparkles, ["facial", "face", "skin", "peel", "lift", "glow", "cleansing"]],
];

export function getServiceIcon(categoryName?: string | null, serviceName?: string | null): LucideIcon {
  const text = `${serviceName ?? ""} ${categoryName ?? ""}`.toLowerCase();
  const match = SERVICE_RULES.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)));
  return match ? match[0] : (matchCategoryIcon(categoryName) ?? Sparkles);
}
