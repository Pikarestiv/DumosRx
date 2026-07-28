"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ExpenseCategoryFilterProps {
  categories: string[];
  value: string;
  onChange: (value: string) => void;
}

/** CATEGORIES — mobile: chips variant with bg-card/border-border inactive state; desktop: unchanged default Tabs */
export function ExpenseCategoryFilter({
  categories,
  value,
  onChange,
}: ExpenseCategoryFilterProps) {
  return (
    <div className="mb-4">
      <div className="md:hidden">
        <Tabs value={value} onValueChange={onChange} variant="chips">
          <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden hide-scrollbar">
            {categories.map((cat) => (
              <TabsTrigger
                key={cat}
                value={cat}
                className="data-[state=inactive]:bg-card data-[state=inactive]:border-border"
              >
                {cat}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="hidden md:block">
        <Tabs value={value} onValueChange={onChange}>
          <TabsList className="w-max justify-start overflow-x-auto overflow-y-hidden hide-scrollbar">
            {categories.map((cat) => (
              <TabsTrigger key={cat} value={cat}>
                {cat}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
