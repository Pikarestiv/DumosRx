"use client";

import { useEffect, useState } from "react";
import { SmartSuppWidget } from "@/components/smartsupp-widget";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

/**
 * Fetches the Smartsupp key from the public system-configs endpoint
 * and renders the widget if a key exists. Silently no-ops on failure.
 */
export function SmartSuppProvider() {
  const [chatKey, setChatKey] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/system-configs/smartsupp_key`)
      .then((res) => res.json())
      .then((data) => {
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
