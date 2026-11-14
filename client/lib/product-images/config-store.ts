import { useEffect } from "react";
import { create } from "zustand";
import { apiClient } from "@/lib/api/client";
import { getToken } from "@/lib/api/token-manager";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { DEFAULT_HARD_CAP_BYTES } from "./compress";
import type { ProductImageServerConfig } from "./types";

export const PRODUCT_IMAGES_DISABLED: ProductImageServerConfig = {
  enabled: false,
  public_base_url: null,
  max_bytes: DEFAULT_HARD_CAP_BYTES,
  allowed_types: [],
};

function readCachedConfig(): ProductImageServerConfig {
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEYS.productImageConfig) ?? "null");
    if (cached?.apiBase === apiClient.getBaseURL() && cached.config?.enabled) return cached.config;
  } catch {
    // Unreadable or blocked storage: images stay hidden until the next fetch.
  }
  return PRODUCT_IMAGES_DISABLED;
}

function writeCachedConfig(config: ProductImageServerConfig): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.productImageConfig,
      JSON.stringify({ apiBase: apiClient.getBaseURL(), config }),
    );
  } catch {
    // Best effort; the in-memory copy still applies for this session.
  }
}

interface ProductImageConfigState {
  config: ProductImageServerConfig;
  setConfig: (config: ProductImageServerConfig) => void;
}

export const useProductImageConfigStore = create<ProductImageConfigState>((set) => ({
  config: typeof window === "undefined" ? PRODUCT_IMAGES_DISABLED : readCachedConfig(),
  setConfig: (config) => {
    writeCachedConfig(config);
    set({ config });
  },
}));

let refreshAttempted = false;

export async function refreshProductImageConfig(): Promise<void> {
  refreshAttempted = true;
  const config = await apiClient.getProductImageConfig();
  useProductImageConfigStore.getState().setConfig(config.enabled ? config : PRODUCT_IMAGES_DISABLED);
}

export function useProductImageConfig(): ProductImageServerConfig {
  const config = useProductImageConfigStore((s) => s.config);

  useEffect(() => {
    if (refreshAttempted || !navigator.onLine || !getToken()) return;
    void refreshProductImageConfig().catch(() => undefined);
  }, []);

  return config;
}

export function productImageUrl(config: ProductImageServerConfig, imageKey?: string | null): string | null {
  if (!config.enabled || !config.public_base_url || !imageKey) return null;
  return `${config.public_base_url.replace(/\/+$/, "")}/${imageKey}`;
}
