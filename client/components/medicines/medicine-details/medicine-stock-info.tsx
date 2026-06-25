import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Calendar } from "lucide-react";
import type { Medicine } from "./use-medicine-details";

interface MedicineStockInfoProps {
  medicine: Medicine;
  formatDate: (dateString: string) => string;
  daysToExpiry: number;
  expiryWarningDays: number;
}

export function MedicineStockInfo({
  medicine,
  formatDate,
  daysToExpiry,
  expiryWarningDays,
}: MedicineStockInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Stock & Expiry
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Current Stock</p>
            <p
              className={`font-bold text-lg ${medicine.stockQuantity <= medicine.reorderLevel ? "text-destructive" : "text-primary"}`}
            >
              {medicine.stockQuantity} {medicine.baseUnit}(s)
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Reorder Level</p>
            <p className="font-medium">
              {medicine.reorderLevel} {medicine.baseUnit}(s)
            </p>
          </div>
        </div>
        {medicine.bulkUnit && (
          <>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground">Unit Conversion</p>
              <p className="font-medium">
                1 {medicine.bulkUnit} = {medicine.unitsPerBulk}{" "}
                {medicine.baseUnit}(s)
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Total Stock in {medicine.bulkUnit}:{" "}
                {(medicine.stockQuantity / medicine.unitsPerBulk).toFixed(2)}
              </p>
            </div>
          </>
        )}
        <Separator />
        <div>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Expiry Date
          </p>
          <p
            className={`font-medium ${daysToExpiry < 30 ? "text-destructive" : daysToExpiry < expiryWarningDays ? "text-orange-600" : "text-primary"}`}
          >
            {formatDate(medicine.expiryDate)}
          </p>
          <p className="text-xs text-muted-foreground">
            {daysToExpiry > 0
              ? `${daysToExpiry} days remaining`
              : `Expired ${Math.abs(daysToExpiry)} days ago`}
          </p>
        </div>

        {medicine.stockQuantity <= medicine.reorderLevel && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm font-medium text-destructive">
              Low Stock Alert
            </p>
            <p className="text-xs text-destructive/80">
              Stock level is below reorder threshold
            </p>
          </div>
        )}

        {daysToExpiry < expiryWarningDays && daysToExpiry > 0 && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <p className="text-sm font-medium text-orange-800">
              Expiry Warning
            </p>
            <p className="text-xs text-orange-600">
              Medicine expires in less than {expiryWarningDays} days
            </p>
          </div>
        )}

        {daysToExpiry <= 0 && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm font-medium text-destructive">
              Expired Medicine
            </p>
            <p className="text-xs text-destructive/80">
              This medicine has expired and should not be sold
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
