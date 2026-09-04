"use client";

import { useState } from "react";
import {
  Search,
  ChevronRight,
  Loader2,
  Download,
  Plus,
  Filter,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  useAdminProducts,
  useStandardizeProductsMutation,
} from "@/lib/api/admin-hooks";
import { useDebounce } from "@/hooks/use-debounce";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import { GlobalProductsMetrics } from "./global-products-metrics";
import { GlobalProductsTable } from "./global-products-table";



export default function GlobalProductsManagement() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const debouncedSearch = useDebounce(search, 500);

  const {
    data: response,
    isLoading,
    error,
    refetch,
  } = useAdminProducts(
    page,
    debouncedSearch,
    category === "all" ? "" : category,
  );
  const standardizeMutation = useStandardizeProductsMutation();

  const handlePageChange = (newPage: number) => {
    if (
      newPage >= 1 &&
      (response?.meta?.last_page ? newPage <= response.meta.last_page : true)
    ) {
      setPage(newPage);
    }
  };

  const handleExportMetrics = () => {
    const metrics = response?.metrics;
    if (!metrics) {
      toast.error("Nothing to export yet", {
        description: "Metrics haven't loaded.",
      });
      return;
    }

    const rows: [string, string | number][] = [
      ["Global Catalog Total (SKUs)", productMeta?.total ?? 0],
      ["Most Stocked Category", metrics.mostStockedCategory?.name ?? "N/A"],
      [
        "Most Stocked Category Growth",
        metrics.mostStockedCategory?.growth ?? "0%",
      ],
      ["Stock Flag Rate", metrics.stockAlerts?.rate ?? "0%"],
      ["Stock Flag Critical Alerts", metrics.stockAlerts?.count ?? 0],
      ["PCN Compliance Rate", metrics.compliance?.rate ?? "0%"],
      ["PCN Compliance Status", metrics.compliance?.status ?? "Unknown"],
    ];

    const csv = [
      ["Metric", "Value"],
      ...rows.map(([label, value]) => [label, String(value)]),
    ]
      .map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `global-product-metrics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast.success("Metrics exported", {
      description: "Downloaded as CSV.",
    });
  };

  const handleStandardize = async () => {
    toast.info("Standardization Started", {
      description: "Scanning catalog for inconsistencies...",
    });
    standardizeMutation.mutate(undefined, {
      onSuccess: (res) => {
        toast.success("Standardization Complete", {
          description: res.message,
        });
      },
      onError: (err) => {
        toast.error("Standardization Failed", {
          description: err.message,
        });
      },
    });
  };

  const productList = response?.data || [];
  const productMeta = response?.meta;
  const productMetrics = response?.metrics;
  const productCategories = response?.categories || [];

  if (isLoading && !response) {
    return <AdminSkeleton />;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
            Global Products
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Monitor product catalog and inventory trends platform-wide
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
          <Button
            variant="outline"
            className="border-2 font-bold dark:bg-slate-900 dark:border-slate-800 w-full sm:w-auto"
            onClick={handleExportMetrics}
          >
            <Download className="h-4 w-4 mr-2" />
            Export Metrics
          </Button>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20 w-full sm:w-auto"
            onClick={handleStandardize}
            disabled={standardizeMutation.isPending}
          >
            {standardizeMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Standardize Catalog
          </Button>
        </div>
      </div>

      <GlobalProductsMetrics productMetrics={productMetrics} />

      <Card className="border-none shadow-sm overflow-hidden bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative w-full max-sm max-w-sm group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <Input
                placeholder="Search global catalog..."
                className="pl-10 bg-slate-50 dark:bg-slate-800 border-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              {isLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500 mr-2" />
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="font-bold border-2 capitalize"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    {category === "all" ? "All Categories" : category}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 rounded-2xl p-2 shadow-2xl border-none"
                >
                  <DropdownMenuLabel className="font-black text-xs uppercase tracking-widest p-3">
                    Filter by Category
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-muted/50" />
                  <DropdownMenuItem
                    className="rounded-xl font-bold cursor-pointer"
                    onClick={() => setCategory("all")}
                  >
                    All Categories
                  </DropdownMenuItem>
                  {productCategories?.map((cat: string) => (
                    <DropdownMenuItem
                      key={cat}
                      className="rounded-xl font-bold cursor-pointer capitalize"
                      onClick={() => setCategory(cat)}
                    >
                      {cat}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden md:block" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Global Catalog: {productMeta?.total || 0} SKUs
              </p>
            </div>
          </div>

          <div className="overflow-x-auto min-h-[400px]">
            <GlobalProductsTable
              productList={productList}
              isLoading={isLoading}
              error={error}
              refetch={refetch}
            />
          </div>

          {productMeta && productMeta.last_page > 1 && (
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Page {productMeta.current_page} of {productMeta.last_page}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={productMeta.current_page === 1}
                  onClick={() => handlePageChange(productMeta.current_page - 1)}
                  className="h-8 border-2 font-black text-xs uppercase tracking-tighter"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={productMeta.current_page === productMeta.last_page}
                  onClick={() => handlePageChange(productMeta.current_page + 1)}
                  className="h-8 border-2 font-black text-xs uppercase tracking-tighter"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
