import { BaseApiClient } from "./base-client";
import type {
  StorefrontSettings,
  StorefrontSettingsUpdate,
} from "@/lib/types/storefront-settings";

export class StorefrontApiClient extends BaseApiClient {
  async getStorefrontSettings() {
    return this.request<StorefrontSettings>("/app/storefront-settings");
  }

  async updateStorefrontSettings(payload: StorefrontSettingsUpdate) {
    return this.request<StorefrontSettings>("/app/storefront-settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }
}
