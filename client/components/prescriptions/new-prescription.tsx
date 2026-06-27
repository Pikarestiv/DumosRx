"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { useNewPrescription } from "./new-prescription/use-new-prescription";
import { PrescriptionPatientInfo } from "./new-prescription/prescription-patient-info";
import { PrescriptionDoctorInfo } from "./new-prescription/prescription-doctor-info";
import { PrescriptionMedications } from "./new-prescription/prescription-medications";
import { PrescriptionNotes } from "./new-prescription/prescription-notes";
import { PrescriptionActions } from "./new-prescription/prescription-actions";

export function NewPrescription() {
  const {
    isEditing,
    existingPrescriptionData,
    formData,
    setFormData,
    newMedication,
    setNewMedication,
    availableProducts,
    addMedication,
    removeMedication,
    editMedication,
    handleSubmit,
    resetForm,
    cancelEdit,
    formatCurrency,
    totalCost,
  } = useNewPrescription();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-bold">
            {isEditing
              ? `Edit Prescription ${existingPrescriptionData?.prescription_number || ""}`
              : "Create New Prescription"}
          </CardTitle>
          <CardDescription>
            {isEditing
              ? "Modify existing prescription details"
              : "Enter prescription details and medications for processing"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <PrescriptionPatientInfo
              formData={formData}
              setFormData={setFormData}
            />

            <PrescriptionDoctorInfo
              formData={formData}
              setFormData={setFormData}
            />

            <PrescriptionMedications
              formData={formData}
              newMedication={newMedication}
              setNewMedication={setNewMedication}
              availableProducts={availableProducts}
              addMedication={addMedication}
              removeMedication={removeMedication}
              editMedication={editMedication}
              formatCurrency={formatCurrency}
              totalCost={totalCost}
            />

            <PrescriptionNotes
              formData={formData}
              setFormData={setFormData}
            />

            <PrescriptionActions
              isEditing={isEditing}
              resetForm={resetForm}
              cancelEdit={cancelEdit}
            />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
