"use client";

import { useSmartSuggestions } from "@/hooks/use-smart-suggestions";
import { CartItem } from "@/lib/hooks/use-pos-cart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface POSSuggestionsProps {
  cart: CartItem[];
  addToCart: (medicine: any) => void;
  currencyCode?: string;
}

export function POSSuggestions({ cart, addToCart, currencyCode }: POSSuggestionsProps) {
  const { suggestions } = useSmartSuggestions(cart);

  if (suggestions.length === 0) return null;

  return (
    <Card className="border-dashed border-accent/40 bg-accent/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-accent">
          <Sparkles className="h-4 w-4 animate-pulse text-amber-500" />
          Smart Suggestions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-3">
        {suggestions.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-2 bg-background border rounded-md shadow-sm text-xs"
          >
            <div className="flex-1 min-w-0 pr-2">
              <p className="font-medium text-foreground truncate">{item.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {item.generic_name || "Generic"} • {item.brand || "Brand"}
              </p>
              <p className="text-[10px] font-bold text-primary mt-0.5">
                {formatCurrency(item.unit_price, currencyCode)}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-accent border-accent/25 hover:bg-accent/10 flex items-center gap-0.5"
              onClick={() => addToCart(item)}
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
