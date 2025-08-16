"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Download, Eye, FileText } from "lucide-react"

interface PrescriptionHistory {
  id: string
  prescriptionNumber: string
  patientName: string
  patientPhone: string
  doctorName: string
  dateIssued: string
  dateDispensed: string
  status: "dispensed" | "partially_dispensed" | "cancelled"
  medicationCount: number
  totalCost: number
  pharmacist: string
  paymentMethod: string
}

const historyData: PrescriptionHistory[] = [
  {
    id: "1",
    prescriptionNumber: "RX-2024-001",
    patientName: "John Doe",
    patientPhone: "08012345678",
    doctorName: "Dr. Sarah Johnson",
    dateIssued: "2024-01-20T09:30:00",
    dateDispensed: "2024-01-20T14:15:00",
    status: "dispensed",
    medicationCount: 2,
    totalCost: 5380,
    pharmacist: "Mary Pharmacist",
    paymentMethod: "Cash",
  },
  {
    id: "2",
    prescriptionNumber: "RX-2024-002",
    patientName: "Mary Smith",
    patientPhone: "08087654321",
    doctorName: "Dr. Michael Brown",
    dateIssued: "2024-01-19T11:15:00",
    dateDispensed: "2024-01-19T16:30:00",
    status: "partially_dispensed",
    medicationCount: 1,
    totalCost: 4250,
    pharmacist: "John Pharmacist",
    paymentMethod: "Card",
  },
  {
    id: "3",
    prescriptionNumber: "RX-2024-003",
    patientName: "David Wilson",
    patientPhone: "08098765432",
    doctorName: "Dr. Emily Davis",
    dateIssued: "2024-01-18T14:45:00",
    dateDispensed: "2024-01-18T15:20:00",
    status: "dispensed",
    medicationCount: 1,
    totalCost: 2400,
    pharmacist: "Sarah Pharmacist",
    paymentMethod: "Mobile",
  },
  {
    id: "4",
    prescriptionNumber: "RX-2024-004",
    patientName: "Jane Brown",
    patientPhone: "08076543210",
    doctorName: "Dr. James Wilson",
    dateIssued: "2024-01-17T10:20:00",
    dateDispensed: "",
    status: "cancelled",
    medicationCount: 3,
    totalCost: 0,
    pharmacist: "",
    paymentMethod: "",
  },
  {
    id: "5",
    prescriptionNumber: "RX-2024-005",
    patientName: "Robert Taylor",
    patientPhone: "08065432109",
    doctorName: "Dr. Lisa Anderson",
    dateIssued: "2024-01-16T13:10:00",
    dateDispensed: "2024-01-16T17:45:00",
    status: "dispensed",
    medicationCount: 4,
    totalCost: 7850,
    pharmacist: "Peter Pharmacist",
    paymentMethod: "Insurance",
  },
]

export function PrescriptionHistory() {
  const [history, setHistory] = useState<PrescriptionHistory[]>(historyData)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [dateFilter, setDateFilter] = useState("all")

  const filteredHistory = history.filter((record) => {
    const matchesSearch =
      record.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.prescriptionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.doctorName.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === "all" || record.status === statusFilter

    const matchesDate = dateFilter === "all" || checkDateFilter(record.dateIssued, dateFilter)

    return matchesSearch && matchesStatus && matchesDate
  })

  function checkDateFilter(date: string, filter: string): boolean {
    const recordDate = new Date(date)
    const now = new Date()
    const daysDiff = Math.floor((now.getTime() - recordDate.getTime()) / (1000 * 60 * 60 * 24))

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

  const getStatusBadge = (status: PrescriptionHistory["status"]) => {
    const variants = {
      dispensed: "default",
      partially_dispensed: "outline",
      cancelled: "destructive",
    } as const

    const labels = {
      dispensed: "Dispensed",
      partially_dispensed: "Partially Dispensed",
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

  const formatDateTime = (dateString: string) => {
    if (!dateString) return "—"
    return new Date(dateString).toLocaleString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const totalDispensed = history.filter((h) => h.status === "dispensed").length
  const totalRevenue = history
    .filter((h) => h.status === "dispensed" || h.status === "partially_dispensed")
    .reduce((sum, h) => sum + h.totalCost, 0)
  const partiallyDispensed = history.filter((h) => h.status === "partially_dispensed").length
  const cancelled = history.filter((h) => h.status === "cancelled").length

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Dispensed</p>
                <p className="text-2xl font-bold text-green-600">{totalDispensed}</p>
              </div>
              <FileText className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(totalRevenue)}</p>
              </div>
              <FileText className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Partially Filled</p>
                <p className="text-2xl font-bold text-orange-600">{partiallyDispensed}</p>
              </div>
              <FileText className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Cancelled</p>
                <p className="text-2xl font-bold text-red-600">{cancelled}</p>
              </div>
              <FileText className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">Prescription History</CardTitle>
          <CardDescription>View and analyze completed prescription transactions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search prescriptions, patients, doctors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="dispensed">Dispensed</SelectItem>
                <SelectItem value="partially_dispensed">Partially Dispensed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
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

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">Transaction Records</CardTitle>
          <CardDescription>
            Showing {filteredHistory.length} of {history.length} prescription records
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prescription</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Date Issued</TableHead>
                  <TableHead>Date Dispensed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Medications</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Pharmacist</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-1 rounded">{record.prescriptionNumber}</code>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{record.patientName}</div>
                        <div className="text-sm text-muted-foreground">{record.patientPhone}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{record.doctorName}</div>
                    </TableCell>
                    <TableCell>{formatDateTime(record.dateIssued)}</TableCell>
                    <TableCell>{formatDateTime(record.dateDispensed)}</TableCell>
                    <TableCell>{getStatusBadge(record.status)}</TableCell>
                    <TableCell>
                      <div className="text-center font-medium">{record.medicationCount}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{record.totalCost > 0 ? formatCurrency(record.totalCost) : "—"}</div>
                    </TableCell>
                    <TableCell>{record.pharmacist || "—"}</TableCell>
                    <TableCell>{record.paymentMethod || "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
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
