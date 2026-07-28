"use client";

import { useState, useEffect } from "react";
import {
  getRequestedProducts,
  markRequestedProductAsOrdered,
  deleteRequestedProduct,
  RequestedProduct,
} from "@/lib/db/requested-products-queries";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Search, PackageSearch } from "lucide-react";
import { genericFuzzySearch } from "@/lib/utils/search";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { RequestItemDialog } from "@/components/pos/request-item-dialog";
import { RequestedProductsStats } from "./requested-products-stats";
import { RequestedProductMobileCard } from "./requested-product-mobile-card";
import { RequestedProductRow } from "./requested-product-row";
import { RequestedProductsStatusFilter } from "./requested-products-status-filter";
import { usePullToRefreshHandler } from "@/lib/context/pull-to-refresh-context";

type RequestStatusFilter = "all" | "pending" | "ordered";

function NoRequestedProductsCard() {
  return (
    <div className="h-24 flex flex-col items-center justify-center gap-2 text-muted-foreground text-[13px]">
      <PackageSearch className="w-6 h-6 opacity-30" />
      No requested products found.
    </div>
  );
}

function NoRequestedProductsRow() {
  return (
    <TableRow>
      <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
        <PackageSearch className="w-6 h-6 mx-auto mb-2 opacity-30" />
        No requested products found.
      </TableCell>
    </TableRow>
  );
}

export function RequestedProductsTab() {
  const [requests, setRequests] = useState<RequestedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (searchParams.get("action") === "add") {
      setShowAddDialog(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("action");
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [searchParams, router, pathname]);

  // Refresh requests if dialog is closed
  useEffect(() => {
    if (!showAddDialog) {
      fetchRequests();
    }
  }, [showAddDialog]);

  useEffect(() => {
    fetchRequests();
  }, []);

  usePullToRefreshHandler(async () => {
    await fetchRequests();
  });

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await getRequestedProducts("all");
      setRequests(data);
    } catch (error) {
      console.error("Failed to fetch requested products:", error);
      toast.error("Could not load requested products");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsOrdered = async (id: string) => {
    try {
      await markRequestedProductAsOrdered(id);
      toast.success("Marked as ordered");
      fetchRequests();
    } catch (error) {
      console.error("Failed to mark as ordered:", error);
      toast.error("An error occurred");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRequestedProduct(id);
      toast.success("Request removed");
      fetchRequests();
    } catch (error) {
      console.error("Failed to delete request:", error);
      toast.error("An error occurred");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const preFilteredRequests = requests.filter((r) => {
    if (statusFilter === "all") return true;
    return r.status === statusFilter;
  });

  const { results: filteredRequests } = genericFuzzySearch(
    searchQuery,
    preFilteredRequests,
    ["product_name", "requested_by_customer"],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <RequestedProductsStats requests={requests} />

      <Card className="rounded-none md:rounded-[14px] gap-0 border-0 md:border md:border-border bg-transparent md:bg-card shadow-none md:shadow-[0_1px_2px_rgba(16,24,40,0.04)] flex flex-col flex-1 overflow-hidden">
        <div className="px-0 md:px-4 pb-4 md:pb-[18px] border-b-0 md:border-b border-border flex flex-col gap-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search requested items..."
              className="pl-9 h-9 text-[13px] rounded-[10px] bg-card md:bg-muted border-border"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <RequestItemDialog
            open={showAddDialog}
            onOpenChange={setShowAddDialog}
          />

          <RequestedProductsStatusFilter
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
          />
        </div>

        <div className="flex-1 overflow-auto">
          {/* Mobile: card list */}
          <div className="md:hidden flex flex-col gap-2 px-0 py-3">
            {loading && (
              <div className="h-24 flex items-center justify-center text-muted-foreground text-[13px]">
                Loading requests...
              </div>
            )}
            {!loading && filteredRequests.length === 0 && <NoRequestedProductsCard />}
            {!loading &&
              filteredRequests.length > 0 &&
              filteredRequests.map((req) => (
                <RequestedProductMobileCard
                  key={req.id}
                  req={req}
                  onMarkAsOrdered={handleMarkAsOrdered}
                  onDelete={handleDelete}
                />
              ))}
          </div>

          {/* Desktop: table */}
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead className="pl-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                  Product Name
                </TableHead>
                <TableHead className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                  Requested By
                </TableHead>
                <TableHead className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                  Quantity / Requests
                </TableHead>
                <TableHead className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                  Status
                </TableHead>
                <TableHead className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                  Date
                </TableHead>
                <TableHead className="text-right pr-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wide h-11 align-middle">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24">
                    Loading requests...
                  </TableCell>
                </TableRow>
              )}
              {!loading && filteredRequests.length === 0 && <NoRequestedProductsRow />}
              {!loading &&
                filteredRequests.length > 0 &&
                filteredRequests.map((req) => (
                  <RequestedProductRow
                    key={req.id}
                    req={req}
                    onMarkAsOrdered={handleMarkAsOrdered}
                    onDelete={handleDelete}
                    onCopy={copyToClipboard}
                  />
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
