import { BaseApiClient } from "./base-client";
import type {
  StorefrontEntitlements,
  StorefrontSettings,
  StorefrontSettingsResponse,
  StorefrontSettingsUpdate,
} from "@/lib/types/storefront-settings";

export class StorefrontApiClient extends BaseApiClient {
  async getStorefrontSettings() {
    return this.request<StorefrontSettingsResponse>("/app/storefront-settings");
  }

  async rebuildStorefront() {
    return this.request<{ message: string }>("/app/storefront/rebuild", { method: "POST" });
  }

  async optInStorefront() {
    return this.request<{ opted_in: true; entitlements: StorefrontEntitlements }>("/app/storefront/opt-in", { method: "POST" });
  }

  async updateStorefrontSettings(payload: StorefrontSettingsUpdate) {
    return this.request<StorefrontSettings>("/app/storefront-settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }
}
