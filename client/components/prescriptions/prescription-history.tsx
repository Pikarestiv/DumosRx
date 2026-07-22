"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Download, Eye, FileText } from "lucide-react"
import { usePrescriptionHistory } from "@/lib/hooks/use-prescription-history"
import { Prescription } from "@/lib/hooks/use-prescription-queue"
import { PrescriptionDetailsDialog } from "./prescription-details-dialog"
import { Skeleton } from "@/components/ui/skeleton"

export function PrescriptionHistory() {
  const {
    prescriptions,
    loading,
    searchTerm,
    setSearchTerm,
    filteredPrescriptions,
    isFuzzyFallback,
    selectedPrescription,
    showDetailsDialog,
    setShowDetailsDialog,
    viewPrescriptionDetails
  } = usePrescriptionHistory()

  const [statusFilter, setStatusFilter] = useState("all")
  const [dateFilter, setDateFilter] = useState("all")

  const preFilteredHistory = filteredPrescriptions.filter((record) => {
    // Map completed status to dispensed for the filter UI
    const recordStatus = record.status === "completed" ? "dispensed" : record.status;
    const matchesStatus = statusFilter === "all" || recordStatus === statusFilter
    const matchesDate = dateFilter === "all" || checkDateFilter(record.dateIssued, dateFilter)
    return matchesStatus && matchesDate
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

  const getStatusBadge = (status: Prescription["status"]) => {
    const variants: Record<string, "default" | "outline" | "destructive"> = {
      completed: "default",
      dispensed: "default",
      partially_dispensed: "outline",
      cancelled: "destructive",
    }

    const labels: Record<string, string> = {
      completed: "Dispensed",
      dispensed: "Dispensed",
      partially_dispensed: "Partially Dispensed",
      cancelled: "Cancelled",
    }

    return (
      <Badge variant={variants[status] || "default"} className="text-xs">
        {labels[status] || status}
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

  const totalDispensed = prescriptions.filter((h) => h.status === "dispensed" || h.status === "completed").length
  const totalRevenue = prescriptions
    .filter((h) => h.status === "dispensed" || h.status === "completed" || h.status === "partially_dispensed")
    .reduce((sum, h) => sum + h.totalCost, 0)
  const partiallyDispensed = prescriptions.filter((h) => h.status === "partially_dispensed").length
  const cancelled = prescriptions.filter((h) => h.status === "cancelled").length

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="flex overflow-x-auto sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-[10px] sm:gap-4 pb-4 sm:pb-0 hide-scrollbar snap-x snap-mandatory">
          <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Total Dispensed</p>
                  <p className="text-xl sm:text-2xl font-bold text-green-600">{totalDispensed}</p>
                </div>
                <FileText className="h-8 w-8 text-green-600 shrink-0" />
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-xl sm:text-2xl font-bold text-primary">{formatCurrency(totalRevenue)}</p>
                </div>
                <FileText className="h-8 w-8 text-primary shrink-0" />
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Partially Filled</p>
                  <p className="text-xl sm:text-2xl font-bold text-orange-600">{partiallyDispensed}</p>
                </div>
                <FileText className="h-8 w-8 text-orange-600 shrink-0" />
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-[140px] sm:min-w-0 snap-center shrink-0 border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Cancelled</p>
                  <p className="text-xl sm:text-2xl font-bold text-red-600">{cancelled}</p>
                </div>
                <FileText className="h-8 w-8 text-red-600 shrink-0" />
              </div>
            </CardContent>
          </Card>
        </div>
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
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
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
            Showing {preFilteredHistory.length} of {prescriptions.length} prescription records
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isFuzzyFallback && preFilteredHistory.length > 0 && (
            <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-sm border border-amber-500/20 text-center font-medium rounded-md mb-4">
              Did you mean? (No exact matches found. Showing closest names.)
            </div>
          )}
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
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!!(loading) && (
                                                <TableRow>
                                                  <TableCell colSpan={11} className="text-center py-8">
                                                    <div className="flex flex-col items-center justify-center space-y-3">
                                                      <Skeleton className="h-12 w-full max-w-lg" />
                                                      <Skeleton className="h-12 w-full max-w-lg" />
                                                      <Skeleton className="h-12 w-full max-w-lg" />
                                                    </div>
                                                  </TableCell>
                                                </TableRow>
                                              )}
                              {(!(loading) && preFilteredHistory.length === 0) && (
                                                                              <TableRow>
                                                                                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                                                                                  No matching records found.
                                                                                </TableCell>
                                                                              </TableRow>
                                                                            )}
                              {!(!(loading) && preFilteredHistory.length === 0) && (
                                                                              preFilteredHistory.map((record) => (
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
                                                                                  <TableCell>{formatDateTime(record.dateDispensed || record.dateIssued)}</TableCell>
                                                                                  <TableCell>{getStatusBadge(record.status)}</TableCell>
                                                                                  <TableCell>
                                                                                    <div className="text-center font-medium">{record.medications?.length || 0}</div>
                                                                                  </TableCell>
                                                                                  <TableCell>
                                                                                    <div className="font-medium">{record.totalCost > 0 && formatCurrency(record.totalCost)}
                                                                                          {!(record.totalCost > 0) && "—"}</div>
                                                                                  </TableCell>
                                                                                  <TableCell>
                                                                                    <Button variant="ghost" size="sm" onClick={() => viewPrescriptionDetails(record)}>
                                                                                      <Eye className="h-4 w-4" />
                                                                                    </Button>
                                                                                  </TableCell>
                                                                                </TableRow>
                                                                              ))
                                                                            )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <PrescriptionDetailsDialog
        prescription={selectedPrescription}
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        getPriorityBadge={(priority) => {
          const colors = {
            normal: "text-muted-foreground",
            urgent: "text-orange-600",
            stat: "text-red-600",
          }
          const labels = {
            normal: "Normal",
            urgent: "Urgent",
            stat: "STAT",
          }
          return <span className={`text-xs font-medium ${colors[priority]}`}>{labels[priority]}</span>
        }}
        formatDateTime={formatDateTime}
      />
    </div>
  )
}
