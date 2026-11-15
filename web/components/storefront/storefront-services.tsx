"use client";

import { useEffect, useState } from "react";

import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";
import { getStorefrontServices, type StorefrontService } from "@/lib/api/storefront-services";
import { isPriceOnRequest, whatsappLink } from "@/lib/storefront-product";
import { DISPLAY_FONT, PRICE_FONT, SECONDARY_BUTTON, CARD_SURFACE } from "@/lib/storefront-styles";

interface StorefrontServicesProps {
  storeSlug: string;
  currency?: string | null;
  whatsapp?: string | null;
}

export function StorefrontServices({ storeSlug, currency, whatsapp }: StorefrontServicesProps) {
  const { t, money } = useStorefrontI18n();
  const [services, setServices] = useState<StorefrontService[]>([]);

  useEffect(() => {
    let cancelled = false;
    getStorefrontServices(storeSlug)
      .then((list) => !cancelled && setServices(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  if (services.length === 0) return null;

  return (
    <section aria-labelledby="services-heading" className="space-y-6">
      <div className="space-y-1">
        <h2 id="services-heading" className={`text-2xl sm:text-3xl ${DISPLAY_FONT}`}>{t("services.heading")}</h2>
        <p className="text-sm opacity-75">{t("services.subtitle")}</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => {
          const enquire = whatsappLink(whatsapp, t("services.enquireMessage", { name: service.name }));
          return (
            <li key={service.id} className={`flex flex-col gap-3 p-4 ${CARD_SURFACE}`}>
              {service.category ? <span className="text-xs font-medium uppercase tracking-wide opacity-60">{service.category}</span> : null}
              <h3 className="text-base font-semibold leading-snug">{service.name}</h3>
              {service.description ? <p className="line-clamp-3 text-sm opacity-75">{service.description}</p> : null}
              <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                <span className={PRICE_FONT}>{isPriceOnRequest(service.price) ? t("card.priceOnRequest") : money(service.price, currency)}</span>
                {enquire ? (
                  <a href={enquire} target="_blank" rel="noopener noreferrer" className={SECONDARY_BUTTON}>
                    {t("services.enquire")}
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
