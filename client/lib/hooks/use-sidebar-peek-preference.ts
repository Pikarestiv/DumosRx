import { useState } from "react";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { useHydrated } from "@/lib/hooks/use-hydrated";

const PEEK_KEY = STORAGE_KEYS.sidebarPeekEnabled;

function readStoredPeekEnabled(): boolean {
  try {
    return localStorage.getItem(PEEK_KEY) !== "false";
  } catch {
    return true;
  }
}

// Whether the collapsed sidebar expands on hover ("peek"), or stays fully collapsed.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-sidebar-peek-preference-ts-L6
export function useSidebarPeekPreference() {
  const hydrated = useHydrated();
  const [chosen, setChosen] = useState<boolean | null>(null);
  const peekEnabled = chosen ?? (hydrated ? readStoredPeekEnabled() : true);

  const setPeekEnabled = (value: boolean) => {
    setChosen(value);
    try {
      localStorage.setItem(PEEK_KEY, String(value));
    } catch {}
  };

  return { peekEnabled, setPeekEnabled };
}
