"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const TabsContext = React.createContext<{ variant?: "default" | "chips" }>({
  variant: "default",
});

function Tabs({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & {
  variant?: "default" | "chips";
}) {
  return (
    <TabsContext.Provider value={{ variant }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        className={cn("flex flex-col gap-2", className)}
        {...props}
      />
    </TabsContext.Provider>
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const { variant } = React.useContext(TabsContext);
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "flex overflow-x-auto hide-scrollbar items-center max-w-full",
        variant === "default"
          ? "gap-1.5 bg-card border-0 md:border border-border rounded-[11px] p-1 shadow-none md:shadow-sm"
          : "gap-2 bg-transparent shadow-none p-0",
        className,
      )}
      {...props}
    />
  );
}

const tabsTriggerVariants = cva(
  "cursor-pointer inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 text-[13px] font-semibold",
  {
    variants: {
      variant: {
        default:
          "gap-1.5 rounded-lg border px-4 py-2 bg-card border-border text-muted-foreground hover:text-foreground hover:border-border data-[state=active]:bg-primary data-[state=active]:border-primary data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white data-[state=active]:hover:border-primary",
        chips:
          "gap-1.5 rounded-full border px-3.5 py-1.5 bg-transparent border-transparent text-muted-foreground hover:text-muted hover:bg-accent data-[state=active]:bg-primary data-[state=active]:border-primary data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:hover:text-white data-[state=active]:hover:border-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { variant } = React.useContext(TabsContext);
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
