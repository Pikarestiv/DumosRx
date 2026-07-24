import { Tag, Truck, Gift, Star, Percent } from "lucide-react";

export const REDEMPTION_ICONS: Record<string, React.ElementType> = {
  tag: Tag,
  truck: Truck,
  gift: Gift,
  star: Star,
  percent: Percent,
};

export const REDEMPTION_ICON_BG: Record<string, string> = {
  tag: "bg-sky-100 text-sky-700",
  truck: "bg-violet-100 text-violet-700",
  gift: "bg-emerald-100 text-emerald-700",
  star: "bg-amber-100 text-amber-700",
  percent: "bg-rose-100 text-rose-700",
};

export const TIER_COLORS = [
  { value: "bg-amber-600", label: "Amber" },
  { value: "bg-gray-400", label: "Gray" },
  { value: "bg-yellow-500", label: "Yellow" },
  { value: "bg-purple-600", label: "Purple" },
  { value: "bg-sky-600", label: "Sky" },
  { value: "bg-emerald-600", label: "Emerald" },
];
