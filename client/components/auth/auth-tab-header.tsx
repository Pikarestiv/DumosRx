"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface AuthTabHeaderProps {
  active: "login" | "setup";
  showBack: boolean;
  onBack: () => void;
  setupHref: string;
}

// Always rendered as the first child inside a step's AuthCardShell — every
// login/setup step goes through that shell now, so there's no longer a
// "floats above a bare Card" case to style differently.
export function AuthTabHeader({
  active,
  showBack,
  onBack,
  setupHref,
}: AuthTabHeaderProps) {
  return (
    <div className="relative flex items-center justify-center">
      {showBack && (
        <button
          onClick={onBack}
          className="absolute left-0 inline-flex items-center justify-center h-10 w-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer bg-transparent border-0"
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
