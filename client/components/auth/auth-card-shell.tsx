"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface AuthCardShellProps {
  children: ReactNode;
  header?: ReactNode;
  /**
   * "page" — /login itself: mobile gets a separate full-bleed hero logo
   * elsewhere on the page, so the in-card logo only shows on desktop, and
   * the card uses the bottom-sheet radius/shadow that matches the rest of
   * that page's mobile chrome.
   * "overlay" — the dashboard's auto-lock overlay: there's no separate hero,
   * so the logo always shows, sized larger to read as the primary heading.
   */
  variant: "page" | "overlay";
  /** Overlay always shows it; on the page it's caller-driven (only shown
   * once the traditional login form or account-switch mode is active). */
  showFooter?: boolean;
}

// Shared by /login's login tab and the dashboard's auto-lock overlay — was
// previously two hand-copied implementations that drifted (the overlay
// never got the max-h/overflow-y-auto short-viewport scroll fix applied
// everywhere else this session, silently reintroducing that clipping bug).
export function AuthCardShell({
  children,
  header,
  variant,
}: AuthCardShellProps) {
  const isOverlay = variant === "overlay";

  return (
    <>
      <Card
        className={cn(
          "py-0 flex-1 sm:flex-initial flex flex-col border-none sm:border-solid sm:border-border max-h-[85dvh] overflow-y-auto relative",
          isOverlay
            ? "rounded-none sm:rounded-xl shadow-none sm:shadow-2xl bg-transparent sm:bg-card/60 sm:backdrop-blur-2xl"
            : "rounded-t-[2.5rem] sm:rounded-xl shadow-[0_-20px_40px_rgba(0,0,0,0.15)] sm:shadow-2xl bg-background sm:bg-card/60 sm:backdrop-blur-2xl",
        )}
      >
        {header}

        <div
          className={cn(
            "flex flex-col items-center overflow-hidden",
            isOverlay
              ? "text-center pb-2 p-6 flex sm:hidden"
              : "hidden sm:flex pt-6 pb-2",
          )}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20,
              delay: 0.2,
            }}
            className={cn("overflow-hidden", isOverlay ? "mb-6" : "mb-1")}
          >
            <Image
              src="/logo.png"
              alt="Logo"
              width={isOverlay ? 180 : 150}
              height={isOverlay ? 70 : 58}
              className="object-contain"
              style={{ filter: "var(--logo-filter)", height: "auto" }}
            />
          </motion.div>
        </div>

        {children}
      </Card>
    </>
  );
}
