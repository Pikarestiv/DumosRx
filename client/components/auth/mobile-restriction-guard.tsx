"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/context/auth-context";
import { useAutoLockStore } from "@/lib/hooks/use-auto-lock";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { isNativeMobileApp } from "@/lib/utils";

/**
 * Read-only enforcement for the native mobile build, extracted from
 * license-guard.tsx to keep that file under the 350-line limit in root
 * AGENTS.md §4. Unrelated to licence state — it only happens to have been
 * mounted alongside it.
 */
const MUTATING_KEYWORDS = [
  "save",
  "create",
  "add",
  "delete",
  "remove",
  "update",
  "checkout",
  "check out",
  "pay",
  "confirm",
  "submit",
  "register",
  "restore",
  "void",
  "refund",
  "redeem",
  "apply",
  "post",
  "publish",
  "upload",
  "import",
  "adjust",
  "transfer",
  "receive",
  "return",
  "clock in",
  "clock out",
];
const MUTATING_KEYWORDS_RE = new RegExp(
  `\\b(${MUTATING_KEYWORDS.join("|")})\\b`,
  "i",
);

function getAccessibleName(el: Element): string {
  const aria = el.getAttribute("aria-label");
  const title = el.getAttribute("title");
  const value = el instanceof HTMLInputElement ? el.value : "";
  return `${el.textContent || ""} ${aria || ""} ${title || ""} ${value}`;
}

function isMutatingElement(el: Element | null): boolean {
  if (!el) return false;
  return MUTATING_KEYWORDS_RE.test(getAccessibleName(el));
}

export function MobileRestrictionGuard() {
  const { canUseMobileApp } = useFeatureGate();
  const { isAuthenticated } = useAuth();
  const isLocked = useAutoLockStore((state) => state.isLocked);
  const pathname = usePathname();
  const [isNativeMobile, setIsNativeMobile] = useState(false);

  // Detects whether this is a genuine Tauri mobile build (Android/iOS),
  // not a phone browser tab or installed PWA — both of which must stay
  // fully functional regardless of plan. window.__TAURI_INTERNALS__'s
  // presence is the same synchronous check core.ts's isTauri() and
  // use-tauri-window.ts use; the OS type itself needs the async
  // @tauri-apps/plugin-os import, same as use-tauri-window.ts.
  useEffect(() => {
    let cancelled = false;
    const detectPlatform = async () => {
      const isTauriEnv =
        typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
      if (!isTauriEnv) {
        if (!cancelled) setIsNativeMobile(false);
        return;
      }
      try {
        const { type } = await import("@tauri-apps/plugin-os");
        if (!cancelled) setIsNativeMobile(isNativeMobileApp(isTauriEnv, type()));
      } catch {
        if (!cancelled) setIsNativeMobile(false);
      }
    };
    void detectPlatform();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const isRestricted = () =>
      isNativeMobile &&
      !canUseMobileApp &&
      isAuthenticated &&
      !isLocked &&
      pathname !== "/login";

    const block = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      toast.error("Mobile Access Locked", {
        description:
          "Please upgrade your plan to create, edit, or delete data on the mobile app.",
      });
    };

    // Feature usage interceptor: only mutating actions, never plain
    // navigation/viewing.
    const handleGlobalClick = (e: MouseEvent) => {
      if (!isRestricted()) return;

      const target = e.target as HTMLElement;

      // Allow our own banner to be clicked
      if (target.closest("#mobile-restriction-banner")) return;

      // Allow navigation and tabs
      if (target.closest('nav, aside, header, .sidebar, [role="tab"], a'))
        return;

      // Switches/checkboxes always commit a change on click (there's no
      // read-only use for one), unlike buttons/inputs which are often just
      // navigation or filtering, so these are blocked unconditionally
      // rather than relying on their label containing a mutating keyword.
      const toggleEl = target.closest(
        '[role="switch"], [role="checkbox"], input[type="checkbox"], input[type="radio"]',
      );
      if (toggleEl) {
        block(e);
        return;
      }

      const actionEl = target.closest(
        'button, [role="button"], input[type="submit"], input[type="button"]',
      );
      if (actionEl && isMutatingElement(actionEl)) {
        block(e);
      }
    };

    // Safety net for forms submitted via Enter key (no button click to
    // intercept): only blocks if the submitter itself reads as mutating, so
    // read-only forms (e.g. a search box wrapped in <form onSubmit>) still
    // work.
    const handleGlobalSubmit = (e: SubmitEvent) => {
      if (!isRestricted()) return;
      if ((e.target as HTMLElement)?.closest("#mobile-restriction-banner"))
        return;
      if (isMutatingElement(e.submitter)) {
        block(e);
      }
    };

    document.addEventListener("click", handleGlobalClick, { capture: true });
    document.addEventListener("submit", handleGlobalSubmit, {
      capture: true,
    });

    return () => {
      document.removeEventListener("click", handleGlobalClick, {
        capture: true,
      });
      document.removeEventListener("submit", handleGlobalSubmit, {
        capture: true,
      });
    };
  }, [isNativeMobile, canUseMobileApp, isAuthenticated, isLocked, pathname]);

  return null;
}
