"use client";

import { useState } from "react";
import { Circle, Activity, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { ActivityDetails, filterIndirectSaleLogs } from "./activities-view";

export function FleetStoreDetailsView({
  storeId,
  stores,
}: {
  storeId?: string;
  stores?: any[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const [viewingTransaction, setViewingTransaction] = useState<any>(null);

  if (!storeId || !stores) return null;
  const store = stores.find((s: any) => s.id.toString() === storeId);
  if (!store) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-2xl font-bold mb-2">Store Not Found</h2>
        <Button onClick={() => router.push("/dashboard/fleet")}>
          Back to Fleet
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/dashboard/fleet")}
        >
          &larr; Back
        </Button>
        <h1 className="text-2xl font-black">{store.name}</h1>
        <Badge
          variant="outline"
          className={`${store.status === "online" ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-500 border-slate-200"} font-bold`}
        >
          <Circle
            className={`h-2 w-2 mr-2 fill-current ${store.status === "online" ? "text-green-500" : "text-slate-300"}`}
          />
          {store.status}
        </Badge>
      </div>
      <p className="text-muted-foreground">
        {store.location || store.address || "N/A"}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
        <Card className="border-none shadow-sm bg-muted/30">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="font-bold uppercase text-xs">
              Total Revenue
            </CardDescription>
            <CardTitle className="text-2xl font-black">{store.sales}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-none shadow-sm bg-muted/30">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="font-bold uppercase text-xs">
              Active Staff
            </CardDescription>
            <CardTitle className="text-2xl font-black">
              {store.staff_count ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-none shadow-sm bg-muted/30">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="font-bold uppercase text-xs">
              Total Inventory
            </CardDescription>
            <CardTitle className="text-2xl font-black">
              {store.total_inventory ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-none shadow-sm bg-red-50 dark:bg-red-950/20">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="font-bold uppercase text-xs text-red-600">
              Action Needed
            </CardDescription>
            <CardTitle className="text-xl font-black text-red-600">
              {store.low_stock_alerts ?? 0} Low Stock
            </CardTitle>
            {store.expiring_items > 0 && (
              <p className="text-xs text-red-600 font-bold mt-1">
                {store.expiring_items} Expiring Soon
              </p>
            )}
          </CardHeader>
        </Card>
      </div>

      <div className="flex gap-4 border-b mb-4 pb-2">
        <Button
          variant={activeTab === "overview" ? "secondary" : "ghost"}
          size="sm"
          className="rounded-xl font-bold"
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </Button>
        <Button
          variant={activeTab === "activities" ? "secondary" : "ghost"}
          size="sm"
          className="rounded-xl font-bold"
          onClick={() => setActiveTab("activities")}
        >
          Recent Activities
        </Button>
        <Button
          variant={activeTab === "transactions" ? "secondary" : "ghost"}
          size="sm"
          className="rounded-xl font-bold"
          onClick={() => setActiveTab("transactions")}
        >
          Recent Sales
        </Button>
      </div>

      <div className="space-y-4 min-h-[300px]">
        {activeTab === "overview" && (
          <div className="grid grid-cols-2 gap-y-6 gap-x-4">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500 mb-1">
                Store ID
              </p>
              <p className="font-mono text-sm bg-muted inline-block px-2 py-1 rounded">
                {store.id}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500 mb-1">
                Contact Phone
              </p>
              <p className="font-medium">{store.phone || "N/A"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500 mb-1">
                Store Type
              </p>
              <p className="font-medium capitalize">
                {store.store_type || "Retail"}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500 mb-1">
                Last Sync
              </p>
              <p className="font-medium">{store.lastSync}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500 mb-1">
                Today's Sales
              </p>
              <p className="font-black text-green-600 text-lg">
                {store.daily_sales}
              </p>
            </div>
          </div>
        )}

        {activeTab === "activities" && (
          <div className="space-y-3">
            {(() => {
              const filteredActivities = store.recent_activities
                ? store.recent_activities.filter((act: any) =>
                    filterIndirectSaleLogs(store.recent_activities, act),
                  )
                : [];
              const previewActivities = filteredActivities.slice(0, 10);

              return filteredActivities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Activity className="h-8 w-8 opacity-20 mb-2" />
                  <p className="font-medium">
                    No recent activities found for this store
                  </p>
                </div>
              ) : (
                <>
                  {previewActivities.map((act: any) => (
                    <div
                      key={act.id}
                      className="p-4 border rounded-xl flex items-start gap-4"
                    >
                      <div className="mt-1">
                        <Activity className="h-5 w-5 text-indigo-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm flex items-center gap-2">
                          <span className="uppercase tracking-wider text-[10px] bg-muted px-2 py-0.5 rounded">
                            {act.action}
                          </span>
                          <span>
                            {act.table_name ||
                              act.properties?.table_name ||
                              "System"}
                          </span>
                        </p>
                        <ActivityDetails
                          details={
                            act.details ||
                            act.properties?.details ||
                            act.description
                          }
                          tableName={
                            act.table_name || act.properties?.table_name
                          }
                          action={act.action}
                        />
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <p className="text-xs font-bold">
                          {act.user?.name || act.user?.first_name || "System"}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(act.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {filteredActivities.length > 0 && (
                    <div className="pt-4 flex justify-center">
                      <Button
                        variant="outline"
                        className="w-full text-primary border-primary hover:text-white hover:bg-primary"
                        onClick={() =>
                          router.push(
                            `/dashboard/staff/activities?storeId=${storeId}`,
                          )
                        }
                      >
                        View All Activities
                      </Button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {activeTab === "transactions" && (
          <div className="space-y-4">
            {!store.recent_transactions ||
            store.recent_transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ShoppingCart className="h-8 w-8 opacity-20 mb-2" />
                <p className="font-medium">
                  No recent sales found for this store
                </p>
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Receipt #</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {store.recent_transactions.map((trx: any) => (
                      <TableRow
                        key={trx.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setViewingTransaction(trx)}
                      >
                        <TableCell className="font-mono text-xs">
                          {trx.transaction_number}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {trx.items
                            ?.map(
                              (item: any) =>
                                `${item.quantity}x ${item.medicine_name || "Item"}`,
                            )
                            .join(", ") || "No items"}
                        </TableCell>
                        <TableCell className="text-right font-black text-green-600">
                          ₦{trx.total_amount}
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium">
                          {new Date(trx.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={!!viewingTransaction}
        onOpenChange={() => setViewingTransaction(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              Receipt #{viewingTransaction?.transaction_number}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm font-medium text-muted-foreground">
                <div className="flex flex-col">
                  <span>
                    Date:{" "}
                    {viewingTransaction &&
                      new Date(viewingTransaction.created_at).toLocaleString()}
                  </span>
                  <span>
                    Cashier: {viewingTransaction?.cashier_name || "Unknown"}
                  </span>
                </div>
                <span>Items: {viewingTransaction?.items?.length || 0}</span>
              </div>

              <div className="border rounded-md divide-y">
                {viewingTransaction?.items?.map((item: any) => (
                  <div
                    key={item.id}
                    className="p-3 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium">
                        {item.medicine_name || "Item"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} x ₦{item.unit_price}
                      </p>
                    </div>
                    <p className="font-bold">₦{item.total_price}</p>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <span className="font-bold">Total Amount</span>
                <span className="font-black text-green-600 text-lg">
                  ₦{viewingTransaction?.total_amount}
                </span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
