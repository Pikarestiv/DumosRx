"use client";

import { useEffect, useState } from "react";
import {
  Download,
  ShieldAlert,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminPharmacies, useSuspendPharmacyMutation, useUnsuspendPharmacyMutation, useImpersonatePharmacyMutation, useGrantTrialMutation } from "@/lib/api/admin-hooks";
import { useSearchParams, useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/use-debounce";
import { PharmacyTable } from "@/components/admin/pharmacies/pharmacy-table";
import { PharmacyToolbar } from "@/components/admin/pharmacies/pharmacy-toolbar";
import { PharmacyPagination } from "@/components/admin/pharmacies/pharmacy-pagination";
import { SuspendPharmacyDialog } from "@/components/admin/pharmacies/pharmacy-dialogs";
import { GrantTrialDialog } from "@/components/admin/pharmacies/grant-trial-dialog";
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
  const [isTrialDialogOpen, setIsTrialDialogOpen] = useState(false);
  
  const debouncedSearch = useDebounce(search, 500);

  const { data: response, isLoading, error, refetch } = useAdminPharmacies(page, debouncedSearch);
  const suspendMutation = useSuspendPharmacyMutation();
  const unsuspendMutation = useUnsuspendPharmacyMutation();
  const impersonateMutation = useImpersonatePharmacyMutation();
  const grantTrialMutation = useGrantTrialMutation();

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

  const handleSuspend = async (reason: string) => {
    if (!selectedPharmacy) return;
    
    suspendMutation.mutate({ id: selectedPharmacy.id, reason }, {
      onSuccess: () => {
        toast.success("Account Suspended", {
          description: `${selectedPharmacy.name} has been suspended successfully.`,
        });
        setIsSuspendDialogOpen(false);
        setSelectedPharmacy(null);
        refetch();
      },
      onError: (err: any) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to suspend pharmacy.",
        });
      }
    });
  };

  const handleUnsuspend = async (pharmacy: any) => {
    unsuspendMutation.mutate(pharmacy.id, {
      onSuccess: () => {
        toast.success("Account Re-activated", {
          description: `${pharmacy.name} has been re-activated successfully.`,
        });
        refetch();
      },
      onError: (err: any) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to unsuspend pharmacy.",
        });
      }
    });
  };

  const handleGrantTrial = async (plan: string, duration: string) => {
    if (!selectedPharmacy) return;

    grantTrialMutation.mutate({ id: selectedPharmacy.id, plan, duration }, {
      onSuccess: () => {
        toast.success("Trial Granted", {
          description: `Granted ${duration} ${plan} trial to ${selectedPharmacy.name}.`,
        });
        setIsTrialDialogOpen(false);
        setSelectedPharmacy(null);
        refetch();
      },
      onError: (err: any) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to grant trial.",
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
          <PharmacyToolbar
            search={search}
            onSearchChange={setSearch}
            isLoading={isLoading}
            totalShown={pharmacyList.length}
            totalCount={pharmacyMeta?.total || 0}
          />

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
              setIsTrialDialogOpen={setIsTrialDialogOpen}
              handleUnsuspend={handleUnsuspend}
              router={router}
            />
            )}
          </div>

          {pharmacyMeta && (
            <PharmacyPagination
              meta={pharmacyMeta}
              onPageChange={handlePageChange}
            />
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

      <GrantTrialDialog
        open={isTrialDialogOpen}
        onOpenChange={setIsTrialDialogOpen}
        pharmacy={selectedPharmacy}
        onConfirm={handleGrantTrial}
        isPending={grantTrialMutation.isPending}
      />
    </div>
  );
}
