import React from "react";
import Image from "next/image";
import { RefreshCw } from "lucide-react";

export function SplashScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background">
      <div className="relative w-24 h-24 sm:w-32 sm:h-32 animate-pulse">
        <img
          src="/logo-icon-blue.png"
          alt="DumosRx Logo"
          className="w-full h-full object-contain"
        />
      </div>
      <div className="mt-8 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium bg-muted/50 px-4 py-2 rounded-full">
          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
          <span>Initializing workspace...</span>
        </div>
      </div>
    </div>
  );
}
