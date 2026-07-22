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
import { Product } from "./types";

interface ProductTableProps {
  filteredProducts: Product[];
  totalCount: number;
  isFuzzyFallback: boolean;
  isStore: boolean;
  formatCurrency: (amount: number) => string;
  getStatusBadge: (status: Product["status"]) => React.ReactNode;
  onViewDetails: (product: Product) => void;
  onEditProduct: (product: Product) => void;
  productLabel: string;
  productsLabel: string;
  stockLabel: string;
  categoryLabel: string;
  regNumLabel: string;
}

export function ProductTable({
  filteredProducts,
  totalCount,
  isFuzzyFallback,
  isStore,
  formatCurrency,
  getStatusBadge,
  onViewDetails,
  onEditProduct,
  productLabel,
  productsLabel,
  stockLabel,
  categoryLabel,
  regNumLabel,
}: ProductTableProps) {
  return (
    <div className="overflow-x-auto">
      {isFuzzyFallback && filteredProducts.length > 0 && (
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
          {filteredProducts.length === 0 && (
            <EmptyProductsRow
              productsLabel={productsLabel}
              productLabel={productLabel}
              totalCount={totalCount}
            />
          )}
          {filteredProducts.length > 0 && filteredProducts.map((product) => (
            <TableRow key={product.id}>
              <TableCell>
                <div>
                  <div className="font-medium">{product.name}</div>
                  {isStore && product.genericName && (
                    <div className="text-sm text-muted-foreground">
                      {product.genericName}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>{product.brand}</TableCell>
              <TableCell>{product.category}</TableCell>
              <TableCell className="font-mono text-sm">
                {product.nafdacNumber}
              </TableCell>
              <TableCell>{product.strength}</TableCell>
              <TableCell>
                <div
                  className={
                    product.stockQuantity <= product.reorderLevel
                      ? "text-destructive font-medium"
                      : ""
                  }
                >
                  {product.stockQuantity} {product.baseUnit}
                </div>
                <div className="text-xs text-muted-foreground">
                  Min: {product.reorderLevel}
                </div>
              </TableCell>
              <TableCell>
                {formatCurrency(product.costPrice)}
              </TableCell>
              <TableCell>
                {formatCurrency(product.sellingPrice)}
              </TableCell>
              <TableCell>{getStatusBadge(product.status)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewDetails(product)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => onEditProduct(product)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyProductsRow({
  productsLabel,
  productLabel,
  totalCount,
}: {
  productsLabel: string;
  productLabel: string;
  totalCount: number;
}) {
  return (
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
  );
}
