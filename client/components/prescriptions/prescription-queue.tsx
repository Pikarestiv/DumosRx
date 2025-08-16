"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Clock, CheckCircle, AlertTriangle, Eye, FileText, User, Pill, Phone } from "lucide-react"

interface Prescription {
  id: string
  prescriptionNumber: string
  patientName: string
  patientPhone: string
  patientAge: number
  doctorName: string
  doctorLicense: string
  dateIssued: string
  status: "pending" | "in_progress" | "ready" | "dispensed" | "on_hold"
  priority: "normal" | "urgent" | "stat"
  medications: PrescriptionMedication[]
  insurance?: string
  totalCost: number
  notes?: string
}

interface PrescriptionMedication {
  id: string
  medicineName: string
  strength: string
  dosage: string
  quantity: number
  instructions: string
  available: boolean
  cost: number
}

const prescriptionsData: Prescription[] = [
  {
    id: "1",
    prescriptionNumber: "RX-2024-001",
    patientName: "John Doe",
    patientPhone: "08012345678",
    patientAge: 45,
    doctorName: "Dr. Sarah Johnson",
    doctorLicense: "MD-12345",
    dateIssued: "2024-01-20T09:30:00",
    status: "pending",
    priority: "normal",
    medications: [
      {
        id: "1",
        medicineName: "Amoxicillin",
        strength: "500mg",
        dosage: "3 times daily",
        quantity: 21,
        instructions: "Take with food for 7 days",
        available: true,
        cost: 3780,
      },
      {
        id: "2",
        medicineName: "Paracetamol",
        strength: "500mg",
        dosage: "As needed",
        quantity: 20,
        instructions: "For pain relief, max 4 times daily",
        available: true,
        cost: 1600,
      },
    ],
    insurance: "NHIS",
    totalCost: 5380,
    notes: "Patient has mild penicillin allergy - monitor for reactions",
  },
  {
    id: "2",
    prescriptionNumber: "RX-2024-002",
    patientName: "Mary Smith",
    patientPhone: "08087654321",
    patientAge: 32,
    doctorName: "Dr. Michael Brown",
    doctorLicense: "MD-67890",
    dateIssued: "2024-01-20T11:15:00",
    status: "in_progress",
    priority: "urgent",
    medications: [
      {
        id: "3",
        medicineName: "Insulin Glargine",
        strength: "100 units/ml",
        dosage: "Once daily",
        quantity: 1,
        instructions: "Inject subcutaneously at bedtime",
        available: false,
        cost: 8500,
      },
    ],
    totalCost: 8500,
    notes: "Diabetic patient - requires counseling on injection technique",
  },
  {
    id: "3",
    prescriptionNumber: "RX-2024-003",
    patientName: "David Wilson",
    patientPhone: "08098765432",
    patientAge: 28,
    doctorName: "Dr. Emily Davis",
    doctorLicense: "MD-11111",
    dateIssued: "2024-01-20T14:45:00",
    status: "ready",
    priority: "normal",
    medications: [
      {
        id: "4",
        medicineName: "Lisinopril",
        strength: "10mg",
        dosage: "Once daily",
        quantity: 30,
        instructions: "Take in the morning with water",
        available: true,
        cost: 2400,
      },
    ],
    totalCost: 2400,
  },
]

export function PrescriptionQueue() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(prescriptionsData)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)

  const filteredPrescriptions = prescriptions.filter((prescription) => {
    const matchesSearch =
      prescription.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prescription.prescriptionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prescription.doctorName.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === "all" || prescription.status === statusFilter
    const matchesPriority = priorityFilter === "all" || prescription.priority === priorityFilter

    return matchesSearch && matchesStatus && matchesPriority
  })

  const getStatusBadge = (status: Prescription["status"]) => {
    const variants = {
      pending: "outline",
      in_progress: "secondary",
      ready: "default",
      dispensed: "default",
      on_hold: "destructive",
    } as const

    const labels = {
      pending: "Pending",
      in_progress: "In Progress",
      ready: "Ready",
      dispensed: "Dispensed",
      on_hold: "On Hold",
    }

    return (
      <Badge variant={variants[status]} className="text-xs">
        {labels[status]}
      </Badge>
    )
  }

  const getPriorityBadge = (priority: Prescription["priority"]) => {
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
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount)
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

  const updatePrescriptionStatus = (id: string, newStatus: Prescription["status"]) => {
    setPrescriptions(
      prescriptions.map((prescription) =>
        prescription.id === id ? { ...prescription, status: newStatus } : prescription,
      ),
    )
  }

  const viewPrescriptionDetails = (prescription: Prescription) => {
    setSelectedPrescription(prescription)
    setShowDetailsDialog(true)
  }

  const pendingCount = prescriptions.filter((p) => p.status === "pending").length
  const inProgressCount = prescriptions.filter((p) => p.status === "in_progress").length
  const readyCount = prescriptions.filter((p) => p.status === "ready").length
  const urgentCount = prescriptions.filter((p) => p.priority === "urgent" || p.priority === "stat").length

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-blue-600">{inProgressCount}</p>
              </div>
              <Pill className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ready</p>
                <p className="text-2xl font-bold text-green-600">{readyCount}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Urgent</p>
                <p className="text-2xl font-bold text-red-600">{urgentCount}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">Prescription Queue</CardTitle>
          <CardDescription>Manage and track prescription processing workflow</CardDescription>
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
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="dispensed">Dispensed</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="stat">STAT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Prescriptions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">Active Prescriptions</CardTitle>
          <CardDescription>
            Showing {filteredPrescriptions.length} of {prescriptions.length} prescriptions
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
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Medications</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPrescriptions.map((prescription) => (
                  <TableRow key={prescription.id}>
                    <TableCell>
                      <div>
                        <code className="text-sm bg-muted px-2 py-1 rounded">{prescription.prescriptionNumber}</code>
                        {prescription.insurance && (
                          <div className="text-xs text-muted-foreground mt-1">Insurance: {prescription.insurance}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{prescription.patientName}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {prescription.patientPhone}
                        </div>
                        <div className="text-xs text-muted-foreground">Age: {prescription.patientAge}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{prescription.doctorName}</div>
                        <div className="text-xs text-muted-foreground">{prescription.doctorLicense}</div>
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTime(prescription.dateIssued)}</TableCell>
                    <TableCell>{getPriorityBadge(prescription.priority)}</TableCell>
                    <TableCell>{getStatusBadge(prescription.status)}</TableCell>
                    <TableCell>
                      <div className="text-center">
                        <span className="font-medium">{prescription.medications.length}</span>
                        <div className="text-xs text-muted-foreground">
                          {prescription.medications.some((m) => !m.available) && (
                            <span className="text-red-600">Some unavailable</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{formatCurrency(prescription.totalCost)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => viewPrescriptionDetails(prescription)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {prescription.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updatePrescriptionStatus(prescription.id, "in_progress")}
                          >
                            Start
                          </Button>
                        )}
                        {prescription.status === "in_progress" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updatePrescriptionStatus(prescription.id, "ready")}
                          >
                            Ready
                          </Button>
                        )}
                        {prescription.status === "ready" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updatePrescriptionStatus(prescription.id, "dispensed")}
                          >
                            Dispense
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

      {/* Prescription Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif font-bold">Prescription Details</DialogTitle>
            <DialogDescription>
              {selectedPrescription?.prescriptionNumber} - {selectedPrescription?.patientName}
            </DialogDescription>
          </DialogHeader>

          {selectedPrescription && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Patient Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="font-serif font-semibold flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Patient Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Name</p>
                      <p className="font-medium">{selectedPrescription.patientName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <p className="font-medium">{selectedPrescription.patientPhone}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Age</p>
                      <p className="font-medium">{selectedPrescription.patientAge} years</p>
                    </div>
                    {selectedPrescription.insurance && (
                      <div>
                        <p className="text-sm text-muted-foreground">Insurance</p>
                        <p className="font-medium">{selectedPrescription.insurance}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Doctor Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="font-serif font-semibold flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Prescriber Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Doctor</p>
                      <p className="font-medium">{selectedPrescription.doctorName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">License Number</p>
                      <p className="font-medium">{selectedPrescription.doctorLicense}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Date Issued</p>
                      <p className="font-medium">{formatDateTime(selectedPrescription.dateIssued)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Priority</p>
                      <p className="font-medium">{getPriorityBadge(selectedPrescription.priority)}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Medications */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-serif font-semibold flex items-center gap-2">
                    <Pill className="h-5 w-5" />
                    Prescribed Medications
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {selectedPrescription.medications.map((medication) => (
                      <div key={medication.id} className="p-4 border border-border rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{medication.medicineName}</h4>
                              <Badge variant={medication.available ? "default" : "destructive"} className="text-xs">
                                {medication.available ? "Available" : "Out of Stock"}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              Strength: {medication.strength} • Quantity: {medication.quantity}
                            </p>
                            <p className="text-sm text-muted-foreground">Dosage: {medication.dosage}</p>
                            <p className="text-sm mt-2 p-2 bg-muted rounded text-muted-foreground">
                              Instructions: {medication.instructions}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{formatCurrency(medication.cost)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex justify-between items-center">
                      <span className="font-bold">Total Cost:</span>
                      <span className="font-bold text-lg">{formatCurrency(selectedPrescription.totalCost)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              {selectedPrescription.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="font-serif font-semibold">Clinical Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      {selectedPrescription.notes}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
