"use client";

import { Plus } from "lucide-react";
import { toast } from "sonner";

import { CategoryTile } from "@/components/storefront/category-tile";
import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import type { StorefrontService } from "@/lib/api/storefront-services";
import { useCart } from "@/lib/store/use-cart-store";
import { toDisplayTitle } from "@/lib/storefront-display";
import { isPriceOnRequest, whatsappLink } from "@/lib/storefront-product";
import { ADD_BUTTON, CARD_SURFACE, PRICE_FONT, SECONDARY_BUTTON } from "@/lib/storefront-styles";

interface StorefrontServiceCardProps {
  service: StorefrontService;
  storeSlug: string;
  currency?: string | null;
  whatsapp?: string | null;
}

export function StorefrontServiceCard({ service, storeSlug, currency, whatsapp }: StorefrontServiceCardProps) {
  const { t, money } = useStorefrontI18n();
  const cart = useCart(storeSlug);
  const displayName = toDisplayTitle(service.name);
  const onRequest = isPriceOnRequest(service.price);
  const enquire = onRequest ? whatsappLink(whatsapp, t("services.enquireMessage", { name: service.name })) : null;

  const book = () => {
    cart.addItem({ id: service.id, name: service.name, price: Number(service.price), quantity: 1, kind: "service" });
    toast.success(t("card.added", { name: displayName }));
  };

  return (
    <article className={`flex h-full flex-col ${CARD_SURFACE}`}>
      <CategoryTile category={service.category} alt={displayName} productName={service.name} />
      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug sm:text-base">{displayName}</h3>
        {service.description ? <p className="line-clamp-2 text-xs opacity-75 sm:text-sm">{service.description}</p> : null}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <p className={onRequest ? "text-sm" : `text-base sm:text-lg ${PRICE_FONT}`}>
            {onRequest ? t("card.priceOnRequest") : money(Number(service.price), currency)}
          </p>
          {onRequest ? (
            enquire && (
              <a href={enquire} target="_blank" rel="noopener noreferrer" className={SECONDARY_BUTTON}>
                {t("services.enquire")}
              </a>
            )
          ) : (
            <button type="button" aria-label={t("services.book.aria", { name: displayName })} onClick={book} className={ADD_BUTTON}>
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
