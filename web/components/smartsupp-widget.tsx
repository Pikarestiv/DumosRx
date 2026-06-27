"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/store/use-auth-store";

interface SmartSuppWidgetProps {
  chatKey: string;
}

/**
 * Injects the Smartsupp live chat script and identifies the logged-in user.
 * Rendered only when a non-empty chatKey is provided.
 */
export function SmartSuppWidget({ chatKey }: SmartSuppWidgetProps) {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!chatKey) return;

    const setupVisibility = () => {
      document.body.classList.add("smartsupp-visible");
      return () => {
        document.body.classList.remove("smartsupp-visible");
      };
    };

    // Avoid double-injection
    if (document.getElementById("smartsupp-script")) {
      return setupVisibility();
    }

    // Bootstrap Smartsupp global
    (window as any)._smartsupp = (window as any)._smartsupp || {};
    (window as any)._smartsupp.key = chatKey;
    const o = ((window as any).smartsupp = function (...args: any[]) {
      (o as any)._.push(args);
    });
    (o as any)._ = [];

    const script = document.createElement("script");
    script.id = "smartsupp-script";
    script.type = "text/javascript";
    script.charset = "utf-8";
    script.async = true;
    script.src = "https://www.smartsuppchat.com/loader.js?";
    document.head.appendChild(script);

    return setupVisibility();
  }, [chatKey]);

  // Identify user once logged in (or clear identity on logout)
  useEffect(() => {
    if (!(window as any).smartsupp) return;

    if (user) {
      (window as any).smartsupp("name", `${user.first_name} ${user.last_name}`);
      (window as any).smartsupp("email", user.email);
      (window as any).smartsupp("variables", {
        role: { label: "Role", value: user.role },
        userId: { label: "User ID", value: user.id },
      });
    } else {
      // Guest — reset identity so agents don't see stale data
      try {
        (window as any).smartsupp("name", "");
        (window as any).smartsupp("email", "");
      } catch (_) {}
    }
  }, [user]);

  return null;
}
