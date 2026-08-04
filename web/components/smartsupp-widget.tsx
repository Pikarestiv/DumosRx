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
  const isAdmin = pathname.startsWith("/admin") && pathname !== "/admin/login";

  // Visible everywhere EXCEPT dashboard and secure admin pages
  // But explicitly allow it on /dashboard/support
  let isVisible = !(isDashboard || isAdmin);
  
  if (pathname.includes("/dashboard/support")) {
    isVisible = true;
  }

  useEffect(() => {
    if (!chatKey) return;

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

  }, [chatKey]);

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
      // Guest — reset identity so agents don't see stale data
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
