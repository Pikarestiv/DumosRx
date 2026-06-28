"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { parseIIF, ParsedIIF } from "@/lib/utils/iif-parser";
import { insert, query, execute } from "@/lib/db/local-database";
import { Loader2, CheckCircle2 } from "lucide-react";

interface QuickBooksImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileContent: string | null;
  onSuccess: () => void;
}

export function QuickBooksImportDialog({
  open,
  onOpenChange,
  fileContent,
  onSuccess,
}: QuickBooksImportDialogProps) {
  const [parsedData, setParsedData] = useState<ParsedIIF | null>(null);
  const [importProducts, setImportProducts] = useState(true);
  const [importCustomers, setImportCustomers] = useState(true);
  const [duplicateStrategy, setDuplicateStrategy] = useState<"skip" | "overwrite">("skip");
  const [isImporting, setIsImporting] = useState(false);
  const [importComplete, setImportComplete] = useState(false);

  useEffect(() => {
    if (fileContent && open) {
      try {
        const data = parseIIF(fileContent);
        setParsedData(data);
        setImportComplete(false);
      } catch (e) {
        console.error("Failed to parse IIF", e);
        toast.error("Invalid IIF file format");
        onOpenChange(false);
      }
    }
  }, [fileContent, open]);

  const handleImport = async () => {
    if (!parsedData) return;
    setIsImporting(true);
    
    try {
      const now = new Date().toISOString();

      // Import Products
      if (importProducts && parsedData.products.length > 0) {
        const existingProducts = await query<any>("SELECT id, name FROM products");
        const existingNames = new Set(existingProducts.map(m => m.name.toLowerCase()));

        for (const med of parsedData.products) {
          const isDuplicate = existingNames.has(med.name.toLowerCase());
          
          if (isDuplicate) {
            if (duplicateStrategy === "overwrite") {
              const existingMed = existingProducts.find(p => p.name.toLowerCase() === med.name.toLowerCase());
              if (existingMed) {
                await execute(
                  "UPDATE products SET selling_price = ?, updated_at = ? WHERE id = ?",
                  [med.unit_price, now, existingMed.id]
                );

                // Update or insert QB_IMPORT batch
                const existingBatch = await query<any>(
                  "SELECT id FROM stock_batches WHERE product_id = ? AND batch_number = ? AND _deleted = 0",
                  [existingMed.id, "QB_IMPORT"]
                );

                if (existingBatch && existingBatch.length > 0) {
                  await execute(
                    "UPDATE stock_batches SET quantity = ?, selling_price = ?, updated_at = ? WHERE id = ?",
                    [med.stock, med.unit_price, now, existingBatch[0].id]
                  );
                } else if (med.stock > 0) {
                  await insert("stock_batches", {
                    product_id: existingMed.id,
                    batch_number: "QB_IMPORT",
                    quantity: med.stock,
                    cost_price: med.unit_price * 0.8,
                    selling_price: med.unit_price,
                    expiry_date: new Date(Date.now() + 365*2*24*60*60*1000).toISOString().split('T')[0],
                    is_active: 1
                  });
                }
              }
            }
          } else {
            const productId = await insert("products", {
              id: med.id,
              name: med.name,
              generic_name: med.generic_name || "",
              brand_name: med.brand || "",
              strength: med.strength || "",
              selling_price: med.unit_price,
              cost_price: med.unit_price * 0.8,
              barcode: med.barcode || "",
              created_at: now,
              updated_at: now,
              _deleted: 0,
              _synced: 0
            });

            if (med.stock > 0) {
              await insert("stock_batches", {
                product_id: productId,
                batch_number: "QB_IMPORT",
                quantity: med.stock,
                cost_price: med.unit_price * 0.8,
                selling_price: med.unit_price,
                expiry_date: new Date(Date.now() + 365*2*24*60*60*1000).toISOString().split('T')[0],
                is_active: 1
              });
            }
            existingNames.add(med.name.toLowerCase());
          }
        }
      }

      // Import Customers
      if (importCustomers && parsedData.customers.length > 0) {
        const existingCustomers = await query<any>("SELECT first_name, last_name FROM customers");
        const getFullName = (c: any) => `${c.first_name} ${c.last_name}`.toLowerCase();
        const existingNames = new Set(existingCustomers.map(getFullName));

        for (const cust of parsedData.customers) {
          const fullName = getFullName(cust);
          const isDuplicate = existingNames.has(fullName);

          if (isDuplicate) {
             // For customers, if they chose overwrite, maybe we just update phone/balance
             if (duplicateStrategy === "overwrite") {
                await execute(
                  "UPDATE customers SET phone = ?, outstanding_balance = ?, updated_at = ? WHERE LOWER(first_name || ' ' || last_name) = ?",
                  [cust.phone, cust.outstanding_balance, now, fullName]
                );
             }
          } else {
            await insert("customers", {
              id: cust.id,
              first_name: cust.first_name,
              last_name: cust.last_name,
              phone: cust.phone,
              loyalty_points: cust.loyalty_points,
              outstanding_balance: cust.outstanding_balance,
              created_at: now,
              updated_at: now,
              _deleted: 0,
              _synced: 0
            });
            existingNames.add(fullName);
          }
        }
      }

      setImportComplete(true);
      toast.success("Import completed successfully!");
      onSuccess();
    } catch (e) {
      console.error("Import error", e);
      toast.error("An error occurred during import");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setParsedData(null);
      setImportComplete(false);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>QuickBooks Migration (Beta)</DialogTitle>
          <DialogDescription>
            Review the parsed data before importing into your database.
          </DialogDescription>
        </DialogHeader>

        {importComplete ? (
          <div className="py-6 flex flex-col items-center justify-center space-y-4">
             <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-600">
               <CheckCircle2 className="h-6 w-6" />
             </div>
             <p className="text-center font-medium">Import Successful!</p>
          </div>
        ) : !parsedData ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Found Records:</h4>
              <div className="flex items-center space-x-2">
                <Switch 
                  id="import-meds" 
                  checked={importProducts} 
                  onCheckedChange={(c: boolean) => setImportProducts(c)}
                  disabled={parsedData.products.length === 0}
                />
                <Label htmlFor="import-meds" className="font-normal">
                  Products / Stock Batch Items ({parsedData.products.length})
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  id="import-custs" 
                  checked={importCustomers} 
                  onCheckedChange={(c: boolean) => setImportCustomers(c)}
                  disabled={parsedData.customers.length === 0}
                />
                <Label htmlFor="import-custs" className="font-normal">
                  Customers ({parsedData.customers.length})
                </Label>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Duplicate Handling:</h4>
              <Select 
                value={duplicateStrategy} 
                onValueChange={(v: "skip" | "overwrite") => setDuplicateStrategy(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip existing records</SelectItem>
                  <SelectItem value="overwrite">Overwrite prices and stock for existing records</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          {importComplete ? (
             <Button onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isImporting}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={isImporting || (!importProducts && !importCustomers)}>
                {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import Data
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
