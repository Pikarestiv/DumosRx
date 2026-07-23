import React, { useState } from "react";
import { toast } from "sonner";
import { CameraScannerDialog } from "@/components/pos/camera-scanner-dialog";
import type { Product } from "./types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableInput } from "@/components/ui/searchable-input";
import { ProductCombobox } from "@/components/ui/product-combobox";
import { Button } from "@/components/ui/button";
import { ScanLine, Info, ChevronDown, ChevronUp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface ProductFormFieldsProps {
  formData: Product;
  onInputChange: (field: keyof Product, value: any) => void;
  isPharmacy: boolean;
  isQuickAdd?: boolean;
  suggestions: {
    names: string[];
    generics?: string[];
    categories: string[];
    dosageForms?: string[];
    manufacturers: string[];
    suppliers: string[];
    strengths: string[];
  };
  commonSuggestions: {
    units: string[];
  };
  t: (key: string) => string;
}

export function ProductFormFields({
  formData,
  onInputChange,
  isPharmacy,
  isQuickAdd = false,
  suggestions,
  commonSuggestions,
  t,
}: ProductFormFieldsProps) {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(!isQuickAdd);

  return (
    <div className="flex flex-col gap-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="font-serif font-bold text-lg border-b pb-2">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("product")} Name *</Label>
            <ProductCombobox
              value={formData.name}
              onChange={(option) => {
                onInputChange("name", option.name);
                if (option.source === "local") {
                  onInputChange("genericName", option.generic_name || "");
                  onInputChange("manufacturer", option.manufacturer || "");
                }
              }}
              placeholder={`e.g., ${isPharmacy ? "Panadol Extra" : "Product Name"}`}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="category">
                {isPharmacy && t("category") === "Therapeutic Class"
                  ? "Therapeutic Class / Drug Category"
                  : t("category")}
              </Label>
              {isPharmacy && (
                <TooltipProvider>
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <Info className="w-3 h-3 opacity-50 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>What type of medicine is this? E.g., Pain Relief, Antibiotic, Vitamin.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <SearchableInput
              options={suggestions.categories}
              value={formData.category}
              onValueChange={(val) => onInputChange("category", val)}
              placeholder="Select or type category"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="strength">Strength / Size</Label>
            <SearchableInput
              id="strength"
              value={formData.strength}
              onValueChange={(val) => onInputChange("strength", val)}
              options={
                isPharmacy
                  ? suggestions.strengths
                  : ["Small", "Medium", "Large", "1kg", "500g", "1L", "500ml"]
              }
              placeholder="e.g., 500mg or 1L"
            />
          </div>

          {isPharmacy && (
            <div className="space-y-2">
              <Label htmlFor="dosageForm">Dosage Form</Label>
              <SearchableInput
                options={suggestions.dosageForms || []}
                value={formData.dosageForm}
                onValueChange={(val) => onInputChange("dosageForm", val)}
                placeholder="Select or type dosage form"
              />
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="sellingPrice">Selling Price (₦)</Label>
            <Input
              id="sellingPrice"
              type="number"
              min="0"
              step="0.01"
              value={formData.sellingPrice || ""}
              onChange={(e) => onInputChange("sellingPrice", parseFloat(e.target.value) || 0)}
              placeholder="e.g., 1500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reorderLevel">Reorder Level</Label>
            <Input
              id="reorderLevel"
              type="number"
              min="0"
              value={formData.reorderLevel || ""}
              onChange={(e) => onInputChange("reorderLevel", parseInt(e.target.value) || 0)}
              placeholder="e.g., 10"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="barcode">Barcode (Optional)</Label>
            <div className="flex gap-2">
              <Input
                id="barcode"
                value={formData.barcode}
                onChange={(e) => onInputChange("barcode", e.target.value)}
                placeholder="Scan or type barcode"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => setIsScannerOpen(true)}
                title="Scan Barcode"
              >
                <ScanLine className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Details (Collapsible) */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setIsDetailsOpen(!isDetailsOpen)}
          className="flex items-center justify-between w-full font-serif font-bold text-lg border-b pb-2 text-left hover:text-primary transition-colors focus:outline-none"
        >
          <span>Additional Details (Optional)</span>
          {isDetailsOpen ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </button>
        
        <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4 transition-all overflow-hidden", isDetailsOpen ? "max-h-[1000px] opacity-100 mt-4" : "max-h-0 opacity-0 m-0")}>
          {isPharmacy && (
            <div className="space-y-2">
              <Label htmlFor="genericName">Generic Name</Label>
              <SearchableInput
                id="genericName"
                value={formData.genericName}
                onValueChange={(val) => onInputChange("genericName", val)}
                options={suggestions.generics || []}
                placeholder="e.g., Acetaminophen"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="manufacturer">Manufacturer</Label>
            <SearchableInput
              options={suggestions.manufacturers}
              value={formData.manufacturer}
              onValueChange={(val) => onInputChange("manufacturer", val)}
              placeholder="Select or type manufacturer"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nafdacNumber">{t("registration_number")}</Label>
            <Input
              id="nafdacNumber"
              value={formData.nafdacNumber}
              onChange={(e) => onInputChange("nafdacNumber", e.target.value)}
              placeholder="e.g., 04-1234"
            />
          </div>

          {isPharmacy && (
            <div className="space-y-4 pt-2 md:col-span-2 flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="requiresPrescription" className="flex-1 cursor-pointer">
                  Requires Prescription (Rx)
                </Label>
                <Switch
                  id="requiresPrescription"
                  checked={formData.requiresPrescription}
                  onCheckedChange={(checked) => onInputChange("requiresPrescription", checked)}
                />
              </div>
              <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="isControlled" className="flex-1 cursor-pointer">
                  Controlled Substance
                </Label>
                <Switch
                  id="isControlled"
                  checked={formData.isControlled}
                  onCheckedChange={(checked) => onInputChange("isControlled", checked)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Packaging & Units */}
      <div className="space-y-4">
        <h3 className="font-serif font-bold text-lg border-b pb-2">Packaging & Units</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-accent/5 p-4 rounded-lg border border-accent/10">
          <div className="space-y-2">
            <Label htmlFor="bulkUnit" className="text-xs font-semibold text-primary">
              Bulk Unit
            </Label>
            <SearchableInput
              id="bulkUnit"
              value={formData.bulkUnit || ""}
              onValueChange={(val) => onInputChange("bulkUnit", val)}
              options={["Carton", "Pack", "Box", "Roll"]}
              placeholder="e.g., Carton"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="unitsPerBulk" className="text-xs font-semibold text-muted-foreground">
              Contains how many base units?
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium whitespace-nowrap">1 Bulk =</span>
              <Input
                id="unitsPerBulk"
                type="number"
                min="1"
                value={formData.unitsPerBulk}
                onChange={(e) => onInputChange("unitsPerBulk", parseInt(e.target.value) || 1)}
                className="w-full"
                onFocus={(e) => e.target.select()}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="baseUnit" className="text-xs font-semibold text-primary">
              Base Unit
            </Label>
            <SearchableInput
              id="baseUnit"
              value={formData.baseUnit || ""}
              onValueChange={(val) => onInputChange("baseUnit", val)}
              options={commonSuggestions.units}
              placeholder="e.g., Tablet"
            />
          </div>
        </div>
      </div>

      <CameraScannerDialog 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScanSuccess={(barcode) => {
          onInputChange("barcode", barcode);
          setIsScannerOpen(false);
          toast.success("Barcode scanned successfully");
        }} 
      />
    </div>
  );
}
