"use client";

import { useState, useEffect } from "react";
import {
  getRequestedProducts,
  markRequestedProductAsOrdered,
  deleteRequestedProduct,
  RequestedProduct,
} from "@/lib/db/requested-products-queries";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Check, Copy, Search, Trash2, Clock } from "lucide-react";
import { genericFuzzySearch } from "@/lib/utils/search";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { RequestItemDialog } from "@/components/pos/request-item-dialog";

export function RequestedProductsTab() {
  const [requests, setRequests] = useState<RequestedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
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

  const { results: filteredRequests } = genericFuzzySearch(
    searchQuery,
    requests,
    ["product_name", "requested_by_customer"],
  );

  return (
    <Card className="rounded-[14px] gap-0 border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] flex flex-col flex-1 overflow-hidden">
      <div className="px-4 pb-[18px] border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-[16px] font-bold">Requested Products Log</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Track products requested by customers
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search requested items..."
            className="pl-9 h-9 text-[13px] rounded-[10px] bg-muted border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <RequestItemDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
        />
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
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
            {!loading && filteredRequests.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center h-24 text-muted-foreground"
                >
                  No requested products found.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              filteredRequests.length > 0 &&
              filteredRequests.map((req) => (
                <TableRow
                  key={req.id}
                  className="border-b border-border/50 hover:bg-accent/20 transition-colors group"
                >
                  <TableCell className="font-medium py-[14px] pl-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-primary">
                        {req.product_name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all"
                        onClick={() => copyToClipboard(req.product_name)}
                        title="Copy to clipboard"
                      >
                        <Copy className="h-2 w-2" />
                      </Button>
                    </div>
                    {req.notes && (
                      <div
                        className="text-[11px] text-muted-foreground mt-1 truncate max-w-[200px]"
                        title={req.notes}
                      >
                        Note: {req.notes}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-[13.5px] py-[14px]">
                    {req.requested_by_customer || "Anonymous"}
                  </TableCell>
                  <TableCell className="py-[14px]">
                    <div className="flex flex-col gap-1 items-start">
                      <Badge
                        variant={req.quantity > 5 ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        Qty: {req.quantity || 1}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {req.request_count}{" "}
                        {req.request_count === 1 ? "request" : "requests"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-[14px]">
                    <Badge
                      variant={req.status === "pending" ? "outline" : "default"}
                      className={
                        req.status === "ordered"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-200 shadow-none"
                          : "bg-amber-500/10 text-amber-600 border-amber-200 shadow-none"
                      }
                    >
                      {req.status === "pending" ? "Pending" : "Ordered"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground py-[14px]">
                    {new Date(req.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right py-[14px]">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {req.status === "pending" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMarkAsOrdered(req.id)}
                          title="Mark as ordered"
                          className="h-8 text-xs"
                        >
                          <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
                          Mark Ordered
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(req.id)}
                        title="Delete request"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
