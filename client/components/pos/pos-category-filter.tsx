"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface Props {
  categories: string[];
  value: string;
  onChange: (value: string) => void;
}

export function POSCategoryFilter({ categories, value, onChange }: Props) {
  if (categories.length === 0) return null;

  return (
    <Tabs value={value} onValueChange={onChange} variant="chips">
      <TabsList>
        <TabsTrigger
          value="all"
          className={cn(
            // active
            "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none",
            // inactive
            "data-[state=inactive]:border-border data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground",
            // inactive + hover
            "data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:hover:text-primary",
          )}
        >
          All
        </TabsTrigger>
        {categories.map((category) => (
          <TabsTrigger
            key={category}
            value={category}
            className={cn(
              // active
              "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none",
              // inactive
              "data-[state=inactive]:border-border data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground",
              // inactive + hover
              "data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:hover:text-primary data-[state=inactive]:hover:border-primary/50",
            )}
          >
            {category}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
