import type { AuditItem } from "./stock-audits";

function NoAuditItemsFound() {
  return (
    <div className="flex flex-col items-center gap-2 text-muted-foreground text-[13px] py-4">
      No items found.
    </div>
  );
}

interface AuditSetupStepProps {
  isLoading: boolean;
  items: AuditItem[];
  categories: { id: string; label: string; count: number }[];
  selectedCategory: string | null;
  setSelectedCategory: (category: string) => void;
}

export function AuditSetupStep({
  isLoading,
  items,
  categories,
  selectedCategory,
  setSelectedCategory,
}: AuditSetupStepProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="text-[17px] font-semibold mb-1.5">
        What are you counting?
      </div>
      <div className="text-[13px] text-muted-foreground mb-5">
        Pick a category, then search and count items in any order.
      </div>
      {!!isLoading && (
        <div className="text-center p-8 text-muted-foreground">
          Loading categories...
        </div>
      )}
      {!isLoading && (
        <div className="flex flex-col gap-2.5 mb-2">
          {categories.length === 0 && <NoAuditItemsFound />}

          {items.length > 0 && (
            <div
              onClick={() => setSelectedCategory("__all__")}
              className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                selectedCategory === "__all__"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:bg-accent/50"
              }`}
            >
              <div className="font-semibold text-[14px] text-foreground">
                All Categories
              </div>
              <div className="text-[13px] text-muted-foreground">
                {items.length} items
              </div>
            </div>
          )}

          {categories.map((cat) => (
            <div
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                selectedCategory === cat.id
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:bg-accent/50"
              }`}
            >
              <div className="font-semibold text-[14px] text-foreground">
                {cat.label}
              </div>
              <div className="text-[13px] text-muted-foreground">
                {cat.count} items
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
