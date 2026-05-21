"use client";

import { useEffect, useState } from "react";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  ShieldAlert,
  Plus,
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
import { useAdminPharmacies, useSuspendPharmacyMutation, useImpersonatePharmacyMutation } from "@/lib/api/admin-hooks";
import { useSearchParams, useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/use-debounce";
import { PharmacyTable } from "@/components/admin/pharmacies/pharmacy-table";
import { SuspendPharmacyDialog } from "@/components/admin/pharmacies/pharmacy-dialogs";
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
            <PharmacyTable 
              pharmacyList={pharmacyList}
              isLoading={isLoading}
              handleImpersonate={handleImpersonate}
              handleViewBilling={handleViewBilling}
              setSelectedPharmacy={setSelectedPharmacy}
              setIsSuspendDialogOpen={setIsSuspendDialogOpen}
              router={router}
            />
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

      <SuspendPharmacyDialog
        isOpen={isSuspendDialogOpen}
        onOpenChange={setIsSuspendDialogOpen}
        selectedPharmacy={selectedPharmacy}
        handleSuspend={handleSuspend}
        isPending={suspendMutation.isPending}
      />
    </div>
  );
}
