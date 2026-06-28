"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, ShoppingCart, Package, Info, Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductCombobox } from "@/components/ui/product-combobox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { query, createPurchaseOrder } from "@/lib/db/local-database";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/context/store-context";

interface CreatePODialogProps {
  onPOCreated: () => void;
}

interface Vendor {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  bulk_unit: string;
  base_unit: string;
  units_per_bulk: number;
  cost_price: number;
}

export function CreatePODialog({ onPOCreated }: CreatePODialogProps) {
  const { t, storeType } = useStore();
  const [open, setOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ProductIcon = storeType === "pharmacy" ? Pill : Package;

  // New item state
  const [currentProductId, setCurrentProductId] = useState("");
  const [currentProductName, setCurrentProductName] = useState("");
  const [currentBulkQty, setCurrentBulkQty] = useState(1);
  const [currentUoM, setCurrentUoM] = useState(1);
  const [currentCost, setCurrentCost] = useState(0);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    try {
      const vendorData = await query<Vendor>(
        "SELECT id, name FROM suppliers WHERE _deleted = 0",
      );
      const productData = await query<Product>(
        "SELECT id, name, bulk_unit, base_unit, units_per_bulk, cost_price FROM products WHERE _deleted = 0",
      );
      setSuppliers(vendorData);
      setProducts(productData);
    } catch (error) {
      console.error("Failed to fetch data for PO:", error);
    }
  };

  const handleAddLineItem = () => {
    if (!currentProductId) {
      if (currentProductName) {
        toast.error("Please add this product to your database first.");
      } else {
        toast.error("Please select a product");
      }
      return;
    }

    const product = products.find((m) => m.id === currentProductId);
    if (!product) return;

    const newItem = {
      product_id: currentProductId,
      product_name: product.name,
      bulk_unit: product.bulk_unit || "Carton",
      bulk_quantity: currentBulkQty,
      units_per_bulk: currentUoM,
      unit_cost: currentCost,
      subtotal: currentBulkQty * currentCost,
    };

    setItems([...items, newItem]);

    // Reset item state
    setCurrentProductId("");
    setCurrentProductName("");
    setCurrentBulkQty(1);
    setCurrentUoM(1);
    setCurrentCost(0);
  };

  const removeLineItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

  const handleSubmit = async () => {
    if (!selectedSupplierId) {
      toast.error("Please select a vendor");
      return;
    }

    if (items.length === 0) {
      toast.error("Add at least one item to the order");
      return;
    }

    setIsSubmitting(true);
    try {
      await createPurchaseOrder(selectedSupplierId, notes, items);
      toast.success("Purchase Order created successfully");
      setOpen(false);
      onPOCreated();
      // Reset form
      setItems([]);
      setSelectedSupplierId("");
      setNotes("");
    } catch (error) {
      console.error("Failed to create PO:", error);
      toast.error("Error creating purchase order");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProductChange = (option: any) => {
    setCurrentProductName(option.name);
    if (option.source === "local" && option.localId) {
      setCurrentProductId(option.localId);
      const product = products.find((m) => m.id === option.localId);
      if (product) {
        setCurrentUoM(product.units_per_bulk || 1);
        setCurrentCost(product.cost_price * (product.units_per_bulk || 1));
      }
    } else {
      setCurrentProductId("");
      setCurrentUoM(1);
      setCurrentCost(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-95">
          <Plus className="w-4 h-4 mr-2" /> New Purchase Order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-accent/20 bg-card/95 backdrop-blur-xl">
        <DialogHeader className="p-6 border-b border-accent/10">
          <DialogTitle className="text-2xl font-serif font-bold">
            Create Purchase Order
          </DialogTitle>
          <DialogDescription>
            Draft a formal request for stock_batch replenishment
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Select Vendor</Label>
              <Select
                value={selectedSupplierId}
                onValueChange={setSelectedSupplierId}
              >
                <SelectTrigger className="bg-muted/30 border-accent/10">
                  <SelectValue placeholder="Choose a supplier..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-accent/20">
                  {suppliers.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <Input
                placeholder="Ref. # or special instructions..."
                className="bg-muted/30 border-accent/10"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <Card className="border-accent/10 bg-accent/5">
            <CardHeader className="py-3 px-4 bg-accent/10 border-b border-accent/10">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-primary" /> Add Items to
                Order
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                    {t("product")}
                  </Label>
                  <ProductCombobox
                    value={currentProductName}
                    onChange={handleProductChange}
                    placeholder="Search product..."
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-3 space-y-2">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                      Qty (Bulk)
                    </Label>
                    <Input
                      type="number"
                      className="bg-card border-accent/10 h-10"
                      value={currentBulkQty}
                      onChange={(e) =>
                        setCurrentBulkQty(Number(e.target.value))
                      }
                    />
                  </div>
                  <div className="md:col-span-3 space-y-2">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                      Conversion
                      <TooltipProvider delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3 h-3 opacity-50 cursor-pointer" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Number of base units inside one bulk unit</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Input
                      type="number"
                      className="bg-card border-accent/10 h-10"
                      value={currentUoM}
                      onChange={(e) => setCurrentUoM(Number(e.target.value))}
                      placeholder="E.g. 20"
                    />
                  </div>
                  <div className="md:col-span-4 space-y-2">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground text-primary">
                      Bulk Cost (
                      {products.find((m) => m.id === currentProductId)
                        ?.bulk_unit || "Unit"}
                      )
                    </Label>
                    <Input
                      type="number"
                      className="bg-card border-accent/10 h-10"
                      value={currentCost}
                      onChange={(e) => setCurrentCost(Number(e.target.value))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Button
                      type="button"
                      onClick={handleAddLineItem}
                      className="w-full h-10 px-0"
                    >
                      <Plus className="w-5 h-5" /> Add
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h3 className="font-bold text-sm border-b border-accent/10 pb-2 flex items-center justify-between">
              Order Details
              <span className="text-primary">{items.length} line items</span>
            </h3>
            {items.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground border-2 border-dashed border-accent/10 rounded-xl">
                No items added to the purchase order yet.
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg border border-accent/10 bg-muted/20 hover:bg-muted/30 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <ProductIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">{item.product_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px] h-4">
                            {item.bulk_quantity} {item.bulk_unit}(s)
                          </Badge>
                          <span className="text-[10px] text-muted-foreground italic">
                            ({item.units_per_bulk} per unit)
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(item.unit_cost)} / bulk
                        </p>
                        <p className="font-bold text-sm">
                          {formatCurrency(item.subtotal)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeLineItem(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-accent/10 bg-accent/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <p className="text-sm text-muted-foreground uppercase font-bold tracking-wider">
              Estimated Total
            </p>
            <p className="text-3xl font-serif font-black text-primary">
              {formatCurrency(totalAmount)}
            </p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 md:flex-none px-8 h-12 text-lg font-bold shadow-xl shadow-primary/20"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Save Purchase Order"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
