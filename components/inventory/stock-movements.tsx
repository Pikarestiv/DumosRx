"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Search, Download, ArrowUpCircle, ArrowDownCircle, RotateCcw } from "lucide-react"

interface StockMovement {
  id: string
  date: string
  medicine: string
  type: "in" | "out" | "adjustment"
  quantity: number
  reason: string
  reference: string
  user: string
  supplier?: string
  batchNumber?: string
}

const movementsData: StockMovement[] = [
  {
    id: "1",
    date: "2024-01-20T10:30:00",
    medicine: "Paracetamol 500mg",
    type: "in",
    quantity: 200,
    reason: "Purchase Order",
    reference: "PO-2024-001",
    user: "John Pharmacist",
    supplier: "Emzor Pharmaceuticals",
    batchNumber: "PAR2024001",
  },
  {
    id: "2",
    date: "2024-01-20T14:15:00",
    medicine: "Amoxicillin 250mg",
    type: "out",
    quantity: -10,
    reason: "Sale",
    reference: "SALE-2024-156",
    user: "Mary Sales",
  },
  {
    id: "3",
    date: "2024-01-19T16:45:00",
    medicine: "Vitamin C 1000mg",
    type: "adjustment",
    quantity: -5,
    reason: "Damaged Goods",
    reference: "ADJ-2024-003",
    user: "John Pharmacist",
  },
  {
    id: "4",
    date: "2024-01-19T09:20:00",
    medicine: "Ibuprofen 400mg",
    type: "in",
    quantity: 100,
    reason: "Purchase Order",
    reference: "PO-2024-002",
    user: "John Pharmacist",
    supplier: "GSK Nigeria",
    batchNumber: "IBU2024001",
  },
  {
    id: "5",
    date: "2024-01-18T11:30:00",
    medicine: "Chloroquine 250mg",
    type: "out",
    quantity: -25,
    reason: "Sale",
    reference: "SALE-2024-145",
    user: "Peter Sales",
  },
]

export function StockMovements() {
  const [movements, setMovements] = useState<StockMovement[]>(movementsData)
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [dateFilter, setDateFilter] = useState("all")

  const filteredMovements = movements.filter((movement) => {
    const matchesSearch =
      movement.medicine.toLowerCase().includes(searchTerm.toLowerCase()) ||
      movement.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      movement.reason.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesType = typeFilter === "all" || movement.type === typeFilter

    const matchesDate = dateFilter === "all" || checkDateFilter(movement.date, dateFilter)

    return matchesSearch && matchesType && matchesDate
  })

  function checkDateFilter(date: string, filter: string): boolean {
    const movementDate = new Date(date)
    const now = new Date()
    const daysDiff = Math.floor((now.getTime() - movementDate.getTime()) / (1000 * 60 * 60 * 24))

    switch (filter) {
      case "today":
        return daysDiff === 0
      case "week":
        return daysDiff <= 7
      case "month":
        return daysDiff <= 30
      default:
        return true
    }
  }

  const getMovementIcon = (type: StockMovement["type"]) => {
    switch (type) {
      case "in":
        return <ArrowUpCircle className="h-4 w-4 text-green-600" />
      case "out":
        return <ArrowDownCircle className="h-4 w-4 text-red-600" />
      case "adjustment":
        return <RotateCcw className="h-4 w-4 text-blue-600" />
    }
  }

  const getMovementBadge = (type: StockMovement["type"]) => {
    const variants = {
      in: "default",
      out: "destructive",
      adjustment: "secondary",
    } as const

    const labels = {
      in: "Stock In",
      out: "Stock Out",
      adjustment: "Adjustment",
    }

    return (
      <Badge variant={variants[type]} className="text-xs">
        {labels[type]}
      </Badge>
    )
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

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">Stock Movement History</CardTitle>
          <CardDescription>Track all inventory movements and transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search movements, medicines, references..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Movement Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="in">Stock In</SelectItem>
                <SelectItem value="out">Stock Out</SelectItem>
                <SelectItem value="adjustment">Adjustments</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="flex items-center gap-2 bg-transparent">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Movements Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">Movement Records</CardTitle>
          <CardDescription>
            Showing {filteredMovements.length} of {movements.length} movements
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
                  <TableHead>Reference</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Supplier/Batch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{formatDateTime(movement.date)}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{movement.medicine}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getMovementIcon(movement.type)}
                        {getMovementBadge(movement.type)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div
                        className={`font-medium ${
                          movement.quantity > 0
                            ? "text-green-600"
                            : movement.quantity < 0
                              ? "text-red-600"
                              : "text-blue-600"
                        }`}
                      >
                        {movement.quantity > 0 ? "+" : ""}
                        {movement.quantity}
                      </div>
                    </TableCell>
                    <TableCell>{movement.reason}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{movement.reference}</code>
                    </TableCell>
                    <TableCell>{movement.user}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {movement.supplier && <div className="font-medium">{movement.supplier}</div>}
                        {movement.batchNumber && (
                          <div className="text-muted-foreground">Batch: {movement.batchNumber}</div>
                        )}
                      </div>
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
