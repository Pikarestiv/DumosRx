"use client";

import { useEffect, useState } from "react";
import {
  Search,
  Filter,
  MoreVertical,
  ExternalLink,
  CreditCard,
  History,
  Ban,
  Mail,
  ChevronLeft,
  ChevronRight,
  Download,
  Store as StoreIcon,
  Loader2,
  ShieldAlert,
  Plus,
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
import { useAdminPharmacies, useSuspendPharmacyMutation, useImpersonatePharmacyMutation } from "@/lib/api/admin-hooks";
import { useSearchParams, useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";

export default function PharmaciesManagement() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialSearch = searchParams.get("search") || "";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialSearch);
  const [selectedPharmacy, setSelectedPharmacy] = useState<any>(null);
  const [isSuspendDialogOpen, setIsSuspendDialogOpen] = useState(false);
  
  const debouncedSearch = useDebounce(search, 500);

  const { data: response, isLoading, error, refetch } = useAdminPharmacies(page, debouncedSearch);
  const suspendMutation = useSuspendPharmacyMutation();
  const impersonateMutation = useImpersonatePharmacyMutation();

  useEffect(() => {
    if (initialSearch && initialSearch !== search) {
      setSearch(initialSearch);
    }
  }, [initialSearch]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= (response?.meta?.last_page || 1)) {
      setPage(newPage);
    }
  };

  const pharmacyList = response?.data || [];
  const pharmacyMeta = response?.meta;

  const handleExportCSV = () => {
    if (pharmacyList.length === 0) return;

    const headers = ["ID", "Name", "Owner", "Email", "Plan", "Status", "Date"];
    const csvData = pharmacyList.map((p: any) =>
      [p.id, p.name, p.owner, p.email, p.plan, p.status, p.date].join(","),
    );

    const blob = new Blob([[headers.join(","), ...csvData].join("\n")], {
      type: "text/csv",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pharmacies-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const handleSuspend = async () => {
    if (!selectedPharmacy) return;
    
    suspendMutation.mutate(selectedPharmacy.id, {
      onSuccess: () => {
        toast.success("Account Suspended", {
          description: `${selectedPharmacy.name} has been suspended successfully.`,
        });
        setIsSuspendDialogOpen(false);
        setSelectedPharmacy(null);
      },
      onError: (err: any) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to suspend pharmacy.",
        });
      }
    });
  };

  const handleImpersonate = (pharmacy: any) => {
    impersonateMutation.mutate(pharmacy.id, {
      onSuccess: (data: any) => {
        toast.success("Impersonation Successful", {
          description: `Logged in as ${data.user.name}. Redirecting...`,
        });
        
        // Store current admin token as 'impersonator_token' for easy return
        const adminToken = localStorage.getItem("drx_admin_token");
        if (adminToken) {
           localStorage.setItem("drx_impersonator_token", adminToken);
        }

        // Set the new token for the dashboard
        localStorage.setItem("drx_token", data.token);
        localStorage.setItem("drx_user", JSON.stringify(data.user));
        
        // Redirect to dashboard
        router.push("/dashboard");
      },
      onError: (err: any) => {
        toast.error("Impersonation Failed", {
          description: err.message || "Failed to start impersonation session.",
        });
      }
    });
  };

  const handleViewBilling = (pharmacy: any) => {
    toast.info("Billing History", {
      description: `Fetching billing records for ${pharmacy.name}...`,
    });
  };

  if (isLoading && !response) {
    return <AdminSkeleton />;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
            Pharmacy Fleet
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Manage and monitor all business accounts on the platform
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="border-2 font-bold dark:bg-slate-900 dark:border-slate-800"
            onClick={handleExportCSV}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20"
            onClick={() => router.push("/admin/pharmacies/new")}
          >
            <Plus className="h-4 w-4 mr-2" />
            Register Pharmacy
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-sm overflow-hidden bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative w-full max-w-sm group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <Input
                placeholder="Search by name, ID or owner..."
                className="pl-10 bg-slate-100 dark:bg-slate-800 border-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
                    className="font-bold border-2"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 p-2">
                  <DropdownMenuLabel>Status</DropdownMenuLabel>
                  <DropdownMenuItem className="cursor-pointer">
                    Active Only
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer">
                    Pending Approval
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer">
                    Suspended
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Subscription</DropdownMenuLabel>
                  <DropdownMenuItem className="cursor-pointer">
                    Basic
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer">
                    Professional
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer">
                    Enterprise
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden md:block" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Showing {pharmacyList.length} of {pharmacyMeta?.total || 0}{" "}
                pharmacies
              </p>
            </div>
          </div>

          <div className="overflow-x-auto min-h-[400px]">
            {error ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <ShieldAlert className="h-10 w-10 text-rose-500" />
                <p className="text-rose-500 font-bold">{error instanceof Error ? error.message : "Sync error"}</p>
                <Button
                  onClick={() => refetch()}
                  variant="outline"
                >
                  Retry
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 pl-6 h-12">
                      Pharmacy Details
                    </TableHead>
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">
                      Owner & Contact
                    </TableHead>
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">
                      Subscription
                    </TableHead>
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">
                      Fleet Size
                    </TableHead>
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-right h-12">
                      Total Revenue
                    </TableHead>
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">
                      Status
                    </TableHead>
                    <TableHead className="w-[80px] h-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pharmacyList.map((pharmacy: any) => (
                    <TableRow
                      key={pharmacy.id}
                      className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-colors"
                    >
                      <TableCell className="pl-6 py-5">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center font-black text-indigo-500 border border-indigo-500/20 text-xs">
                            {pharmacy.name.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors">
                              {pharmacy.name}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">
                              {pharmacy.id}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-slate-700 dark:text-slate-300">
                            {pharmacy.owner}
                          </span>
                          <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            <Mail className="h-3 w-3" />
                            {pharmacy.email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center">
                          <Badge
                            variant="outline"
                            className="bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20 font-bold text-[10px] py-0.5"
                          >
                            {pharmacy.plan}
                          </Badge>
                          <span className="text-[9px] text-slate-400 mt-1">
                            Since {pharmacy.date}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-black text-xs text-slate-700 dark:text-slate-200">
                            {pharmacy.stores}
                          </div>
                          <StoreIcon className="h-3 w-3 text-slate-400" />
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-4 font-black text-slate-900 dark:text-white">
                        {pharmacy.revenue}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={
                            pharmacy.status === "Active"
                              ? "bg-emerald-500 hover:bg-emerald-600"
                              : pharmacy.status === "Suspended"
                                ? "bg-rose-500 hover:bg-rose-600"
                                : "bg-amber-500 hover:bg-amber-600"
                          }
                        >
                          {pharmacy.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-6">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                            >
                              <MoreVertical className="h-4 w-4 text-slate-400" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl shadow-xl border-slate-200 dark:border-slate-800">
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-3 py-2">Actions</DropdownMenuLabel>
                            <DropdownMenuItem 
                              className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold"
                              onClick={() => handleImpersonate(pharmacy)}
                            >
                              <ExternalLink className="h-4 w-4 text-indigo-500" />
                              Impersonate (Admin)
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold"
                              onClick={() => handleViewBilling(pharmacy)}
                            >
                              <CreditCard className="h-4 w-4 text-emerald-500" />
                              View Billing History
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold"
                              onClick={() => router.push(`/admin/system?search=${pharmacy.id}`)}
                            >
                              <History className="h-4 w-4 text-blue-500" />
                              System Logs
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="my-2 bg-slate-100 dark:bg-slate-800" />
                            <DropdownMenuItem 
                              className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                              onClick={() => {
                                setSelectedPharmacy(pharmacy);
                                setIsSuspendDialogOpen(true);
                              }}
                            >
                              <Ban className="h-4 w-4" />
                              Suspend Account
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pharmacyList.length === 0 && !isLoading && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-20 text-slate-400 font-medium"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <StoreIcon className="h-10 w-10 opacity-20" />
                          <span>No pharmacies match your search criteria</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>

          {pharmacyMeta && pharmacyMeta.last_page > 1 && (
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Page {pharmacyMeta.current_page} of {pharmacyMeta.last_page}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pharmacyMeta.current_page === 1}
                  onClick={() =>
                    handlePageChange(pharmacyMeta.current_page - 1)
                  }
                  className="h-8 border-2 font-black text-xs uppercase tracking-tighter"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Prev
                </Button>
                <div className="flex gap-1">
                  {Array.from(
                    { length: Math.min(5, pharmacyMeta.last_page) },
                    (_, i) => {
                      const pageNum = i + 1;
                      return (
                        <Button
                          key={i}
                          variant={
                            pageNum === pharmacyMeta.current_page
                              ? "default"
                              : "ghost"
                          }
                          size="sm"
                          onClick={() => handlePageChange(pageNum)}
                          className={`h-8 w-8 p-0 font-bold ${pageNum === pharmacyMeta.current_page ? "bg-indigo-600" : ""}`}
                        >
                          {pageNum}
                        </Button>
                      );
                    },
                  )}
                  {pharmacyMeta.last_page > 5 && (
                    <span className="px-2 text-slate-400">...</span>
                  )}
                  {pharmacyMeta.last_page > 5 && (
                    <Button
                      variant={
                        pharmacyMeta.last_page === pharmacyMeta.current_page
                          ? "default"
                          : "ghost"
                      }
                      size="sm"
                      onClick={() => handlePageChange(pharmacyMeta.last_page)}
                      className={`h-8 w-8 p-0 font-bold ${pharmacyMeta.last_page === pharmacyMeta.current_page ? "bg-indigo-600" : ""}`}
                    >
                      {pharmacyMeta.last_page}
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    pharmacyMeta.current_page === pharmacyMeta.last_page
                  }
                  onClick={() =>
                    handlePageChange(pharmacyMeta.current_page + 1)
                  }
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

      <Dialog open={isSuspendDialogOpen} onOpenChange={setIsSuspendDialogOpen}>
        <DialogContent className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <Ban className="h-5 w-5 text-rose-500" />
              </div>
              Suspend Pharmacy Account?
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
              Are you sure you want to suspend <span className="font-bold text-slate-900 dark:text-white">{selectedPharmacy?.name}</span>? 
              The pharmacy will lose access to all platform features and their fleet management will be frozen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setIsSuspendDialogOpen(false)}
              className="rounded-xl border-2 font-bold h-12"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSuspend}
              className="rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold h-12 shadow-lg shadow-rose-500/20"
              disabled={suspendMutation.isPending}
            >
              {suspendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Suspension
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
