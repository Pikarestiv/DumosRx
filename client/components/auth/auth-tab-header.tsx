"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface AuthTabHeaderProps {
  active: "login" | "setup";
  showBack: boolean;
  onBack: () => void;
  setupHref: string;
  // "card": header sits as the first child inside a <Card> (matches the
  // login tab and, now, the Cloud/Backup setup steps for visual
  // consistency). "standalone": header floats above a step's own Card —
  // needed for setup steps (welcome, register, select-store, syncing) that
  // each render their own separate Card the header can't be injected into.
  variant: "card" | "standalone";
}

export function AuthTabHeader({
  active,
  showBack,
  onBack,
  setupHref,
  variant,
}: AuthTabHeaderProps) {
  return (
    <div
      className={
        variant === "card"
          ? "relative flex items-center justify-center px-4 pt-6"
          : "relative flex items-center justify-center px-4 sm:px-0 mb-4"
      }
    >
      {showBack && (
        <button
          onClick={onBack}
          className={
            variant === "card"
              ? "absolute left-4 inline-flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer bg-transparent border-0"
              : "absolute left-4 sm:left-0 inline-flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer bg-transparent border-0"
          }
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      )}
      <div className="inline-flex items-center bg-primary/10 rounded-full p-1">
        <Link
          href="/login"
          className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${
            active === "login"
              ? "bg-background shadow-sm text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Login
        </Link>
        <Link
          href={setupHref}
          className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${
            active === "setup"
              ? "bg-background shadow-sm text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Setup
        </Link>
      </div>
    </div>
  );
}
