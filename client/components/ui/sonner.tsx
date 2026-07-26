"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";
import { useMediaQuery } from "@/hooks/use-media-query";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position={isDesktop ? "bottom-right" : "top-center"}
      // Toasts already support swipe-to-dismiss (sonner's built-in pointer
      // gesture), but the default for a centered position is "swipe up"
      // only — allow left/right too since that's the more familiar mobile
      // dismiss gesture.
      swipeDirections={isDesktop ? undefined : ["left", "right", "top"]}
      closeButton={true}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      style={{
        marginBottom: "calc(var(--tauri-bottom, env(safe-area-inset-bottom, 0px)) + 16px)",
        marginTop: "calc(var(--tauri-top, env(safe-area-inset-top, 0px)) + 16px)",
      }}
      {...props}
    />
  );
};

export { Toaster };
