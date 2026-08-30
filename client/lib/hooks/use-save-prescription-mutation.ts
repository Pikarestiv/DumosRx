import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { createPrescription, generateId } from "@/lib/db/local-database";
import {
  updatePrescriptionRecord,
  deletePrescriptionItems,
  insertPrescriptionItem,
} from "@/lib/db/queries/prescriptions";
import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import type { NewPrescriptionForm } from "@/components/prescriptions/new-prescription/use-new-prescription";

interface SavePrescriptionParams {
  isEditing: boolean;
  editRxId: string | null;
  formData: NewPrescriptionForm;
  userId?: string;
}

export function useSavePrescriptionMutation() {
  return useMutation({
    mutationFn: async ({ isEditing, editRxId, formData, userId }: SavePrescriptionParams) => {
      const now = new Date().toISOString();
      const totalCost = formData.medications.reduce((sum, med) => sum + med.cost, 0);

      if (isEditing && editRxId) {
        await updatePrescriptionRecord(editRxId, {
          patient_name: formData.patientName,
          patient_phone: formData.patientPhone,
          patient_age: parseInt(formData.patientAge) || 0,
          doctor_name: formData.doctorName,
          doctor_license: formData.doctorLicense,
          priority: formData.priority,
          insurance: formData.insurance,
          notes: formData.notes,
          total_cost: totalCost,
          updated_at: now,
        });

        await deletePrescriptionItems(editRxId);

        for (const med of formData.medications) {
          const nextRefillDate = new Date();
          nextRefillDate.setDate(nextRefillDate.getDate() + Number(med.refillIntervalDays));

          await insertPrescriptionItem({
            id: generateId(),
            prescription_id: editRxId,
            product_name: med.productName,
            strength: med.strength,
            dosage: med.dosage,
            quantity: med.quantity,
            instructions: med.instructions,
            cost: med.cost,
            unit_cost: med.unitCost,
            refills_authorized: med.refillsAuthorized,
            refill_interval_days: med.refillIntervalDays,
            next_refill_date: nextRefillDate.toISOString(),
            created_at: now,
            updated_at: now,
          });
        }

        // updatePrescriptionRecord/deletePrescriptionItems/insertPrescriptionItem
        // all write via raw query() and don't go through the insert/update
        // helpers that auto-invalidate, so invalidate explicitly here to make
        // the detail panel reflect the edited medications.
        queryClient.invalidateQueries(queryKeys.prescriptions.all());
        return { isEditing: true as const };
      }

      const prescriptionId = generateId();

      const prescriptionData = {
        id: prescriptionId,
        prescription_number: `RX-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`,
        patient_name: formData.patientName,
        patient_phone: formData.patientPhone,
        patient_age: parseInt(formData.patientAge) || 0,
        user_id: userId,
        doctor_name: formData.doctorName,
        doctor_license: formData.doctorLicense,
        priority: formData.priority,
        insurance: formData.insurance,
        notes: formData.notes,
        status: "pending",
        total_cost: totalCost,
        issued_at: now,
        created_at: now,
        updated_at: now,
      };

      const prescriptionItems = formData.medications.map((med) => {
        const nextRefillDate = new Date();
        nextRefillDate.setDate(nextRefillDate.getDate() + Number(med.refillIntervalDays));
        return {
          id: generateId(),
          product_name: med.productName,
          strength: med.strength,
          dosage: med.dosage,
          quantity: med.quantity,
          instructions: med.instructions,
          cost: med.cost,
          unit_cost: med.unitCost,
          refills_authorized: med.refillsAuthorized,
          refill_interval_days: med.refillIntervalDays,
          next_refill_date: nextRefillDate.toISOString(),
          created_at: now,
          updated_at: now,
        };
      });

      await createPrescription(prescriptionData, prescriptionItems);
      return { isEditing: false as const };
    },
    onSuccess: (result) => {
      toast.success(result.isEditing ? "Prescription updated successfully!" : "Prescription created successfully!");
    },
    onError: (err) => {
      console.error("Failed to save prescription", err);
      toast.error("Failed to save prescription");
    },
  });
}
