"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface AuthCardShellProps {
  children: ReactNode;
  header?: ReactNode;
  // "page": /login itself.
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-auth-auth-card-shell-tsx-L12
  variant: "page" | "overlay";
  // Card-level padding override.
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-auth-auth-card-shell-tsx-L21
  padding?: string;
  // The single desktop-only visual shown above the header (page variant only; overlay always shows its own mobile-only logo…
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-auth-auth-card-shell-tsx-L27
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
// Rationale: docs/CLIENT_COMMENTS.md#line-components-auth-auth-card-shell-tsx-L50
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
        {/* shrink-0 on these two matters: — docs/CLIENT_COMMENTS.md#block-components-auth-auth-card-shell-tsx-L77 */}
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
