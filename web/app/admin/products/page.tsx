"use client";

import { useState } from "react";
import { 
  Search, 
  Filter, 
  TrendingUp, 
  Package, 
  AlertTriangle,
  FileCheck,
  MoreVertical,
  Plus,
  Download,
  BarChart3,
  Box,
  ChevronLeft,
  ChevronRight,
  Store,
  Loader2,
  ShieldAlert,
  Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useAdminProducts, useStandardizeProductsMutation } from "@/lib/api/admin-hooks";
import { useDebounce } from "@/hooks/use-debounce";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";

const _ICON_MAP: any = {
  Package: Package,
  TrendingUp: TrendingUp,
  AlertTriangle: AlertTriangle
};

export default function GlobalProductsManagement() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const debouncedSearch = useDebounce(search, 500);

  const { data: response, isLoading, error, refetch } = useAdminProducts(page, debouncedSearch, category === 'all' ? '' : category);
  const standardizeMutation = useStandardizeProductsMutation();

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && (response?.meta?.last_page ? newPage <= response.meta.last_page : true)) {
      setPage(newPage);
    }
  };

  const handleExportMetrics = () => {
      toast.info("Preparing export...");
  };

  const handleStandardize = async () => {
      toast.info("Standardization Started", {
          description: "Scanning catalog for inconsistencies..."
      });
      standardizeMutation.mutate(undefined, {
          onSuccess: (res: any) => {
              toast.success("Standardization Complete", {
                  description: res.message
              });
          },
          onError: (err: any) => {
              toast.error("Standardization Failed", {
                  description: err.message
              });
          }
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
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Global Products</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">Monitor product catalog and inventory trends platform-wide</p>
        </div>
        <div className="flex items-center gap-3">
            <Button 
                variant="outline" 
                className="border-2 font-bold dark:bg-slate-900 dark:border-slate-800"
                onClick={handleExportMetrics}
            >
                <Download className="h-4 w-4 mr-2" />
                Export Metrics
            </Button>
            <Button 
                className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20"
                onClick={handleStandardize}
                disabled={standardizeMutation.isPending}
            >
                {standardizeMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Standardize Catalog
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-none bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12 group-hover:rotate-0 transition-transform duration-500">
                  <BarChart3 className="h-24 w-24" />
              </div>
              <CardContent className="p-6 relative z-10">
                  <p className="text-xs font-bold text-indigo-100 uppercase tracking-widest mb-1">Most Stocked Category</p>
                  <h3 className="text-2xl font-black">{productMetrics?.mostStockedCategory?.name || "Analgesics"}</h3>
                  <div className="mt-4 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-300" />
                      <span className="text-xs font-bold">{productMetrics?.mostStockedCategory?.growth || "14.2%"} Growth</span>
                  </div>
              </CardContent>
          </Card>
          
          <Card className="border-none bg-slate-900 text-white shadow-sm overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-8 opacity-10 -rotate-12 group-hover:rotate-0 transition-transform duration-500">
                  <AlertTriangle className="h-24 w-24" />
              </div>
              <CardContent className="p-6 relative z-10">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Stock Flag Rate</p>
                  <h3 className="text-2xl font-black">{productMetrics?.stockAlerts?.rate || "2.4%"}</h3>
                  <div className="mt-4 flex items-center gap-2 text-rose-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs font-bold">{productMetrics?.stockAlerts?.count || "81"} Critical Alerts</span>
                  </div>
              </CardContent>
          </Card>

          <Card className="border-none bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800">
              <CardContent className="p-6">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">PCN Compliance</p>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white">Verified {productMetrics?.compliance?.rate || "98%"}</h3>
                  <div className="mt-4 w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500" style={{ width: productMetrics?.compliance?.rate || "98%" }} />
                  </div>
              </CardContent>
          </Card>
      </div>

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
                {isLoading && <Loader2 className="h-4 w-4 animate-spin text-indigo-500 mr-2" />}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="font-bold border-2 capitalize">
                      <Filter className="h-4 w-4 mr-2" />
                      {category === 'all' ? 'All Categories' : category}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2 shadow-2xl border-none">
                    <DropdownMenuLabel className="font-black text-xs uppercase tracking-widest p-3">Filter by Category</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-muted/50" />
                    <DropdownMenuItem 
                      className="rounded-xl font-bold cursor-pointer"
                      onClick={() => setCategory('all')}
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
            {error ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <ShieldAlert className="h-10 w-10 text-rose-500" />
                <p className="text-rose-500 font-bold">{error instanceof Error ? error.message : "Sync error"}</p>
                <Button onClick={() => refetch()} variant="outline">Retry</Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 pl-6 h-12">Product Details</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">Global Category</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">Pharmacy Instances</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">Avg. Cloud Price</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">Stock Health</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">Verification</TableHead>
                    <TableHead className="w-[80px] h-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productList.map((product: any) => (
                    <TableRow key={product.id} className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-colors">
                      <TableCell className="pl-6 py-5">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center font-black text-amber-500 border border-amber-500/20 text-xs">
                            <Box className="h-5 w-5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors">{product.name}</span>
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">{product.id}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 font-bold text-[10px]">
                          {product.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                              <span className="font-black text-slate-900 dark:text-slate-100">{product.instances}</span>
                              <Store className="h-3 w-3 text-slate-400" />
                          </div>
                      </TableCell>
                      <TableCell className="text-center font-black text-indigo-600 dark:text-indigo-400">
                        {product.avgPrice}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={
                          product.stockLevel === 'High' ? 'bg-emerald-500' :
                          product.stockLevel === 'Critical' ? 'bg-rose-500 animate-pulse' :
                          'bg-amber-500'
                        }>
                          {product.stockLevel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1.5">
                              <FileCheck className={`h-4 w-4 ${product.status === 'Verified' ? 'text-indigo-500' : 'text-slate-300'}`} />
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{product.status}</span>
                          </div>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-full">
                                  <MoreVertical className="h-4 w-4 text-slate-400" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2 shadow-2xl border-none">
                              <DropdownMenuLabel className="font-black text-xs uppercase tracking-widest p-3">Product Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator className="bg-muted/50" />
                              <DropdownMenuItem className="rounded-xl font-bold cursor-pointer group" onClick={() => toast.info(`Viewing ${product.name}`)}>
                                <Eye className="h-4 w-4 mr-2 text-slate-400 group-hover:text-primary" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem className="rounded-xl font-bold cursor-pointer group" onClick={() => toast.info(`Editing ${product.name}`)}>
                                <Plus className="h-4 w-4 mr-2 text-slate-400 group-hover:text-primary" />
                                Edit Product
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-muted/50" />
                              <DropdownMenuItem className="rounded-xl font-bold cursor-pointer group text-indigo-600" onClick={() => toast.success(`${product.name} Standardized`)}>
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
                      <TableCell colSpan={7} className="text-center py-20 text-slate-400 font-medium">
                        <div className="flex flex-col items-center gap-2">
                           <Box className="h-10 w-10 opacity-20" />
                           <span>No products found in the global catalog</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
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
