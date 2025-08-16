"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Medicine {
  name: string
  genericName: string
  brand: string
  category: string
  nafdacNumber: string
  strength: string
  dosageForm: string
  manufacturer: string
  supplier: string
  costPrice: number
  sellingPrice: number
  stockQuantity: number
  reorderLevel: number
  expiryDate: string
  batchNumber: string
  status: "active" | "inactive" | "expired" | "low_stock"
}

interface AddMedicineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddMedicine: (medicine: Medicine) => void
}

export function AddMedicineDialog({ open, onOpenChange, onAddMedicine }: AddMedicineDialogProps) {
  const [formData, setFormData] = useState<Medicine>({
    name: "",
    genericName: "",
    brand: "",
    category: "",
    nafdacNumber: "",
    strength: "",
    dosageForm: "",
    manufacturer: "",
    supplier: "",
    costPrice: 0,
    sellingPrice: 0,
    stockQuantity: 0,
    reorderLevel: 0,
    expiryDate: "",
    batchNumber: "",
    status: "active",
  })

  const categories = ["Analgesics", "Antibiotics", "Antimalarials", "Vitamins", "Antacids", "Antihypertensives"]
  const dosageForms = ["Tablet", "Capsule", "Syrup", "Injection", "Cream", "Drops", "Inhaler"]
  const manufacturers = [
    "GSK Nigeria",
    "Pfizer Nigeria",
    "Sanofi Nigeria",
    "Emzor Pharmaceuticals",
    "May & Baker Nigeria",
    "Chi Pharmaceuticals",
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Basic validation
    if (!formData.name || !formData.genericName || !formData.nafdacNumber) {
      alert("Please fill in all required fields")
      return
    }

    // Determine status based on stock and expiry
    let status: Medicine["status"] = "active"
    if (formData.stockQuantity <= formData.reorderLevel) {
      status = "low_stock"
    }
    if (new Date(formData.expiryDate) < new Date()) {
      status = "expired"
    }

    onAddMedicine({ ...formData, status })

    // Reset form
    setFormData({
      name: "",
      genericName: "",
      brand: "",
      category: "",
      nafdacNumber: "",
      strength: "",
      dosageForm: "",
      manufacturer: "",
      supplier: "",
      costPrice: 0,
      sellingPrice: 0,
      stockQuantity: 0,
      reorderLevel: 0,
      expiryDate: "",
      batchNumber: "",
      status: "active",
    })
  }

  const handleInputChange = (field: keyof Medicine, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif font-bold">Add New Medicine</DialogTitle>
          <DialogDescription>
            Enter the details for the new medicine. All fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Medicine Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="e.g., Paracetamol"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="genericName">Generic Name *</Label>
              <Input
                id="genericName"
                value={formData.genericName}
                onChange={(e) => handleInputChange("genericName", e.target.value)}
                placeholder="e.g., Acetaminophen"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand">Brand Name</Label>
              <Input
                id="brand"
                value={formData.brand}
                onChange={(e) => handleInputChange("brand", e.target.value)}
                placeholder="e.g., Panadol"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={formData.category} onValueChange={(value) => handleInputChange("category", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nafdacNumber">NAFDAC Number *</Label>
              <Input
                id="nafdacNumber"
                value={formData.nafdacNumber}
                onChange={(e) => handleInputChange("nafdacNumber", e.target.value)}
                placeholder="e.g., 04-1234"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="strength">Strength</Label>
              <Input
                id="strength"
                value={formData.strength}
                onChange={(e) => handleInputChange("strength", e.target.value)}
                placeholder="e.g., 500mg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dosageForm">Dosage Form</Label>
              <Select value={formData.dosageForm} onValueChange={(value) => handleInputChange("dosageForm", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select dosage form" />
                </SelectTrigger>
                <SelectContent>
                  {dosageForms.map((form) => (
                    <SelectItem key={form} value={form}>
                      {form}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Select value={formData.manufacturer} onValueChange={(value) => handleInputChange("manufacturer", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select manufacturer" />
                </SelectTrigger>
                <SelectContent>
                  {manufacturers.map((manufacturer) => (
                    <SelectItem key={manufacturer} value={manufacturer}>
                      {manufacturer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier">Supplier</Label>
              <Input
                id="supplier"
                value={formData.supplier}
                onChange={(e) => handleInputChange("supplier", e.target.value)}
                placeholder="Supplier name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="costPrice">Cost Price (₦)</Label>
              <Input
                id="costPrice"
                type="number"
                value={formData.costPrice}
                onChange={(e) => handleInputChange("costPrice", Number.parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sellingPrice">Selling Price (₦)</Label>
              <Input
                id="sellingPrice"
                type="number"
                value={formData.sellingPrice}
                onChange={(e) => handleInputChange("sellingPrice", Number.parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stockQuantity">Stock Quantity</Label>
              <Input
                id="stockQuantity"
                type="number"
                value={formData.stockQuantity}
                onChange={(e) => handleInputChange("stockQuantity", Number.parseInt(e.target.value) || 0)}
                placeholder="0"
                min="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reorderLevel">Reorder Level</Label>
              <Input
                id="reorderLevel"
                type="number"
                value={formData.reorderLevel}
                onChange={(e) => handleInputChange("reorderLevel", Number.parseInt(e.target.value) || 0)}
                placeholder="0"
                min="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiryDate">Expiry Date</Label>
              <Input
                id="expiryDate"
                type="date"
                value={formData.expiryDate}
                onChange={(e) => handleInputChange("expiryDate", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="batchNumber">Batch Number</Label>
              <Input
                id="batchNumber"
                value={formData.batchNumber}
                onChange={(e) => handleInputChange("batchNumber", e.target.value)}
                placeholder="e.g., PAR2024001"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-accent hover:bg-accent/90">
              Add Medicine
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
