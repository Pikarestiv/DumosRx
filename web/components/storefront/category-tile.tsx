import {
  Box,
  FlaskRound,
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
};

interface CategoryTileProps {
  category?: string | null;
  image?: string | null;
  alt: string;
}

export function CategoryTile({ category, image, alt }: CategoryTileProps) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static export arbitrary data URI
      <img src={image} alt={alt} className="aspect-[4/3] w-full object-cover" />
    );
  }

  const label = category ? toDisplayTitle(correctCategoryName(category)) : null;
  const Icon = ICONS[categoryIcon(category ?? "")];

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
