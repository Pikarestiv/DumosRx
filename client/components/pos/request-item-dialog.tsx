"use client";

import { useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClipboardList } from "lucide-react";
import { logRequestedProduct } from "@/lib/db/requested-products-queries";
import { toast } from "sonner";

export function RequestItemDialog() {
  const [open, setOpen] = useState(false);
  const [productName, setProductName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      toast.error("Product name is required");
      return;
    }

    setLoading(true);
    try {
      await logRequestedProduct(productName.trim(), customerName.trim() || undefined);
      toast.success("Request logged successfully");
      setOpen(false);
      setProductName("");
      setCustomerName("");
    } catch (error) {
      console.error("Failed to log request:", error);
      toast.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => setOpen(true)}
        className="cursor-pointer flex items-center gap-1.5 shrink-0 border-blue-500/20 text-blue-600 hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-400"
      >
        <ClipboardList className="h-4 w-4" />
        Request Item
      </Button>

      <ResponsiveModal 
        open={open} 
        onOpenChange={setOpen}
        title="Log Missing Product"
        className="sm:max-w-[425px]"
      >
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Panadol Extra"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer">Requested By (Optional)</Label>
              <Input
                id="customer"
                placeholder="Customer name or number"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading} className="mt-2 sm:mt-0">
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Request"}
            </Button>
          </div>
        </form>
      </ResponsiveModal>
    </>
  );
}
