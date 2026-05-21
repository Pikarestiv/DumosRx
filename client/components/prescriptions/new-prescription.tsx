/* eslint-disable max-lines */
"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, User, FileText, Pill, Save } from "lucide-react"

interface PrescriptionMedication {
  id: string
  medicineName: string
  strength: string
  dosage: string
  quantity: number
  instructions: string
  cost: number
}

interface NewPrescriptionForm {
  patientName: string
  patientPhone: string
  patientAge: string
  doctorName: string
  doctorLicense: string
  priority: "normal" | "urgent" | "stat"
  insurance: string
  medications: PrescriptionMedication[]
  notes: string
}

import { useLocalData } from "@/lib/db/hooks/useLocalData"
import { createPrescription, generateId } from "@/lib/db/local-database"
import { toast } from "sonner"

export function NewPrescription() {
  // Fetch available medicines from local inventory
  const { data: inventoryData, loading: _inventoryLoading } = useLocalData<any>(
    `SELECT i.*, m.name as medicine_name, m.strength as m_strength
     FROM inventory i 
     JOIN medicines m ON i.medicine_id = m.id 
     WHERE i._deleted = 0 AND i.quantity > 0`
  );

  const availableMedicines = (inventoryData || []).map(item => ({
    name: item.medicine_name,
    strength: item.m_strength || item.strength || "",
    cost: item.selling_price || 0,
    inventory_id: item.id
  }));
  const [formData, setFormData] = useState<NewPrescriptionForm>({
    patientName: "",
    patientPhone: "",
    patientAge: "",
    doctorName: "",
    doctorLicense: "",
    priority: "normal",
    insurance: "",
    medications: [],
    notes: "",
  })

  const [newMedication, setNewMedication] = useState({
    medicineName: "",
    strength: "",
    dosage: "",
    quantity: 1,
    instructions: "",
  })

  const addMedication = () => {
    if (!newMedication.medicineName || !newMedication.dosage || !newMedication.instructions) {
      toast.error("Please fill in all medication fields")
      return
    }

    const medicine = availableMedicines.find(
      (m) => m.name === newMedication.medicineName && m.strength === newMedication.strength,
    )

    if (!medicine) {
      toast.error("Selected medicine not found")
      return
    }

    const medication: PrescriptionMedication = {
      id: generateId(),
      medicineName: newMedication.medicineName,
      strength: newMedication.strength,
      dosage: newMedication.dosage,
      quantity: newMedication.quantity,
      instructions: newMedication.instructions,
      cost: medicine.cost * newMedication.quantity,
    }

    setFormData((prev) => ({
      ...prev,
      medications: [...prev.medications, medication],
    }))

    setNewMedication({
      medicineName: "",
      strength: "",
      dosage: "",
      quantity: 1,
      instructions: "",
    })
  }

  const removeMedication = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      medications: prev.medications.filter((med) => med.id !== id),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (
      !formData.patientName ||
      !formData.patientPhone ||
      !formData.doctorName ||
      !formData.doctorLicense ||
      formData.medications.length === 0
    ) {
      toast.error("Please fill in all required fields and add at least one medication")
      return
    }

    try {
      // Generate prescription
      const prescriptionId = generateId()
      const now = new Date().toISOString()
      
      const prescriptionData = {
        id: prescriptionId,
        prescription_number: `RX-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`,
        patient_name: formData.patientName,
        patient_phone: formData.patientPhone,
        patient_age: parseInt(formData.patientAge) || 0,
        doctor_name: formData.doctorName,
        doctor_license: formData.doctorLicense,
        priority: formData.priority,
        insurance: formData.insurance,
        notes: formData.notes,
        status: "pending",
        total_cost: formData.medications.reduce((sum, med) => sum + med.cost, 0),
        issued_at: now,
        created_at: now,
        updated_at: now,
      }

      const prescriptionItems = formData.medications.map(med => ({
        id: generateId(),
        medicine_name: med.medicineName,
        strength: med.strength,
        dosage: med.dosage,
        quantity: med.quantity,
        instructions: med.instructions,
        cost: med.cost,
        created_at: now,
        updated_at: now,
      }))

      await createPrescription(prescriptionData, prescriptionItems)
      
      toast.success("Prescription created successfully!")

      // Reset form
      setFormData({
        patientName: "",
        patientPhone: "",
        patientAge: "",
        doctorName: "",
        doctorLicense: "",
        priority: "normal",
        insurance: "",
        medications: [],
        notes: "",
      })
    } catch (err) {
      console.error("Failed to create prescription", err)
      toast.error("Failed to save prescription")
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const totalCost = formData.medications.reduce((sum, med) => sum + med.cost, 0)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-bold">Create New Prescription</CardTitle>
          <CardDescription>Enter prescription details and medications for processing</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Patient Information */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif font-semibold flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Patient Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="patientName">Patient Name *</Label>
                    <Input
                      id="patientName"
                      value={formData.patientName}
                      onChange={(e) => setFormData((prev) => ({ ...prev, patientName: e.target.value }))}
                      placeholder="Enter patient name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patientPhone">Phone Number *</Label>
                    <Input
                      id="patientPhone"
                      value={formData.patientPhone}
                      onChange={(e) => setFormData((prev) => ({ ...prev, patientPhone: e.target.value }))}
                      placeholder="08012345678"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patientAge">Age</Label>
                    <Input
                      id="patientAge"
                      type="number"
                      value={formData.patientAge}
                      onChange={(e) => setFormData((prev) => ({ ...prev, patientAge: e.target.value }))}
                      placeholder="Age"
                      min="0"
                      max="120"
                    />
                  </div>
                </div>
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
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="doctorName">Doctor Name *</Label>
                    <Input
                      id="doctorName"
                      value={formData.doctorName}
                      onChange={(e) => setFormData((prev) => ({ ...prev, doctorName: e.target.value }))}
                      placeholder="Dr. John Smith"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doctorLicense">License Number *</Label>
                    <Input
                      id="doctorLicense"
                      value={formData.doctorLicense}
                      onChange={(e) => setFormData((prev) => ({ ...prev, doctorLicense: e.target.value }))}
                      placeholder="MD-12345"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value: "normal" | "urgent" | "stat") =>
                        setFormData((prev) => ({ ...prev, priority: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                        <SelectItem value="stat">STAT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-4">
                  <Label htmlFor="insurance">Insurance (Optional)</Label>
                  <Input
                    id="insurance"
                    value={formData.insurance}
                    onChange={(e) => setFormData((prev) => ({ ...prev, insurance: e.target.value }))}
                    placeholder="NHIS, HMO, etc."
                  />
                </div>
              </CardContent>
            </Card>

            {/* Medications */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif font-semibold flex items-center gap-2">
                  <Pill className="h-5 w-5" />
                  Medications
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Add New Medication */}
                <div className="p-4 border border-border rounded-lg mb-4">
                  <h4 className="font-medium mb-3">Add Medication</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Medicine Name *</Label>
                      <Select
                        value={newMedication.medicineName}
                        onValueChange={(value) => {
                          setNewMedication((prev) => ({ ...prev, medicineName: value, strength: "" }))
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select medicine" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(new Set(availableMedicines.map((m) => m.name))).map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Strength *</Label>
                      <Select
                        value={newMedication.strength}
                        onValueChange={(value) => setNewMedication((prev) => ({ ...prev, strength: value }))}
                        disabled={!newMedication.medicineName}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select strength" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableMedicines
                            .filter((m) => m.name === newMedication.medicineName)
                            .map((medicine) => (
                              <SelectItem key={medicine.strength} value={medicine.strength}>
                                {medicine.strength}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        value={newMedication.quantity}
                        onChange={(e) =>
                          setNewMedication((prev) => ({ ...prev, quantity: Number.parseInt(e.target.value) || 1 }))
                        }
                        min="1"
                        placeholder="1"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Dosage *</Label>
                      <Input
                        value={newMedication.dosage}
                        onChange={(e) => setNewMedication((prev) => ({ ...prev, dosage: e.target.value }))}
                        placeholder="e.g., 3 times daily"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label>Instructions *</Label>
                      <Input
                        value={newMedication.instructions}
                        onChange={(e) => setNewMedication((prev) => ({ ...prev, instructions: e.target.value }))}
                        placeholder="e.g., Take with food after meals"
                      />
                    </div>
                  </div>
                  <Button type="button" onClick={addMedication} className="mt-4 bg-accent hover:bg-accent/90">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Medication
                  </Button>
                </div>

                {/* Medication List */}
                {formData.medications.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium">Prescribed Medications ({formData.medications.length})</h4>
                    {formData.medications.map((medication) => (
                      <div key={medication.id} className="p-3 border border-border rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h5 className="font-medium">{medication.medicineName}</h5>
                              <Badge variant="outline" className="text-xs">
                                {medication.strength}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              Quantity: {medication.quantity} • Dosage: {medication.dosage}
                            </p>
                            <p className="text-sm text-muted-foreground">Instructions: {medication.instructions}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{formatCurrency(medication.cost)}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeMedication(medication.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-3 border-t border-border">
                      <span className="font-bold">Total Cost:</span>
                      <span className="font-bold text-lg">{formatCurrency(totalCost)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Clinical Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif font-semibold">Clinical Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Any special instructions, allergies, or clinical notes..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Submit */}
            <div className="flex gap-4">
              <Button type="submit" className="bg-accent hover:bg-accent/90 flex items-center gap-2">
                <Save className="h-4 w-4" />
                Create Prescription
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFormData({
                    patientName: "",
                    patientPhone: "",
                    patientAge: "",
                    doctorName: "",
                    doctorLicense: "",
                    priority: "normal",
                    insurance: "",
                    medications: [],
                    notes: "",
                  })
                }}
              >
                Clear Form
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
