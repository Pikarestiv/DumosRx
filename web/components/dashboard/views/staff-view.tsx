"use client";

import { useState } from "react";
import { Plus, Circle, MoreVertical, Users, UserPlus, Shield, Key } from "lucide-react";
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
import { StaffModal } from "../staff-modal";
import { useDashboardStore } from "@/lib/store/use-dashboard-store";
import { toast } from "sonner";
import { webApiClient } from "@/lib/api/client";

interface StaffViewProps {
  staff: any[];
  stores: any[];
}

export function StaffView({ staff, stores }: StaffViewProps) {
  const [selectedStore, setSelectedStore] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  
  const { fetchData } = useDashboardStore();

  const handleCreate = () => {
      setEditingStaff(null);
      setIsModalOpen(true);
  };

  const handleEdit = (s: any) => {
      setEditingStaff(s);
      setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
      if (confirm("Are you sure you want to deactivate this staff account?")) {
          try {
              await webApiClient.deleteStaff(id);
              toast.success("Staff account deactivated");
              fetchData(true);
          } catch (err: any) {
              toast.error(err.message || "Failed to deactivate staff");
          }
      }
  };

  // Filter staff based on selected store
  const filteredStaff = selectedStore === "all" 
    ? staff 
    : staff.filter(s => s.store_id === selectedStore || s.store_name === selectedStore || s.store === selectedStore);

  const hasStaff = filteredStaff && filteredStaff.length > 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Staff Management</h1>
          <p className="text-muted-foreground">Monitor performance and manage accounts across your fleet</p>
        </div>
        <div className="flex gap-4">
          <select 
            className="bg-background border border-input px-4 py-2 rounded-lg text-sm font-bold focus:ring-2 focus:ring-primary outline-none transition-all"
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
          >
            <option value="all">All Stores</option>
            {stores.map(store => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
          <Button variant="outline" className="font-bold">Export Staff List</Button>
          <Button className="font-bold bg-primary hover:bg-primary/90" onClick={handleCreate}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Staff Member
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Staff</p>
            <h3 className="text-3xl font-black mt-2">{filteredStaff?.length || 0}</h3>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active Now</p>
            <h3 className="text-3xl font-black mt-2 text-green-600">
              {filteredStaff?.filter((s:any) => s.is_active || s.status === 'online').length || 0}
            </h3>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">System Roles</p>
            <div className="flex gap-2 mt-2">
                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 font-bold">Admin</Badge>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold">Pharm</Badge>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-bold">Cashier</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="bg-white/50 dark:bg-slate-900/50 border-b border-muted/50">
          <CardTitle className="text-xl font-black">Staff Records</CardTitle>
          <CardDescription>
            {hasStaff 
              ? `Real-time records for ${selectedStore === 'all' ? 'all stores' : stores.find(st => st.id === selectedStore)?.name}.`
              : "No staff records found for this selection."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!hasStaff ? (
            <div className="py-20 text-center flex flex-col items-center justify-center">
              <Users className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
              <p className="text-muted-foreground font-medium">No results found...</p>
              <Button variant="link" onClick={handleCreate} className="mt-2 font-bold text-primary">Create your first staff account</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-muted text-xs font-bold uppercase">
                  <TableHead className="pl-6">Staff Member</TableHead>
                  <TableHead className="text-center">Role</TableHead>
                  <TableHead className="text-center">Store / Shop</TableHead>
                  <TableHead className="text-center">Credentials</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((s: any) => (
                  <TableRow key={s.id} className="border-muted hover:bg-muted/30 group">
                    <TableCell className="font-bold py-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black shadow-sm">
                          {s.first_name?.charAt(0) || "U"}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-900 dark:text-white">{(s.first_name || '') + ' ' + (s.last_name || '')}</span>
                          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
                            {s.email}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="font-bold capitalize px-3">
                        {s.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm font-bold text-slate-500">
                      {s.store?.name || stores.find(st => st.id === s.store_id)?.name || "Main Branch"}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1 text-[10px] font-black text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
                           <Shield className="h-3 w-3" />
                           {s.username || 'N/A'}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-black text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                           <Key className="h-3 w-3" />
                           {s.pin || '****'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={`${(s.is_active) ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-500 border-slate-200"} font-bold`}
                      >
                        <Circle className={`h-2 w-2 mr-2 fill-current ${(s.is_active) ? "text-green-500" : "text-slate-300"}`} />
                        {s.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[160px] font-bold">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleEdit(s)}>Edit Details</DropdownMenuItem>
                          <DropdownMenuItem className="text-rose-600 focus:text-rose-600" onClick={() => handleDelete(s.id)}>Deactivate</DropdownMenuItem>
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

      <StaffModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => fetchData(true)}
        stores={stores}
        staffMember={editingStaff}
      />
    </div>
  );
}
