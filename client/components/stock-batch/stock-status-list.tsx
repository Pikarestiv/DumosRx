"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PackageX, Barcode as BarcodeIcon, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStore } from "@/lib/context/store-context";

interface StockItem {
  id: string;
  product_name: string;
  quantity: number;
  reorder_level: number;
  unit_price: number;
  batch_number: string;
  status: "healthy" | "low" | "critical" | "overstock";
  barcode?: string;
}

interface StockStatusListProps {
  stockData: StockItem[];
  formatCurrency: (amount: number) => string;
  getStatusBadge: (status: StockItem["status"]) => React.ReactNode;
  onPrintBarcode?: (item: StockItem) => void;
}

const StockStatusEmptyState = () => {
  const { t } = useStore();
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <PackageX className="h-12 w-12 mb-4" />
      <p className="font-medium">No stock items</p>
      <p className="text-sm">
        Add {t("product").toLowerCase()}s to track stock levels.
      </p>
    </div>
  );
};

export function StockStatusList({
  stockData,
  formatCurrency,
  getStatusBadge,
  onPrintBarcode,
}: StockStatusListProps) {
  const { canUseBarcodeGeneration, withRestriction, getUpgradeMessage } =
    useFeatureGate();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold">
          Stock Status Overview
        </CardTitle>
        <CardDescription>Current stock batch levels and alerts</CardDescription>
      </CardHeader>
      <CardContent>
        {stockData.length === 0 && (
                        <StockStatusEmptyState />
                      )}
              {!(stockData.length === 0) && (
                        <div className="space-y-4">
                          {stockData.slice(0, 5).map((item) => (
                            <div key={item.id} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-sm">
                                      {item.product_name}
                                    </h4>
                                    {getStatusBadge(item.status)}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {item.quantity} units •{" "}
                                    {formatCurrency(item.quantity * item.unit_price)}
                                  </p>
                                </div>
                                <TooltipProvider delayDuration={0}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className={`h-8 w-8 text-muted-foreground hover:text-white`}
                                          onClick={withRestriction(
                                            () => onPrintBarcode?.(item),
                                            {
                                              featureAllowed: canUseBarcodeGeneration,
                                              featureKey: "barcode_generation",
                                            },
                                          )}
                                        >
                                          {!!(!canUseBarcodeGeneration) && (
                                                                                                      <Lock className="h-4 w-4" />
                                                                                                    )}
                                                          {!(!canUseBarcodeGeneration) && (
                                                                                                      <BarcodeIcon className="h-4 w-4" />
                                                                                                    )}
                                        </Button>
                                      </div>
                                    </TooltipTrigger>
                                    {!canUseBarcodeGeneration && (
                                      <TooltipContent>
                                        <p>{getUpgradeMessage("barcode_generation")}</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                              <div className="space-y-1">
                                <Progress
                                  value={Math.min(
                                    (item.quantity / (item.reorder_level * 3)) * 100,
                                    100,
                                  )}
                                  className="h-2"
                                />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Reorder: {item.reorder_level}</span>
                                  <span>Batch: {item.batch_number}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
      </CardContent>
    </Card>
  );
}
