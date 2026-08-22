"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import { SmartSuppProvider } from "@/components/smartsupp-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/query-client";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        <TooltipProvider delayDuration={1000}>
          {children}
        </TooltipProvider>
        <Toaster position="top-right" richColors />
        <SmartSuppProvider />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
