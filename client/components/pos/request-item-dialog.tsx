"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="cursor-pointer flex items-center gap-1.5 shrink-0 border-blue-500/20 text-blue-600 hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-400">
          <ClipboardList className="h-4 w-4" />
          Request Item
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Log Missing Product</DialogTitle>
          </DialogHeader>
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
