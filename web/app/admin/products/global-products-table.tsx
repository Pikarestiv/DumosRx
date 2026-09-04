import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Box,
  FileCheck,
  MoreVertical,
  Eye,
  Plus,
  ShieldAlert,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import type { GlobalProductSummary } from "@/lib/types/admin";

interface GlobalProductsTableProps {
  productList: GlobalProductSummary[];
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

export function GlobalProductsTable({
  productList,
  isLoading,
  error,
  refetch,
}: GlobalProductsTableProps) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <ShieldAlert className="h-10 w-10 text-rose-500" />
        <p className="text-rose-500 font-bold">
          {error instanceof Error ? error.message : "Sync error"}
        </p>
        <Button onClick={() => refetch()} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 pl-6 h-12">
            Product Details
          </TableHead>
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">
            Global Category
          </TableHead>
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">
            Store Instances
          </TableHead>
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">
            Avg. Cloud Price
          </TableHead>
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">
            Stock Health
          </TableHead>
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">
            Verification
          </TableHead>
          <TableHead className="w-[80px] h-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {productList.map((product) => (
          <TableRow
            key={product.id}
            className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-colors"
          >
            <TableCell className="pl-6 py-5">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center font-black text-amber-500 border border-amber-500/20 text-xs">
                  <Box className="h-5 w-5" />
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors">
                    {product.name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">
                    {product.id}
                  </span>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 font-bold text-[10px]"
              >
                {product.category}
              </Badge>
            </TableCell>
            <TableCell className="text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="font-black text-slate-900 dark:text-slate-100">
                  {product.instances}
                </span>
                <Store className="h-3 w-3 text-slate-400" />
              </div>
            </TableCell>
            <TableCell className="text-center font-black text-indigo-600 dark:text-indigo-400">
              {product.avgPrice}
            </TableCell>
            <TableCell className="text-center">
              <Badge
                className={
                  product.stockLevel === "High"
                    ? "bg-emerald-500"
                    : product.stockLevel === "Critical"
                      ? "bg-rose-500 animate-pulse"
                      : "bg-amber-500"
                }
              >
                {product.stockLevel}
              </Badge>
            </TableCell>
            <TableCell className="text-center">
              <div className="flex items-center justify-center gap-1.5">
                <FileCheck
                  className={`h-4 w-4 ${product.status === "Verified" ? "text-indigo-500" : "text-slate-300"}`}
                />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {product.status}
                </span>
              </div>
            </TableCell>
            <TableCell className="pr-6 text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-full"
                  >
                    <MoreVertical className="h-4 w-4 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 rounded-2xl p-2 shadow-2xl border-none"
                >
                  <DropdownMenuLabel className="font-black text-xs uppercase tracking-widest p-3">
                    Product Actions
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-muted/50" />
                  <DropdownMenuItem
                    className="rounded-xl font-bold cursor-pointer group"
                    onClick={() =>
                      toast.info("Product detail view not yet available", {
                        description:
                          "There's no per-product detail page in the superadmin panel yet.",
                      })
                    }
                  >
                    <Eye className="h-4 w-4 mr-2 text-slate-400 group-hover:text-primary" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="rounded-xl font-bold cursor-pointer group"
                    onClick={() =>
                      toast.info("Product editing not yet available", {
                        description:
                          "There's no admin product-edit endpoint yet — this product belongs to a store's own inventory.",
                      })
                    }
                  >
                    <Plus className="h-4 w-4 mr-2 text-slate-400 group-hover:text-primary" />
                    Edit Product
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-muted/50" />
                  <DropdownMenuItem
                    className="rounded-xl font-bold cursor-pointer group text-indigo-600"
                    onClick={() =>
                      toast.info("Per-entry standardization not yet available", {
                        description:
                          "Use \"Standardize Catalog\" above to normalize the whole catalog at once.",
                      })
                    }
                  >
                    <FileCheck className="h-4 w-4 mr-2 text-indigo-400 group-hover:text-indigo-600" />
                    Standardize Entry
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
        {productList.length === 0 && !isLoading && (
          <TableRow>
            <TableCell
              colSpan={7}
              className="text-center py-20 text-slate-400 font-medium"
            >
              <div className="flex flex-col items-center gap-2">
                <Box className="h-10 w-10 opacity-20" />
                <span>No products found in the global catalog</span>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
