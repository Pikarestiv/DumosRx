import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pill } from "lucide-react";
import { Prescription } from "@/lib/hooks/use-prescription-queue";
import { formatCurrency } from "@/lib/utils";
import { ProductName } from "@/components/ui/product-name";

interface PrescriptionMedicationsCardProps {
  medications: Prescription["medications"];
  totalCost: Prescription["totalCost"];
}

export function PrescriptionMedicationsCard({
  medications,
  totalCost,
}: PrescriptionMedicationsCardProps) {
  return (
    <Card className="shadow-none border-border py-0 gap-0">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Pill className="h-4 w-4" />
          Prescribed Medications
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {medications.length === 0 && (
          <p className="text-muted-foreground text-center py-4 text-sm">
            No medications listed
          </p>
        )}
        {!(medications.length === 0) && (
          <div className="space-y-3">
            {medications.map((medication) => (
              <div
                key={medication.id}
                className="p-3 bg-muted/30 rounded-lg border border-border"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 pr-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-sm text-foreground">
                        <ProductName name={medication.productName} />
                      </h4>
                      <Badge
                        variant={
                          medication.available ? "default" : "destructive"
                        }
                        className="text-[10px] px-1.5 py-0"
                      >
                        {!!medication.available && "Available"}
                        {!medication.available && "Out of Stock"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Strength: {medication.strength || "-"} • Qty:{" "}
                      {medication.quantity}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Dosage: {medication.dosage || "-"}
                    </p>
                    {medication.instructions && (
                      <p className="text-xs mt-2 p-1.5 bg-background rounded text-muted-foreground border border-border/50">
                        {medication.instructions}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">
                      {formatCurrency(medication.cost)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex justify-between items-center">
            <span className="font-medium text-sm">Total Cost:</span>
            <span className="font-bold text-base text-primary">
              {formatCurrency(totalCost)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
