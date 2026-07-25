import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProductCategoryChipsProps {
  categoryFilter: string;
  setCategoryFilter: (val: string) => void;
  categories: string[];
  triggerClassName?: string;
}

/** Category filter pills, shared between the desktop in-card filters bar and the standalone mobile row. */
export function ProductCategoryChips({
  categoryFilter,
  setCategoryFilter,
  categories,
  triggerClassName = "",
}: ProductCategoryChipsProps) {
  return (
    <Tabs value={categoryFilter} onValueChange={setCategoryFilter} variant="chips">
      <TabsList>
        <TabsTrigger value="all" className={triggerClassName}>
          All
        </TabsTrigger>
        {categories
          .filter((c) => c !== "all")
          .map((c) => (
            <TabsTrigger key={c} value={c} className={triggerClassName}>
              {c}
            </TabsTrigger>
          ))}
      </TabsList>
    </Tabs>
  );
}
