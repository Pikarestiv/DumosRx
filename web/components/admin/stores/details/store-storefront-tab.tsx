"use client";

import { useState } from "react";
import { ExternalLink, Palette } from "lucide-react";

import { DetailCard } from "./store-detail-primitives";
import { StoreStorefrontCard } from "./store-storefront-card";
import { StorefrontPresetPicker } from "./storefront-preset-picker";
import { StorefrontRebuildButton } from "./storefront-rebuild-button";
import { StorefrontSettingsForm } from "./storefront-settings-form";
import { StorefrontThemePicker } from "./storefront-theme-picker";
import { buttonVariants } from "@/components/ui/button";
import { storefrontFontFaceCss } from "@/lib/storefront-fonts";
import { STOREFRONT_PRESETS } from "@/lib/storefront-presets";
import { WEB_APP_URL } from "@/lib/constants";
import { checkIsSuperAdmin, useAdminAuthStore } from "@/lib/store/use-admin-auth-store";
import type { AdminStoreDetail } from "@/lib/types/admin-store-detail";
import { cn } from "@/lib/utils";

export function StoreStorefrontTab({ store }: { store: AdminStoreDetail }) {
  const { user } = useAdminAuthStore();
  const isSuperAdmin = checkIsSuperAdmin(user?.role);
  const [accent, setAccent] = useState(store.storefront.accent ?? "");
  const { store_slug: slug, online_store_enabled: published, pending_rebuild: pending } = store.storefront;

  return (
    <div className="space-y-6">
      <style>{storefrontFontFaceCss(STOREFRONT_PRESETS.map((preset) => preset.id))}</style>
      <StoreStorefrontCard store={store} />

      <DetailCard title="Look and details" icon={<Palette className="h-4 w-4" />}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {pending
              ? "Changes are saved but not live: the public page updates on the next rebuild."
              : "The public page is up to date."}
          </p>
          <div className="flex flex-wrap gap-2">
            {slug && published ? (
              <a
                href={`${WEB_APP_URL}/store/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Preview storefront
              </a>
            ) : null}
            {isSuperAdmin ? <StorefrontRebuildButton /> : null}
          </div>
        </div>

        <StorefrontPresetPicker store={store} accent={accent || null} editable={isSuperAdmin} />
        <StorefrontThemePicker store={store} />
        <StorefrontSettingsForm
          key={`${store.id}-${store.storefront.accent ?? ""}`}
          store={store}
          accent={accent}
          onAccentChange={setAccent}
          editable={isSuperAdmin}
        />
      </DetailCard>
    </div>
  );
}
