"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { usePathname } from "next/navigation";
import type { SmartsuppFn } from "@/lib/types/global";

interface SmartSuppWidgetProps {
  chatKey: string;
}

/**
 * Injects the Smartsupp live chat script and identifies the logged-in user.
 * Rendered only when a non-empty chatKey is provided.
 */
export function SmartSuppWidget({ chatKey }: SmartSuppWidgetProps) {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname() || "";

  const isDashboard = pathname.startsWith("/dashboard");
  // The whole /admin tree, login page included: third-party JS running in the
  // same origin as a super_admin session can hook fetch/XHR and read the
  // bearer header off every admin request, so the script must not be loaded
  // there at all. Hiding it with CSS (what this used to do) still ran it.
  const isAdmin = pathname.startsWith("/admin");

  // Visible everywhere except the (now redirect-only) dashboard routes and
  // secure admin pages.
  const isVisible = !(isDashboard || isAdmin);

  useEffect(() => {
    if (!chatKey) return;
    // Guarded here rather than only on the render path: once the loader is in
    // the document it can't be unloaded. A soft navigation from a public page
    // into /admin therefore leaves an already-running widget behind (the CSS
    // block below still hides that), but a direct load of - or a reload on -
    // any admin route never fetches it in the first place.
    if (isAdmin) return;

    // Avoid double-injection
    if (document.getElementById("smartsupp-script")) {
      return;
    }

    // Bootstrap Smartsupp global
    window._smartsupp = window._smartsupp || {};
    window._smartsupp.key = chatKey;
    const o = (window.smartsupp = function (...args: unknown[]) {
      o._.push(args);
    } as SmartsuppFn);
    o._ = [];

    const script = document.createElement("script");
    script.id = "smartsupp-script";
    script.type = "text/javascript";
    script.charset = "utf-8";
    script.async = true;
    script.src = "https://www.smartsuppchat.com/loader.js?";
    document.head.appendChild(script);

  }, [chatKey, isAdmin]);

  // Identify user once logged in (or clear identity on logout)
  useEffect(() => {
    if (!window.smartsupp) return;

    if (user) {
      window.smartsupp("name", `${user.first_name} ${user.last_name}`);
      window.smartsupp("email", user.email);
      window.smartsupp("variables", {
        role: { label: "Role", value: user.role },
        userId: { label: "User ID", value: user.id },
      });
    } else {
      // Guest: reset identity so agents don't see stale data
      try {
        window.smartsupp("name", "");
        window.smartsupp("email", "");
      } catch (_) {}
    }
  }, [user]);

  if (!isVisible) {
    return (
      <style dangerouslySetInnerHTML={{ __html: `
        #smartsupp-widget-container, div[id^="smartsupp"], iframe[name^="smartsupp"] {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `}} />
    );
  }

  return null;
}
