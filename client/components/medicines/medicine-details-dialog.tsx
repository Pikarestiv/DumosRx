/* eslint-disable max-lines */
"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  Package,
  DollarSign,
  AlertTriangle,
  Building,
  Truck,
  Clock,
} from "lucide-react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { useStore } from "@/lib/context/store-context";
import { formatCurrency } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Medicine {
  id: string;
  name: string;
  genericName: string;
  brand: string;
  category: string;
  nafdacNumber: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  supplier: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  expiryDate: string;
  batchNumber: string;
  baseUnit: string;
  bulkUnit: string;
  unitsPerBulk: number;
  status: "active" | "inactive" | "expired" | "low_stock";
}

interface MedicineDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medicine: Medicine | null;
}

export function MedicineDetailsDialog({
  open,
  onOpenChange,
  medicine,
}: MedicineDetailsDialogProps) {
  const { storeProfile } = useStore();
  const { data: batches, loading: loadingBatches } = useLocalData<any>(
    medicine
      ? `SELECT * FROM inventory WHERE medicine_id = "${medicine.id}" AND _deleted = 0 ORDER BY expiry_date ASC`
      : "",
  );

  if (!medicine) return null;

  const formatPrice = (amount: number) => {
    return formatCurrency(amount, storeProfile?.currency);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-NG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: Medicine["status"]) => {
    const variants = {
      active: "default",
      inactive: "secondary",
      expired: "destructive",
      low_stock: "outline",
    } as const;

    const labels = {
      active: "Active",
      inactive: "Inactive",
      expired: "Expired",
      low_stock: "Low Stock",
    };

    return (
      <Badge variant={variants[status]} className="text-xs">
        {labels[status]}
      </Badge>
    );
  };

  const expiryWarningDays = storeProfile?.expiry_warning_days || 90;
  const profitMargin = (
    ((medicine.sellingPrice - medicine.costPrice) / medicine.costPrice) *
    100
  ).toFixed(1);
  const daysToExpiry = Math.ceil(
    (new Date(medicine.expiryDate).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="font-serif font-bold text-2xl">
                {medicine.name}
              </DialogTitle>
              <DialogDescription className="text-lg">
                {medicine.genericName}
              </DialogDescription>
            </div>
            {getStatusBadge(medicine.status)}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="font-serif font-semibold flex items-center gap-2">
                <Package className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Brand Name</p>
                  <p className="font-medium">{medicine.brand || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-medium">{medicine.category}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Strength</p>
                  <p className="font-medium">{medicine.strength}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Dosage Form</p>
                  <p className="font-medium">{medicine.dosageForm}</p>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">
                  NAFDAC Registration Number
                </p>
                <p className="font-mono font-medium text-accent">
                  {medicine.nafdacNumber}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Batch Number</p>
                <p className="font-mono font-medium">{medicine.batchNumber}</p>
              </div>
            </CardContent>
          </Card>

          {/* Supplier & Manufacturer */}
          <Card>
            <CardHeader>
              <CardTitle className="font-serif font-semibold flex items-center gap-2">
                <Building className="h-5 w-5" />
                Supplier & Manufacturer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  Manufacturer
                </p>
                <p className="font-medium">{medicine.manufacturer}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Supplier
                </p>
                <p className="font-medium">{medicine.supplier}</p>
              </div>
            </CardContent>
          </Card>

          {/* Pricing Information */}
          <Card>
            <CardHeader>
              <CardTitle className="font-serif font-semibold flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Pricing Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Cost Price</p>
                  <p className="font-bold text-lg">
                    {formatPrice(medicine.costPrice)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Selling Price</p>
                  <p className="font-bold text-lg text-accent">
                    {formatPrice(medicine.sellingPrice)}
                  </p>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">Profit Margin</p>
                <p className="font-bold text-lg text-primary">
                  {profitMargin}%
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Profit per Unit</p>
                <p className="font-bold text-lg text-primary">
                  {formatPrice(medicine.sellingPrice - medicine.costPrice)}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Stock & Expiry */}
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
                    <p className="text-sm text-muted-foreground">
                      Unit Conversion
                    </p>
                    <p className="font-medium">
                      1 {medicine.bulkUnit} = {medicine.unitsPerBulk}{" "}
                      {medicine.baseUnit}(s)
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Total Stock in {medicine.bulkUnit}:{" "}
                      {(medicine.stockQuantity / medicine.unitsPerBulk).toFixed(
                        2,
                      )}
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
        </div>

        {/* Batch Information Section */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="font-serif font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Batch History & Tracking
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingBatches ? (
              <p className="text-center py-4">Loading batches...</p>
            ) : batches.length === 0 ? (
              <p className="text-center py-4 text-muted-foreground italic">
                No batch records found for this{" "}
                {storeProfile?.store_type === "pharmacy"
                  ? "medicine"
                  : "product"}
                .
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch Number</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch: any) => {
                    const days = Math.ceil(
                      (new Date(batch.expiry_date).getTime() -
                        new Date().getTime()) /
                        (1000 * 60 * 60 * 24),
                    );
                    return (
                      <TableRow key={batch.id}>
                        <TableCell className="font-mono">
                          {batch.batch_number}
                        </TableCell>
                        <TableCell>{batch.quantity} units</TableCell>
                        <TableCell>
                          {new Date(batch.expiry_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {days <= 0 ? (
                            <Badge variant="destructive">Expired</Badge>
                          ) : days <= 90 ? (
                            <Badge
                              variant="outline"
                              className="border-orange-500 text-orange-600"
                            >
                              Near Expiry
                            </Badge>
                          ) : (
                            <Badge variant="default">Healthy</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
