"use client";

import { useEffect, useState } from "react";
import { SmartSuppWidget } from "@/components/smartsupp-widget";
import { apiClient } from "@/lib/api/base-client";

/**
 * Fetches the Smartsupp key from the public system-configs endpoint
 * and renders the widget if a key exists. Silently no-ops on failure.
 */
export function SmartSuppProvider() {
  const [chatKey, setChatKey] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get("/system-configs/smartsupp_key")
      .then(({ data }) => {
        if (data?.success) {
          const val = typeof data.data === "string" ? data.data : String(data.data ?? "");
          if (val.trim()) setChatKey(val.trim());
        }
      })
      .catch(() => {
        // Silently fail — chat is non-critical
      });
  }, []);

  if (!chatKey) return null;
  return <SmartSuppWidget chatKey={chatKey} />;
}
