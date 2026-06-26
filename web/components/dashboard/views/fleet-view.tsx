"use client";

import { Plus, Circle, MoreVertical, Settings, Users, Trash2, Store, Activity, ShoppingCart, AlertTriangle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useStores, useDeleteStoreMutation } from "@/lib/api/hooks";
import { StoreModal } from "../store-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface FleetViewProps {
  stores: any[];
}

export function FleetView({ stores: initialStores }: FleetViewProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<any>(null);
  const deleteMutation = useDeleteStoreMutation();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [viewingStore, setViewingStore] = useState<any>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  const { data: storesData } = useStores();
  const storesToDisplay = storesData || initialStores;

  const handleManageStaff = (storeId: string) => {
    router.push(`/dashboard/staff?store_id=${storeId}`);
  };

  const handleCreate = () => {
    setEditingStore(null);
    setIsModalOpen(true);
  };

  const handleEdit = (store: any) => {
    setEditingStore(store);
    setIsModalOpen(true);
  };

  const handleView = (store: any) => {
    setViewingStore(store);
    setIsViewModalOpen(true);
  };

  const handleDeleteStore = async (storeId: string) => {
    setDeleteTargetId(storeId);
  };

  const confirmDeleteStore = (storeId: string) => {
    deleteMutation.mutate(storeId, {
      onSuccess: () => toast.success("Store removed successfully"),
      onError: (err: any) => toast.error(err.message || "Failed to remove store"),
    });
    setDeleteTargetId(null);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <StoreModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => {}} 
        store={editingStore} 
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Store Fleet</h1>
          <p className="text-muted-foreground">Manage and monitor all your connected store locations</p>
        </div>
        <Button className="font-bold sm:w-auto w-full" onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Register New Store
        </Button>
      </div>

      <Card className="border-none shadow-sm min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Connected Store Instances</CardTitle>
          <CardDescription>Live status and sales performance across your entire network.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {!storesToDisplay || storesToDisplay.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Store className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold tracking-tight">No connected stores</h3>
              <p className="text-sm text-muted-foreground mt-2 mb-6 max-w-sm">
                Get started by registering your first store to sync data, track performance, and manage your fleet.
              </p>
              <Button className="font-bold" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Register First Store
              </Button>
            </div>
          ) : (
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent border-muted text-xs font-bold uppercase">
                  <TableHead className="pl-6">Store Name</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Location</TableHead>
                  <TableHead className="text-center">Staff</TableHead>
                  <TableHead className="text-center">Alerts</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="w-[50px] pr-6"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {storesToDisplay.map((store: any) => (
                  <TableRow key={store.id} className="border-muted hover:bg-muted/30">
                    <TableCell className="font-bold py-4 pl-6">
                      <div className="flex flex-col">
                        <span>{store.name}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{store.id}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={`${store.status === "online" ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-500 border-slate-200"} font-bold`}
                      >
                        <Circle className={`h-2 w-2 mr-2 fill-current ${store.status === "online" ? "text-green-500" : "text-slate-300"}`} />
                        {store.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm font-medium">{store.location || "Nigeria"}</TableCell>
                    <TableCell className="text-center font-bold">
                        <div className="flex items-center justify-center gap-1">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            {store.staff_count ?? 0}
                        </div>
                    </TableCell>
                    <TableCell className="text-center">
                        {(store.low_stock_alerts > 0 || store.expiring_items > 0) ? (
                            <Badge variant="destructive" className="font-bold text-[10px]">
                                {store.low_stock_alerts + store.expiring_items} Alerts
                            </Badge>
                        ) : (
                            <span className="text-muted-foreground text-xs">Healthy</span>
                        )}
                    </TableCell>
                    <TableCell className="text-right font-black">{store.sales}</TableCell>
                    <TableCell className="pr-6">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Store Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="cursor-pointer" onClick={() => handleView(store)}>
                            <Store className="h-4 w-4 mr-2 text-slate-500" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => handleEdit(store)}>
                            <Settings className="h-4 w-4 mr-2 text-indigo-500" />
                            Edit Store
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => handleManageStaff(store.id)}>
                            <Users className="h-4 w-4 mr-2" />
                            Manage Staff
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive cursor-pointer" onClick={() => handleDeleteStore(store.id)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Store
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="Remove Store"
        description="Are you sure you want to remove this store? This will also deactivate all associated staff accounts."
        confirmLabel="Remove Store"
        onConfirm={() => deleteTargetId && confirmDeleteStore(deleteTargetId)}
      />

      <FleetStoreDetailsDialog 
        isOpen={isViewModalOpen}
        onOpenChange={setIsViewModalOpen}
        store={viewingStore}
      />
    </div>
  );
}

function FleetStoreDetailsDialog({
  isOpen,
  onOpenChange,
  store,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  store: any;
}) {
  const [activeTab, setActiveTab] = useState("overview");
  if (!store) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-2xl font-black">{store.name}</DialogTitle>
            <Badge
                variant="outline"
                className={`${store.status === "online" ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-500 border-slate-200"} font-bold`}
              >
              <Circle className={`h-2 w-2 mr-2 fill-current ${store.status === "online" ? "text-green-500" : "text-slate-300"}`} />
              {store.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">{store.location || store.address || "N/A"}</p>
        </DialogHeader>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
          <Card className="border-none shadow-sm bg-muted/30">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="font-bold uppercase text-xs">Total Revenue</CardDescription>
              <CardTitle className="text-2xl font-black">{store.sales}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-none shadow-sm bg-muted/30">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="font-bold uppercase text-xs">Active Staff</CardDescription>
              <CardTitle className="text-2xl font-black">{store.staff_count ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-none shadow-sm bg-muted/30">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="font-bold uppercase text-xs">Total Inventory</CardDescription>
              <CardTitle className="text-2xl font-black">{store.total_inventory ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-none shadow-sm bg-red-50 dark:bg-red-950/20">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="font-bold uppercase text-xs text-red-600">Action Needed</CardDescription>
              <CardTitle className="text-xl font-black text-red-600">
                {(store.low_stock_alerts ?? 0)} Low Stock
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
          <Button variant={activeTab === "overview" ? "secondary" : "ghost"} size="sm" className="rounded-xl font-bold" onClick={() => setActiveTab("overview")}>Overview</Button>
          <Button variant={activeTab === "activities" ? "secondary" : "ghost"} size="sm" className="rounded-xl font-bold" onClick={() => setActiveTab("activities")}>Recent Activities</Button>
          <Button variant={activeTab === "transactions" ? "secondary" : "ghost"} size="sm" className="rounded-xl font-bold" onClick={() => setActiveTab("transactions")}>Recent Sales</Button>
        </div>

        <div className="space-y-4 min-h-[300px]">
          {activeTab === "overview" && (
            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500 mb-1">Store ID</p>
                  <p className="font-mono text-sm bg-muted inline-block px-2 py-1 rounded">{store.id}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500 mb-1">Contact Phone</p>
                  <p className="font-medium">{store.phone || "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500 mb-1">Store Type</p>
                  <p className="font-medium capitalize">{store.store_type || "Retail"}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500 mb-1">Last Sync</p>
                  <p className="font-medium">{store.lastSync}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500 mb-1">Today's Sales</p>
                  <p className="font-black text-green-600 text-lg">{store.daily_sales}</p>
                </div>
            </div>
          )}

          {activeTab === "activities" && (
            <div className="space-y-3">
               {!store.recent_activities || store.recent_activities.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Activity className="h-8 w-8 opacity-20 mb-2" />
                    <p className="font-medium">No recent activities found for this store</p>
                 </div>
               ) : store.recent_activities.map((act: any) => (
                 <div key={act.id} className="p-4 border rounded-xl flex items-start gap-4">
                    <div className="mt-1">
                        <Activity className="h-5 w-5 text-indigo-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm flex items-center gap-2">
                        <span className="uppercase tracking-wider text-[10px] bg-muted px-2 py-0.5 rounded">{act.action}</span>
                        <span>{act.table_name}</span>
                      </p>
                      <p className="text-sm text-muted-foreground mt-1 break-words">
                        {act.details || "No details provided"}
                      </p>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <p className="text-xs font-bold">{act.user?.name || act.user?.first_name || 'System'}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(act.created_at).toLocaleString()}</p>
                    </div>
                 </div>
               ))}
            </div>
          )}

          {activeTab === "transactions" && (
            <div className="space-y-4">
               {!store.recent_transactions || store.recent_transactions.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <ShoppingCart className="h-8 w-8 opacity-20 mb-2" />
                    <p className="font-medium">No recent sales found for this store</p>
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
                        <TableRow key={trx.id}>
                          <TableCell className="font-mono text-xs">{trx.transaction_number}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {trx.items?.map((item: any) => `${item.quantity}x ${item.medicine_name || 'Item'}`).join(', ') || 'No items'}
                          </TableCell>
                          <TableCell className="text-right font-black text-green-600">₦{trx.total_amount}</TableCell>
                          <TableCell className="text-right text-xs font-medium">{new Date(trx.created_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                 </div>
               )}
            </div>
          )}
        </div>

        <DialogFooter className="mt-2 border-t pt-4">
          <Button onClick={() => onOpenChange(false)} className="rounded-xl font-bold px-8" variant="ghost">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );}

