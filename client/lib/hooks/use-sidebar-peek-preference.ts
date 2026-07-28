import { useEffect, useState } from "react";

const PEEK_KEY = "sidebar_peek_enabled";

/**
 * Whether the collapsed sidebar expands on hover ("peek"), or stays fully
 * collapsed. Independent from the collapsed/expanded state itself — combined,
 * they produce the three states: expanded, collapsed+peek, collapsed+locked.
 * Device-local (localStorage), matching how sidebar_collapsed is stored.
 */
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
