"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
        <TabsTrigger value="all">All</TabsTrigger>
        {categories.map((category) => (
          <TabsTrigger key={category} value={category}>
            {category}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
