import { useEffect, useState } from "react";
import { STORAGE_KEYS } from "@/lib/storage-keys";

const PEEK_KEY = STORAGE_KEYS.sidebarPeekEnabled;

// Whether the collapsed sidebar expands on hover ("peek"), or stays fully collapsed.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-sidebar-peek-preference-ts-L6
export function useSidebarPeekPreference() {
  const [peekEnabled, setPeekEnabledState] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PEEK_KEY);
      if (stored === "false") setPeekEnabledState(false);
    } catch {
      // localStorage unavailable (e.g. SSR or private mode)
    }
  }, []);

  const setPeekEnabled = (value: boolean) => {
    setPeekEnabledState(value);
    try {
      localStorage.setItem(PEEK_KEY, String(value));
    } catch {}
  };

  return { peekEnabled, setPeekEnabled };
}
