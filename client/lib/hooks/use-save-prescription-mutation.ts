import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { createPrescription, generateId } from "@/lib/db/local-database";
import {
  updatePrescriptionRecord,
  getPrescriptionItems,
  deletePrescriptionItem,
  updatePrescriptionItem,
  insertPrescriptionItem,
} from "@/lib/db/queries/prescriptions";
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

        // Reconcile items instead of delete-all-then-reinsert: a blind
        // reinsert gives every medication a fresh row, which resets
        // refills_used to 0 and recomputes next_refill_date from "now",
        // silently wiping the refill history of a medication that's still on
        // the prescription. Identity here is product_name + strength + dosage
        // (the form doesn't round-trip a stable item id for existing rows), so
        // a still-present medication is updated in place — keeping its id,
        // refills_used and next_refill_date — while only genuinely removed
        // rows are deleted and genuinely new ones inserted.
        const existingItems = await getPrescriptionItems(editRxId);
        const identityKey = (productName: string, strength?: string, dosage?: string) =>
          `${productName}|${strength || ""}|${dosage || ""}`;

        const unmatchedExisting = [...existingItems];
        const newMedications: typeof formData.medications = [];

        for (const med of formData.medications) {
          const matchIndex = unmatchedExisting.findIndex(
            (item) =>
              identityKey(item.product_name, item.strength, item.dosage) ===
              identityKey(med.productName, med.strength, med.dosage)
          );

          if (matchIndex === -1) {
            newMedications.push(med);
            continue;
          }

          const [existing] = unmatchedExisting.splice(matchIndex, 1);
          await updatePrescriptionItem(existing.id, {
            product_name: med.productName,
            strength: med.strength,
            dosage: med.dosage,
            quantity: med.quantity,
            instructions: med.instructions,
            cost: med.cost,
            unit_cost: med.unitCost,
            refills_authorized: med.refillsAuthorized,
            refill_interval_days: med.refillIntervalDays,
            updated_at: now,
          });
        }

        // Anything left unmatched was removed by the user in this edit.
        for (const removed of unmatchedExisting) {
          await deletePrescriptionItem(removed.id);
        }

        for (const med of newMedications) {
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
