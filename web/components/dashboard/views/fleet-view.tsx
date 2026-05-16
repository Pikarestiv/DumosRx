"use client";

import { Plus, Circle, MoreVertical, Settings, Users, Trash2 } from "lucide-react";
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

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { webApiClient } from "@/lib/api/client";
import { useDashboardStore } from "@/lib/store/use-dashboard-store";
import { StoreModal } from "../store-modal";

interface FleetViewProps {
  stores: any[];
}

export function FleetView({ stores }: FleetViewProps) {
  const router = useRouter();
  const { fetchData } = useDashboardStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<any>(null);

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

  const handleDeleteStore = async (storeId: string) => {
    if (confirm("Are you sure you want to remove this store? This will also deactivate associated staff.")) {
        try {
            await webApiClient.deleteStore(storeId);
            toast.success("Store removed successfully");
            fetchData(true);
        } catch (err: any) {
            toast.error(err.message || "Failed to remove store");
        }
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <StoreModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => fetchData(true)}
        store={editingStore} 
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Store Fleet</h1>
          <p className="text-muted-foreground">Manage and monitor all your connected pharmacy locations</p>
        </div>
        <Button className="font-bold" onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Register New Store
        </Button>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle>Connected Store Instances</CardTitle>
          <CardDescription>Live status and sales performance across your entire network.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-muted text-xs font-bold uppercase">
                <TableHead>Store Name</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Location</TableHead>
                <TableHead className="text-center">Last Sync</TableHead>
                <TableHead className="text-right">Daily Sales</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((store: any) => (
                <TableRow key={store.id} className="border-muted hover:bg-muted/30">
                  <TableCell className="font-bold py-4">
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
                  <TableCell className="text-center text-sm text-muted-foreground">{store.lastSync}</TableCell>
                  <TableCell className="text-right font-black">{store.sales}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Store Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleEdit(store)}>
                          <Settings className="h-4 w-4 mr-2" />
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
        </CardContent>
      </Card>
    </div>
  );
}
