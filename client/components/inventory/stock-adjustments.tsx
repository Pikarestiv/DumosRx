"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, RotateCcw, AlertTriangle } from "lucide-react"

interface StockAdjustment {
  id: string
  date: string
  medicine: string
  adjustmentType: "increase" | "decrease"
  quantity: number
  reason: string
  notes: string
  user: string
  approved: boolean
}

const adjustmentsData: StockAdjustment[] = [
  {
    id: "1",
    date: "2024-01-20T14:30:00",
    medicine: "Paracetamol 500mg",
    adjustmentType: "decrease",
    quantity: -5,
    reason: "Damaged Goods",
    notes: "Water damage during storage",
    user: "John Pharmacist",
    approved: true,
  },
  {
    id: "2",
    date: "2024-01-19T10:15:00",
    medicine: "Vitamin C 1000mg",
    adjustmentType: "increase",
    quantity: 10,
    reason: "Found Stock",
    notes: "Found additional stock during audit",
    user: "Mary Manager",
    approved: true,
  },
  {
    id: "3",
    date: "2024-01-18T16:45:00",
    medicine: "Amoxicillin 250mg",
    adjustmentType: "decrease",
    quantity: -3,
    reason: "Expired",
    notes: "Expired medicines removed from shelf",
    user: "Peter Sales",
    approved: false,
  },
]

export function StockAdjustments() {
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>(adjustmentsData)
  const [showAddForm, setShowAddForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [newAdjustment, setNewAdjustment] = useState({
    medicine: "",
    adjustmentType: "decrease" as "increase" | "decrease",
    quantity: 0,
    reason: "",
    notes: "",
  })

  const reasons = [
    "Damaged Goods",
    "Expired",
    "Theft/Loss",
    "Found Stock",
    "Counting Error",
    "Quality Issues",
    "Transfer",
    "Other",
  ]

  const filteredAdjustments = adjustments.filter(
    (adjustment) =>
      adjustment.medicine.toLowerCase().includes(searchTerm.toLowerCase()) ||
      adjustment.reason.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const handleSubmitAdjustment = (e: React.FormEvent) => {
    e.preventDefault()

    if (!newAdjustment.medicine || !newAdjustment.reason || newAdjustment.quantity === 0) {
      alert("Please fill in all required fields")
      return
    }

    const adjustment: StockAdjustment = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      medicine: newAdjustment.medicine,
      adjustmentType: newAdjustment.adjustmentType,
      quantity:
        newAdjustment.adjustmentType === "decrease"
          ? -Math.abs(newAdjustment.quantity)
          : Math.abs(newAdjustment.quantity),
      reason: newAdjustment.reason,
      notes: newAdjustment.notes,
      user: "Current User", // This would come from auth context
      approved: false,
    }

    setAdjustments([adjustment, ...adjustments])
    setNewAdjustment({
      medicine: "",
      adjustmentType: "decrease",
      quantity: 0,
      reason: "",
      notes: "",
    })
    setShowAddForm(false)
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getAdjustmentBadge = (adjustmentType: StockAdjustment["adjustmentType"]) => {
    return (
      <Badge variant={adjustmentType === "increase" ? "default" : "destructive"} className="text-xs">
        {adjustmentType === "increase" ? "Increase" : "Decrease"}
      </Badge>
    )
  }

  const pendingAdjustments = adjustments.filter((adj) => !adj.approved).length
  const totalAdjustments = adjustments.length

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Adjustments</p>
                <p className="text-2xl font-bold">{totalAdjustments}</p>
              </div>
              <RotateCcw className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Approval</p>
                <p className="text-2xl font-bold text-orange-600">{pendingAdjustments}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">
                  {adjustments.filter((adj) => new Date(adj.date).getMonth() === new Date().getMonth()).length}
                </p>
              </div>
              <RotateCcw className="h-8 w-8 text-accent" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Adjustment Form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif font-semibold">New Stock Adjustment</CardTitle>
            <CardDescription>Record inventory adjustments for audit purposes</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitAdjustment} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="medicine">Medicine *</Label>
                  <Input
                    id="medicine"
                    value={newAdjustment.medicine}
                    onChange={(e) => setNewAdjustment((prev) => ({ ...prev, medicine: e.target.value }))}
                    placeholder="Enter medicine name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adjustmentType">Adjustment Type *</Label>
                  <Select
                    value={newAdjustment.adjustmentType}
                    onValueChange={(value: "increase" | "decrease") =>
                      setNewAdjustment((prev) => ({ ...prev, adjustmentType: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="increase">Increase Stock</SelectItem>
                      <SelectItem value="decrease">Decrease Stock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    value={newAdjustment.quantity}
                    onChange={(e) =>
                      setNewAdjustment((prev) => ({ ...prev, quantity: Number.parseInt(e.target.value) || 0 }))
                    }
                    placeholder="0"
                    min="1"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason">Reason *</Label>
                  <Select
                    value={newAdjustment.reason}
                    onValueChange={(value) => setNewAdjustment((prev) => ({ ...prev, reason: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {reasons.map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {reason}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={newAdjustment.notes}
                  onChange={(e) => setNewAdjustment((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes or explanation..."
                  rows={3}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" className="bg-accent hover:bg-accent/90">
                  Submit Adjustment
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Search and Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-serif font-semibold">Stock Adjustments</CardTitle>
              <CardDescription>Track and manage inventory adjustments</CardDescription>
            </div>
            <Button onClick={() => setShowAddForm(true)} className="bg-accent hover:bg-accent/90">
              <Plus className="h-4 w-4 mr-2" />
              New Adjustment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search adjustments, medicines, reasons..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Adjustments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">Adjustment History</CardTitle>
          <CardDescription>
            Showing {filteredAdjustments.length} of {adjustments.length} adjustments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAdjustments.map((adjustment) => (
                  <TableRow key={adjustment.id}>
                    <TableCell>
                      <div className="text-sm">{formatDateTime(adjustment.date)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{adjustment.medicine}</div>
                    </TableCell>
                    <TableCell>{getAdjustmentBadge(adjustment.adjustmentType)}</TableCell>
                    <TableCell>
                      <div className={`font-medium ${adjustment.quantity > 0 ? "text-green-600" : "text-red-600"}`}>
                        {adjustment.quantity > 0 ? "+" : ""}
                        {adjustment.quantity}
                      </div>
                    </TableCell>
                    <TableCell>{adjustment.reason}</TableCell>
                    <TableCell>
                      <div className="max-w-xs truncate text-sm text-muted-foreground">{adjustment.notes || "—"}</div>
                    </TableCell>
                    <TableCell>{adjustment.user}</TableCell>
                    <TableCell>
                      <Badge variant={adjustment.approved ? "default" : "outline"} className="text-xs">
                        {adjustment.approved ? "Approved" : "Pending"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
