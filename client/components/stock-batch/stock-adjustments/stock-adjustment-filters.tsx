import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";

interface StockAdjustmentFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onNewAdjustment: () => void;
}

export function StockAdjustmentFilters({
  searchTerm,
  setSearchTerm,
  onNewAdjustment,
}: StockAdjustmentFiltersProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-serif font-semibold">
              Stock Adjustments
            </CardTitle>
            <CardDescription>
              Track and manage stock batch adjustments
            </CardDescription>
          </div>
          <Button
            onClick={onNewAdjustment}
            className="bg-accent hover:bg-accent/90 cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Adjustment
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search adjustments, products, reasons..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
