import {
  AirVent,
  Bath,
  Box,
  Candy,
  Cookie,
  CookingPot,
  CupSoda,
  Flower2,
  FlaskRound,
  HeartPulse,
  Layers,
  Scissors,
  Syringe,
  Wheat,
  Wine,
  Droplet,
  Lightbulb,
  Pill,
  PlugZap,
  ShoppingBasket,
  SprayCan,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { categoryIcon, categoryTint, correctCategoryName, type CategoryIcon } from "@/lib/storefront-categories";
import { toDisplayTitle } from "@/lib/storefront-display";

const ICONS: Record<CategoryIcon, LucideIcon> = {
  lighting: Lightbulb,
  electrical: PlugZap,
  pill: Pill,
  spray: SprayCan,
  jar: FlaskRound,
  droplet: Droplet,
  tools: Wrench,
  basket: ShoppingBasket,
  box: Box,
  perfume: Flower2,
  bath: Bath,
  wipes: Layers,
  hair: Scissors,
  wine: Wine,
  drink: CupSoda,
  sweet: Candy,
  biscuit: Cookie,
  grain: Wheat,
  sauce: CookingPot,
  device: HeartPulse,
  air: AirVent,
  syringe: Syringe,
};

interface CategoryTileProps {
  category?: string | null;
  image?: string | null;
  alt: string;
  productName?: string | null;
}

export function CategoryTile({ category, image, alt, productName }: CategoryTileProps) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static export arbitrary data URI
      <img src={image} alt={alt} className="aspect-[4/3] w-full object-cover" />
    );
  }

  const label = category ? toDisplayTitle(correctCategoryName(category)) : null;
  const Icon = ICONS[categoryIcon(category ?? "", productName)];

  return (
    <div
      aria-hidden="true"
      className="relative flex aspect-[4/3] w-full items-center justify-center text-[color:var(--sf-ink)]"
      style={{ background: categoryTint(category ?? "") }}
    >
      {label && (
        <span className="absolute left-3 top-3 max-w-[85%] truncate text-[10px] font-medium uppercase tracking-wider sm:text-[11px]">
          {label}
        </span>
      )}
      <Icon className="h-10 w-10 sm:h-12 sm:w-12" strokeWidth={1.5} />
    </div>
  );
}
