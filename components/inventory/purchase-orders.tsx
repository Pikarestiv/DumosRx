"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Eye, Edit, FileText } from "lucide-react"

interface PurchaseOrder {
  id: string
  orderNumber: string
  supplier: string
  orderDate: string
  expectedDate: string
  status: "draft" | "sent" | "confirmed" | "received" | "cancelled"
  totalAmount: number
  itemCount: number
  createdBy: string
}

const purchaseOrdersData: PurchaseOrder[] = [
  {
    id: "1",
    orderNumber: "PO-2024-001",
    supplier: "Emzor Pharmaceuticals",
    orderDate: "2024-01-15",
    expectedDate: "2024-01-22",
    status: "received",
    totalAmount: 450000,
    itemCount: 5,
    createdBy: "John Pharmacist",
  },
  {
    id: "2",
    orderNumber: "PO-2024-002",
    supplier: "GSK Nigeria",
    orderDate: "2024-01-18",
    expectedDate: "2024-01-25",
    status: "confirmed",
    totalAmount: 320000,
    itemCount: 3,
    createdBy: "Mary Manager",
  },
  {
    id: "3",
    orderNumber: "PO-2024-003",
    supplier: "May & Baker Nigeria",
    orderDate: "2024-01-20",
    expectedDate: "2024-01-27",
    status: "sent",
    totalAmount: 180000,
    itemCount: 4,
    createdBy: "John Pharmacist",
  },
  {
    id: "4",
    orderNumber: "PO-2024-004",
    supplier: "Chi Pharmaceuticals",
    orderDate: "2024-01-21",
    expectedDate: "2024-01-28",
    status: "draft",
    totalAmount: 95000,
    itemCount: 2,
    createdBy: "Mary Manager",
  },
]

export function PurchaseOrders() {
  const [orders, setOrders] = useState<PurchaseOrder[]>(purchaseOrdersData)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.supplier.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === "all" || order.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: PurchaseOrder["status"]) => {
    const variants = {
      draft: "secondary",
      sent: "outline",
      confirmed: "default",
      received: "default",
      cancelled: "destructive",
    } as const

    const labels = {
      draft: "Draft",
      sent: "Sent",
      confirmed: "Confirmed",
      received: "Received",
      cancelled: "Cancelled",
    }

    return (
      <Badge variant={variants[status]} className="text-xs">
        {labels[status]}
      </Badge>
    )
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const totalOrderValue = orders.reduce((sum, order) => sum + order.totalAmount, 0)
  const pendingOrders = orders.filter((order) => ["sent", "confirmed"].includes(order.status)).length
  const draftOrders = orders.filter((order) => order.status === "draft").length

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-bold">{orders.length}</p>
              </div>
              <FileText className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Orders</p>
                <p className="text-2xl font-bold text-orange-600">{pendingOrders}</p>
              </div>
              <FileText className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Draft Orders</p>
                <p className="text-2xl font-bold text-muted-foreground">{draftOrders}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold">{formatCurrency(totalOrderValue)}</p>
              </div>
              <FileText className="h-8 w-8 text-accent" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-serif font-semibold">Purchase Orders</CardTitle>
              <CardDescription>Manage supplier orders and deliveries</CardDescription>
            </div>
            <Button className="bg-accent hover:bg-accent/90">
              <Plus className="h-4 w-4 mr-2" />
              New Purchase Order
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders, suppliers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Order Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">Order History</CardTitle>
          <CardDescription>
            Showing {filteredOrders.length} of {orders.length} purchase orders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Expected Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-1 rounded">{order.orderNumber}</code>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{order.supplier}</div>
                    </TableCell>
                    <TableCell>{formatDate(order.orderDate)}</TableCell>
                    <TableCell>{formatDate(order.expectedDate)}</TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell>
                      <div className="text-center">{order.itemCount}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{formatCurrency(order.totalAmount)}</div>
                    </TableCell>
                    <TableCell>{order.createdBy}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
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
