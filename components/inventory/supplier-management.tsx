"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Phone, Mail, MapPin, Edit, Eye } from "lucide-react"

interface Supplier {
  id: string
  name: string
  contactPerson: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  status: "active" | "inactive"
  totalOrders: number
  totalValue: number
  lastOrderDate: string
  paymentTerms: string
  rating: number
}

const suppliersData: Supplier[] = [
  {
    id: "1",
    name: "Emzor Pharmaceuticals",
    contactPerson: "Dr. Adebayo Johnson",
    email: "orders@emzor.com.ng",
    phone: "+234-1-234-5678",
    address: "3-5 Adeyemo Alakija Street",
    city: "Lagos",
    state: "Lagos",
    status: "active",
    totalOrders: 45,
    totalValue: 2500000,
    lastOrderDate: "2024-01-15",
    paymentTerms: "30 days",
    rating: 4.8,
  },
  {
    id: "2",
    name: "GSK Nigeria",
    contactPerson: "Mrs. Funmi Adebayo",
    email: "sales@gsk.com.ng",
    phone: "+234-1-345-6789",
    address: "1 Keystone Bank Crescent",
    city: "Lagos",
    state: "Lagos",
    status: "active",
    totalOrders: 32,
    totalValue: 1800000,
    lastOrderDate: "2024-01-18",
    paymentTerms: "45 days",
    rating: 4.6,
  },
  {
    id: "3",
    name: "May & Baker Nigeria",
    contactPerson: "Mr. Chidi Okafor",
    email: "info@maybaker.com.ng",
    phone: "+234-1-456-7890",
    address: "3/5 Sapara Williams Street",
    city: "Lagos",
    state: "Lagos",
    status: "active",
    totalOrders: 28,
    totalValue: 1200000,
    lastOrderDate: "2024-01-20",
    paymentTerms: "30 days",
    rating: 4.4,
  },
  {
    id: "4",
    name: "Chi Pharmaceuticals",
    contactPerson: "Dr. Ngozi Okwu",
    email: "orders@chi-pharma.com.ng",
    phone: "+234-1-567-8901",
    address: "Plot 1 Industrial Estate",
    city: "Abuja",
    state: "FCT",
    status: "inactive",
    totalOrders: 15,
    totalValue: 650000,
    lastOrderDate: "2023-12-10",
    paymentTerms: "60 days",
    rating: 4.2,
  },
]

export function SupplierManagement() {
  const [suppliers, setSuppliers] = useState<Supplier[]>(suppliersData)
  const [searchTerm, setSearchTerm] = useState("")

  const filteredSuppliers = suppliers.filter(
    (supplier) =>
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.city.toLowerCase().includes(searchTerm.toLowerCase()),
  )

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

  const getStatusBadge = (status: Supplier["status"]) => {
    return (
      <Badge variant={status === "active" ? "default" : "secondary"} className="text-xs">
        {status === "active" ? "Active" : "Inactive"}
      </Badge>
    )
  }

  const getRatingStars = (rating: number) => {
    return "★".repeat(Math.floor(rating)) + "☆".repeat(5 - Math.floor(rating))
  }

  const activeSuppliers = suppliers.filter((s) => s.status === "active").length
  const totalSupplierValue = suppliers.reduce((sum, supplier) => sum + supplier.totalValue, 0)

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Suppliers</p>
                <p className="text-2xl font-bold">{suppliers.length}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-lg font-semibold text-primary">{activeSuppliers}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Purchase Value</p>
                <p className="text-2xl font-bold">{formatCurrency(totalSupplierValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Average Rating</p>
                <p className="text-2xl font-bold">
                  {(suppliers.reduce((sum, s) => sum + s.rating, 0) / suppliers.length).toFixed(1)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Stars</p>
                <p className="text-lg">
                  {getRatingStars(suppliers.reduce((sum, s) => sum + s.rating, 0) / suppliers.length)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-serif font-semibold">Supplier Management</CardTitle>
              <CardDescription>Manage your pharmaceutical suppliers and vendors</CardDescription>
            </div>
            <Button className="bg-accent hover:bg-accent/90">
              <Plus className="h-4 w-4 mr-2" />
              Add Supplier
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search suppliers, contacts, locations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suppliers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">Supplier Directory</CardTitle>
          <CardDescription>
            Showing {filteredSuppliers.length} of {suppliers.length} suppliers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier Details</TableHead>
                  <TableHead>Contact Information</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Last Order</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{supplier.name}</div>
                        <div className="text-sm text-muted-foreground">{supplier.contactPerson}</div>
                        <div className="text-xs text-muted-foreground">Terms: {supplier.paymentTerms}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="h-3 w-3" />
                          <span className="text-xs">{supplier.email}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="h-3 w-3" />
                          <span className="text-xs">{supplier.phone}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-start gap-1">
                        <MapPin className="h-3 w-3 mt-0.5" />
                        <div className="text-sm">
                          <div>{supplier.city}</div>
                          <div className="text-xs text-muted-foreground">{supplier.state}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(supplier.status)}</TableCell>
                    <TableCell>
                      <div className="text-center font-medium">{supplier.totalOrders}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{formatCurrency(supplier.totalValue)}</div>
                    </TableCell>
                    <TableCell>{formatDate(supplier.lastOrderDate)}</TableCell>
                    <TableCell>
                      <div className="text-center">
                        <div className="font-medium">{supplier.rating}</div>
                        <div className="text-xs text-yellow-600">{getRatingStars(supplier.rating)}</div>
                      </div>
                    </TableCell>
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
