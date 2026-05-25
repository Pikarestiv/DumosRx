import React from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, Edit, Package } from "lucide-react";
import { Medicine } from "./types";

interface MedicineTableProps {
  filteredMedicines: Medicine[];
  totalCount: number;
  isFuzzyFallback: boolean;
  isPharmacy: boolean;
  formatCurrency: (amount: number) => string;
  getStatusBadge: (status: Medicine["status"]) => React.ReactNode;
  onViewDetails: (medicine: Medicine) => void;
  onEditMedicine: (medicine: Medicine) => void;
  productLabel: string;
  productsLabel: string;
  stockLabel: string;
  categoryLabel: string;
  regNumLabel: string;
}

export function MedicineTable({
  filteredMedicines,
  totalCount,
  isFuzzyFallback,
  isPharmacy,
  formatCurrency,
  getStatusBadge,
  onViewDetails,
  onEditMedicine,
  productLabel,
  productsLabel,
  stockLabel,
  categoryLabel,
  regNumLabel,
}: MedicineTableProps) {
  return (
    <div className="overflow-x-auto">
      {isFuzzyFallback && filteredMedicines.length > 0 && (
        <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-sm border border-amber-500/20 text-center font-medium rounded-md mb-4">
          Did you mean? (No exact matches found. Showing closest names.)
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{productLabel} Name</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead>{categoryLabel}</TableHead>
            <TableHead>{regNumLabel}</TableHead>
            <TableHead>Size / Strength</TableHead>
            <TableHead>{stockLabel}</TableHead>
            <TableHead>Cost Price</TableHead>
            <TableHead>Selling Price</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredMedicines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="h-32 text-center">
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <Package className="h-8 w-8 mb-2 opacity-50" />
                  <p className="font-medium">No {productsLabel.toLowerCase()} found</p>
                  <p className="text-sm">
                    {totalCount === 0
                      ? `Add your first ${productLabel.toLowerCase()} to get started`
                      : "Try adjusting your search or filters"}
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            filteredMedicines.map((medicine) => (
              <TableRow key={medicine.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{medicine.name}</div>
                    {isPharmacy && medicine.genericName && (
                      <div className="text-sm text-muted-foreground">
                        {medicine.genericName}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>{medicine.brand}</TableCell>
                <TableCell>{medicine.category}</TableCell>
                <TableCell className="font-mono text-sm">
                  {medicine.nafdacNumber}
                </TableCell>
                <TableCell>{medicine.strength}</TableCell>
                <TableCell>
                  <div
                    className={
                      medicine.stockQuantity <= medicine.reorderLevel
                        ? "text-destructive font-medium"
                        : ""
                    }
                  >
                    {medicine.stockQuantity} {medicine.baseUnit}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Min: {medicine.reorderLevel}
                  </div>
                </TableCell>
                <TableCell>
                  {formatCurrency(medicine.costPrice)}
                </TableCell>
                <TableCell>
                  {formatCurrency(medicine.sellingPrice)}
                </TableCell>
                <TableCell>{getStatusBadge(medicine.status)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewDetails(medicine)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => onEditMedicine(medicine)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
