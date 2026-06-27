"use client";

import { useEffect, useState } from "react";
import { webApiClient } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCcw, AlertTriangle, Clock, Package } from "lucide-react";

export function StoreInventoryTab({ storeId }: { storeId: string }) {
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [subTab, setSubTab] = useState<"all" | "low_stock" | "expiring">("all");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invRes, lowRes, expRes, valRes] = await Promise.all([
        webApiClient.getInventory(storeId, 1, 100),
        webApiClient.getLowStockInventory(storeId),
        webApiClient.getExpiringInventory(storeId, 90),
        webApiClient.getInventoryValue(storeId),
      ]);
      setInventory(invRes?.data || invRes || []); 
      setLowStock(lowRes || []);
      setExpiring(expRes || []);
      setTotalValue(valRes?.total_value || 0);
    } catch (err) {
      console.error("Failed to fetch inventory", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [storeId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 text-muted-foreground">
        <RefreshCcw className="h-6 w-6 animate-spin mr-2" />
        <span>Loading inventory...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-none shadow-sm bg-muted/30">
          <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold">Total Inventory Value</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-black">₦{totalValue.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-sm bg-red-50 dark:bg-red-950/20">
          <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-red-600">Low Stock Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-black text-red-600">{lowStock.length}</div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-amber-50 dark:bg-amber-950/20">
          <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-bold text-amber-600">Expiring Soon (90 Days)</CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-black text-amber-600">{expiring.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button
          variant={subTab === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setSubTab("all")}
        >
          All Items ({inventory.length})
        </Button>
        <Button
          variant={subTab === "low_stock" ? "destructive" : "outline"}
          size="sm"
          onClick={() => setSubTab("low_stock")}
        >
          Low Stock ({lowStock.length})
        </Button>
        <Button
          variant={subTab === "expiring" ? "secondary" : "outline"}
          size="sm"
          className={subTab === "expiring" ? "bg-amber-500 text-white hover:bg-amber-600 border-transparent" : ""}
          onClick={() => setSubTab("expiring")}
        >
          Expiring Soon ({expiring.length})
        </Button>
      </div>

      <div className="border rounded-md overflow-hidden bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Medicine</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="text-right">Expiry Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(subTab === "all" ? inventory : subTab === "low_stock" ? lowStock : expiring).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No items found in this category.
                </TableCell>
              </TableRow>
            ) : (
              (subTab === "all" ? inventory : subTab === "low_stock" ? lowStock : expiring).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.medicine?.name || "Unknown Medicine"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {item.medicine?.category?.name || "Uncategorized"}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={item.quantity_in_stock <= item.reorder_level ? "text-red-600 font-bold" : ""}>
                      {item.quantity_in_stock}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium">₦{item.selling_price}</TableCell>
                  <TableCell className="text-right">
                    <span className={item.expiry_date && new Date(item.expiry_date) <= new Date(new Date().setDate(new Date().getDate() + 90)) ? "text-amber-600 font-bold" : ""}>
                      {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : "N/A"}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
