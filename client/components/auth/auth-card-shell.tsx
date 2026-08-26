"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface AuthCardShellProps {
  children: ReactNode;
  header?: ReactNode;
  /**
   * "page": /login itself. Mobile gets a separate full-bleed hero logo
   * elsewhere on the page, so the in-card logo only shows on desktop, and
   * the card uses the bottom-sheet radius/shadow that matches the rest of
   * that page's mobile chrome.
   * "overlay": the dashboard's auto-lock overlay. There's no separate hero,
   * so the logo always shows, sized larger to read as the primary heading.
   */
  variant: "page" | "overlay";
  /** Card-level padding override. The onboarding steps (register/cloud/
   * backup) manage their own inner CardHeader/CardContent/CardFooter
   * padding instead, so they pass a tighter value here rather than getting
   * this default doubled up on top of it. Defaults to the login tab's
   * spacing. Ignored for variant="overlay", which always uses the default. */
  padding?: string;
  /**
   * The single desktop-only visual shown above the header (page variant
   * only; overlay always shows its own mobile-only logo regardless of
   * this). Defaults to the DumosRx logo; a step can pass its own icon
   * instead (e.g. a UserPlus/CloudDownload glyph in a tinted box) for
   * visual variety, or pass `null` to show nothing at all. Either way it's
   * hidden below `sm` and, unlike a CSS-only hide, never reserves layout
   * space when hidden, since the wrapper simply isn't rendered.
   */
  icon?: ReactNode | null;
}

const DEFAULT_LOGO = (
  <Image
    src="/logo.png"
    alt="Logo"
    width={150}
    height={58}
    className="object-contain"
    style={{ filter: "var(--logo-filter)", height: "auto" }}
  />
);

// Shared by /login's login/setup tabs and the dashboard's auto-lock overlay.
// Was previously several hand-copied implementations that drifted (the
// overlay never got the max-h/overflow-y-auto short-viewport scroll fix
// applied everywhere else this session, silently reintroducing that
// clipping bug).
export function AuthCardShell({
  children,
  header,
  variant,
  padding = "p-8",
  icon = DEFAULT_LOGO,
}: AuthCardShellProps) {
  const isOverlay = variant === "overlay";
  const showIconBlock = isOverlay || icon !== null;

  return (
    <>
      <Card
        className={cn(
          isOverlay ? "p-4 sm:p-6" : padding,
          "flex-1 sm:flex-initial flex flex-col border-none sm:border-solid sm:border-border max-h-[85dvh] overflow-y-auto relative",
          "sm:rounded-xl sm:shadow-2xl sm:bg-card/60 sm:backdrop-blur-2xl",
          isOverlay
            ? "rounded-none shadow-none bg-transparent"
            : "rounded-t-[2.5rem] shadow-[0_-20px_40px_rgba(0,0,0,0.15)] bg-background",
        )}
      >
        {/* shrink-0 on these two matters: Card is a column flex container
            with overflow-y-auto (not visible), which disables flexbox's
            usual "don't shrink below content size" protection. On a step
            with enough content to exceed max-h-[85dvh] (register, with its
            long form), the flex children get shrunk to fit instead of the
            browser leaving them full-size and scrolling the overflow, and
            since this wrapper also has overflow-hidden, that shrink
            silently clips the icon to invisible rather than scrolling past
            it. shrink-0 forces the header/icon to keep their natural size
            no matter how tall the rest of the content gets, so only the
            step's own scrollable content shrinks/scrolls. */}
        {header && <div className="shrink-0">{header}</div>}

        {showIconBlock && (
          <div
            className={cn(
              "shrink-0 flex flex-col items-center overflow-hidden",
              isOverlay
                ? "text-center p-0 flex sm:hidden"
                : "hidden sm:flex pt-6",
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
              {isOverlay ? (
                <Image
                  src="/logo.png"
                  alt="Logo"
                  width={180}
                  height={70}
                  className="object-contain"
                  style={{ filter: "var(--logo-filter)", height: "auto" }}
                />
              ) : (
                icon
              )}
            </motion.div>
          </div>
        )}

        {children}
      </Card>
    </>
  );
}
