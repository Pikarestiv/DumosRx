"use client";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { VendorList } from "@/components/vendors/vendor-list";
import { AddVendorDialog } from "@/components/vendors/add-vendor-dialog";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Users } from "lucide-react";

export default function VendorsPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
            <p className="text-muted-foreground">
              Manage your suppliers and procurement contacts
            </p>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Vendor
          </Button>
        </div>

        <VendorList key={isAddDialogOpen ? "open" : "closed"} />

        <AddVendorDialog 
          open={isAddDialogOpen} 
          onOpenChange={setIsAddDialogOpen} 
        />
      </div>
    </DashboardLayout>
  );
}
