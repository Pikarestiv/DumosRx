"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { softDelete } from "@/lib/db/local-database";
import { Button } from "@/components/ui/button";
import { Trash2, Building2, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSupplierList } from "@/lib/hooks/use-suppliers";

export function VendorList() {
  const { vendors, isLoading, refetch: fetchVendors } = useSupplierList();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeleteTargetId(id);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await softDelete("suppliers", deleteTargetId);
      toast.success("Vendor deleted");
      fetchVendors();
    } catch (error) {
      console.error("Failed to delete vendor:", error);
      toast.error("Failed to delete vendor");
    } finally {
      setDeleteTargetId(null);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center">Loading vendors...</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business Name</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Contact Info</TableHead>
                <TableHead>Terms</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Building2 className="h-8 w-8 opacity-20" />
                      <p>No vendors found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                vendors.map((vendor) => (
                  <TableRow key={vendor.id}>
                    <TableCell className="font-medium">
                      {vendor.name}
                    </TableCell>
                    <TableCell>{vendor.contact_person || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                        {vendor.phone && (
                          <div className="flex items-center gap-1 opacity-70">
                            <Phone className="h-3 w-3" /> {vendor.phone}
                          </div>
                        )}
                        {vendor.email && (
                          <div className="flex items-center gap-1 opacity-70">
                            <Mail className="h-3 w-3" /> {vendor.email}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{vendor.payment_terms || "-"}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(vendor.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="Delete Vendor"
        description="Are you sure you want to delete this vendor? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
