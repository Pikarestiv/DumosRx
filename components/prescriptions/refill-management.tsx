"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Calendar, RefreshCw, Clock, CheckCircle, AlertTriangle } from "lucide-react"

interface RefillRequest {
  id: string
  originalPrescription: string
  patientName: string
  patientPhone: string
  medicineName: string
  strength: string
  lastFilled: string
  nextRefillDate: string
  refillsRemaining: number
  totalRefills: number
  status: "due" | "early" | "overdue" | "completed" | "expired"
  doctorName: string
  cost: number
}

const refillsData: RefillRequest[] = [
  {
    id: "1",
    originalPrescription: "RX-2023-145",
    patientName: "John Doe",
    patientPhone: "08012345678",
    medicineName: "Lisinopril",
    strength: "10mg",
    lastFilled: "2024-01-05",
    nextRefillDate: "2024-01-20",
    refillsRemaining: 3,
    totalRefills: 5,
    status: "due",
    doctorName: "Dr. Sarah Johnson",
    cost: 2400,
  },
  {
    id: "2",
    originalPrescription: "RX-2023-167",
    patientName: "Mary Smith",
    patientPhone: "08087654321",
    medicineName: "Metformin",
    strength: "500mg",
    lastFilled: "2024-01-10",
    nextRefillDate: "2024-01-25",
    refillsRemaining: 2,
    totalRefills: 6,
    status: "early",
    doctorName: "Dr. Michael Brown",
    cost: 3600,
  },
  {
    id: "3",
    originalPrescription: "RX-2023-189",
    patientName: "David Wilson",
    patientPhone: "08098765432",
    medicineName: "Amlodipine",
    strength: "5mg",
    lastFilled: "2023-12-15",
    nextRefillDate: "2024-01-15",
    refillsRemaining: 1,
    totalRefills: 3,
    status: "overdue",
    doctorName: "Dr. Emily Davis",
    cost: 1800,
  },
  {
    id: "4",
    originalPrescription: "RX-2023-201",
    patientName: "Sarah Johnson",
    patientPhone: "08076543210",
    medicineName: "Atorvastatin",
    strength: "20mg",
    lastFilled: "2024-01-18",
    nextRefillDate: "2024-02-18",
    refillsRemaining: 0,
    totalRefills: 4,
    status: "completed",
    doctorName: "Dr. James Wilson",
    cost: 4200,
  },
]

export function RefillManagement() {
  const [refills, setRefills] = useState<RefillRequest[]>(refillsData)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const filteredRefills = refills.filter((refill) => {
    const matchesSearch =
      refill.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      refill.originalPrescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
      refill.medicineName.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === "all" || refill.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: RefillRequest["status"]) => {
    const variants = {
      due: "default",
      early: "secondary",
      overdue: "destructive",
      completed: "outline",
      expired: "destructive",
    } as const

    const labels = {
      due: "Due",
      early: "Early",
      overdue: "Overdue",
      completed: "Completed",
      expired: "Expired",
    }

    return (
      <Badge variant={variants[status]} className="text-xs">
        {labels[status]}
      </Badge>
    )
  }

  const getStatusIcon = (status: RefillRequest["status"]) => {
    switch (status) {
      case "due":
        return <Clock className="h-4 w-4 text-blue-600" />
      case "early":
        return <Calendar className="h-4 w-4 text-gray-600" />
      case "overdue":
        return <AlertTriangle className="h-4 w-4 text-red-600" />
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "expired":
        return <AlertTriangle className="h-4 w-4 text-red-600" />
      default:
        return null
    }
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

  const processRefill = (id: string) => {
    setRefills(
      refills.map((refill) => {
        if (refill.id === id) {
          const newRefillsRemaining = refill.refillsRemaining - 1
          const nextRefillDate = new Date()
          nextRefillDate.setDate(nextRefillDate.getDate() + 30) // 30 days from now

          return {
            ...refill,
            lastFilled: new Date().toISOString().split("T")[0],
            nextRefillDate: nextRefillDate.toISOString().split("T")[0],
            refillsRemaining: newRefillsRemaining,
            status: newRefillsRemaining > 0 ? ("early" as const) : ("completed" as const),
          }
        }
        return refill
      }),
    )
  }

  const dueCount = refills.filter((r) => r.status === "due").length
  const overdueCount = refills.filter((r) => r.status === "overdue").length
  const earlyCount = refills.filter((r) => r.status === "early").length
  const completedCount = refills.filter((r) => r.status === "completed").length

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Due for Refill</p>
                <p className="text-2xl font-bold text-blue-600">{dueCount}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Early Requests</p>
                <p className="text-2xl font-bold text-gray-600">{earlyCount}</p>
              </div>
              <Calendar className="h-8 w-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">{completedCount}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">Refill Management</CardTitle>
          <CardDescription>Track and process prescription refills and renewals</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search refills, patients, medicines..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Refill Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="due">Due</SelectItem>
                <SelectItem value="early">Early</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Refills Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">Refill Requests</CardTitle>
          <CardDescription>
            Showing {filteredRefills.length} of {refills.length} refill requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Medication</TableHead>
                  <TableHead>Original Rx</TableHead>
                  <TableHead>Last Filled</TableHead>
                  <TableHead>Next Refill</TableHead>
                  <TableHead>Refills</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRefills.map((refill) => (
                  <TableRow key={refill.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{refill.patientName}</div>
                        <div className="text-sm text-muted-foreground">{refill.patientPhone}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{refill.medicineName}</div>
                        <div className="text-sm text-muted-foreground">{refill.strength}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-1 rounded">{refill.originalPrescription}</code>
                    </TableCell>
                    <TableCell>{formatDate(refill.lastFilled)}</TableCell>
                    <TableCell>{formatDate(refill.nextRefillDate)}</TableCell>
                    <TableCell>
                      <div className="text-center">
                        <span className="font-medium">
                          {refill.refillsRemaining}/{refill.totalRefills}
                        </span>
                        <div className="text-xs text-muted-foreground">remaining</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(refill.status)}
                        {getStatusBadge(refill.status)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{formatCurrency(refill.cost)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {(refill.status === "due" || refill.status === "overdue") && refill.refillsRemaining > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => processRefill(refill.id)}
                            className="flex items-center gap-1"
                          >
                            <RefreshCw className="h-4 w-4" />
                            Fill
                          </Button>
                        )}
                        {refill.status === "early" && (
                          <Button variant="ghost" size="sm" disabled className="text-muted-foreground">
                            Too Early
                          </Button>
                        )}
                        {refill.status === "completed" && (
                          <Button variant="ghost" size="sm" disabled className="text-muted-foreground">
                            Complete
                          </Button>
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
