"use client";

import Link from "next/link";

import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import type { HomeGridLayout } from "@/lib/storefront-home-grid";
import { CARD_SURFACE, DISPLAY_FONT, FOCUS_RING } from "@/lib/storefront-styles";
import { cn } from "@/lib/utils";

interface HomeGridMoreTileProps {
  tile: NonNullable<HomeGridLayout["moreTile"]>;
  label: string;
  href?: string;
  onClick?: () => void;
}

export function HomeGridMoreTile({ tile, label, href, onClick }: HomeGridMoreTileProps) {
  const { t } = useStorefrontI18n();
  const className = cn("block h-full w-full text-left transition-opacity hover:opacity-80", CARD_SURFACE, FOCUS_RING);
  const body = (
    <span className="flex h-full min-h-40 flex-col items-center justify-center gap-1 p-4 text-center">
      <span className={`${DISPLAY_FONT} text-3xl sm:text-4xl`}>
        {tile.counts.map((count) => (
          <span key={count.value} className={count.className}>
            +{count.value}
          </span>
        ))}
      </span>
      <span className="text-sm opacity-75">{t("grid.more")}</span>
    </span>
  );

  return (
    <div className={cn("h-full", tile.className)}>
      {href ? (
        <Link href={href} aria-label={label} className={className}>
          {body}
        </Link>
      ) : (
        <button type="button" aria-label={label} onClick={onClick} className={className}>
          {body}
        </button>
      )}
    </div>
  );
}
