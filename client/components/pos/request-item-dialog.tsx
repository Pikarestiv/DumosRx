"use client";

import { useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardList, Info, Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { logRequestedProduct } from "@/lib/db/requested-products-queries";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { getAllCustomers } from "@/lib/db/queries/customers";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export function RequestItemDialog({ 
  triggerClassName,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: { 
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled && controlledOnOpenChange ? controlledOnOpenChange : setInternalOpen;

  const [productName, setProductName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: getAllCustomers,
    staleTime: 1000 * 60 * 5, // 5 mins
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      toast.error("Product name is required");
      return;
    }

    setLoading(true);
    try {
      await logRequestedProduct(
        productName.trim(), 
        customerName.trim() || undefined,
        parseInt(quantity) || 1,
        notes.trim() || undefined
      );
      toast.success("Request logged successfully");
      setOpen(false);
      setProductName("");
      setCustomerName("");
      setCustomerSearch("");
      setQuantity("1");
      setNotes("");
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
        className={triggerClassName || "cursor-pointer flex items-center gap-1.5 shrink-0 border-blue-500/20 text-blue-600 hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-400"}
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
              <Label htmlFor="name">Product Name <span className="text-destructive">*</span></Label>
              <Input
                id="name"
                placeholder="e.g., Panadol Extra"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                autoFocus
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity Asked For</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  placeholder="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2 flex flex-col">
                <Label htmlFor="customer">Customer (Optional)</Label>
                <Popover open={comboboxOpen} onOpenChange={setComboboxOpen} modal={true}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={comboboxOpen}
                      className="w-full justify-between font-normal bg-transparent border-input shadow-none px-3"
                    >
                      <span className="truncate">{customerName || "Select or type..."}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput 
                        placeholder="Search or add..." 
                        value={customerSearch}
                        onValueChange={setCustomerSearch}
                      />
                      <CommandList>
                        <CommandEmpty className="py-2 px-2">
                          <div
                            className="flex items-center gap-2 cursor-pointer p-2 rounded-sm hover:bg-accent text-sm"
                            onClick={() => {
                              setCustomerName(customerSearch);
                              setComboboxOpen(false);
                            }}
                          >
                            <UserPlus className="h-4 w-4 text-muted-foreground" />
                            <span>Use &quot;{customerSearch}&quot;</span>
                          </div>
                        </CommandEmpty>
                        <CommandGroup>
                          {customers
                            .filter(
                              (c: any) =>
                                c.first_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                                c.last_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                                c.phone.includes(customerSearch)
                            )
                            .slice(0, 10)
                            .map((c: any) => {
                              const fullName = `${c.first_name} ${c.last_name}`.trim();
                              return (
                                <CommandItem
                                  key={c.id}
                                  value={fullName}
                                  onSelect={(currentValue) => {
                                    setCustomerName(currentValue === customerName ? "" : currentValue);
                                    setComboboxOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      customerName === fullName ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col">
                                    <span>{fullName}</span>
                                    {c.phone && <span className="text-[10px] text-muted-foreground">{c.phone}</span>}
                                  </div>
                                </CommandItem>
                              );
                            })}
                          {customerSearch.trim() && 
                            !customers.some((c: any) => `${c.first_name} ${c.last_name}`.trim().toLowerCase() === customerSearch.toLowerCase()) && (
                              <CommandItem
                                value={customerSearch}
                                onSelect={(val) => {
                                  setCustomerName(val);
                                  setComboboxOpen(false);
                                }}
                                className="border-t border-border mt-1 pt-2 pb-2 text-primary font-medium"
                              >
                                <UserPlus className="mr-2 h-4 w-4" />
                                Use &quot;{customerSearch}&quot;
                              </CommandItem>
                            )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Note (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Brand preference, urgency, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none h-16"
              />
            </div>

            <div className="text-[11.5px] text-primary/80 bg-primary/10 border border-primary/20 rounded-[10px] px-3 py-2.5 flex gap-2 items-start mt-2">
              <Info className="w-[15px] h-[15px] shrink-0 mt-0.5" />
              This gets logged for restocking and sent to your manager right away.
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
