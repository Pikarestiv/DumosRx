import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/context/auth-context";
import { queryClient } from "@/lib/query-client";
import { getAvailableStockBatches } from "@/lib/db/queries/inventory";
import { createPrescription, generateId } from "@/lib/db/local-database";
import { getPrescriptionById, getPrescriptionItems, updatePrescriptionRecord, deletePrescriptionItems, insertPrescriptionItem } from "@/lib/db/queries/prescriptions";
import { queryKeys } from "@/lib/query-keys";
import type { PrescriptionItem, PrescriptionPriority, PrescriptionRow } from "@/lib/types/prescription";
import { toPrescriptionPriority } from "@/lib/types/prescription";

export interface AvailablePrescriptionProduct {
  name: string;
  strength: string;
  cost: number;
  stock_batch_id: string;
}

export interface NewMedicationForm {
  productName: string;
  strength: string;
  dosage: string;
  quantity: number | "";
  instructions: string;
  refillsAuthorized: number | "";
  refillIntervalDays: number | "";
  cost: number | "";
}

export interface PrescriptionMedication {
  id: string;
  productName: string;
  strength: string;
  dosage: string;
  quantity: number;
  instructions: string;
  cost: number;
  refillsAuthorized: number;
  refillIntervalDays: number;
}

export interface NewPrescriptionForm {
  patientName: string;
  patientPhone: string;
  patientAge: string;
  doctorName: string;
  doctorLicense: string;
  priority: PrescriptionPriority;
  insurance: string;
  medications: PrescriptionMedication[];
  notes: string;
}

export function useNewPrescription() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const editRxId = searchParams.get("edit_rx");
  const { user } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [existingPrescriptionData, setExistingPrescriptionData] = useState<PrescriptionRow | null>(null);

  const { data: stock_batchData } = useQuery({
    ...queryKeys.stockBatches.available(),
    queryFn: () => getAvailableStockBatches()
  });

  const availableProducts: AvailablePrescriptionProduct[] = (stock_batchData || []).map((item) => ({
    name: item.product_name || "",
    strength: item.m_strength || item.strength || "",
    cost: item.selling_price || 0,
    stock_batch_id: item.id,
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
  });

  const [newMedication, setNewMedication] = useState<NewMedicationForm>({
    productName: "",
    strength: "",
    dosage: "",
    quantity: 1,
    instructions: "",
    refillsAuthorized: 0,
    refillIntervalDays: 30,
    cost: "",
  });

  useEffect(() => {
    if (editRxId) {
      setIsEditing(true);
      const fetchPrescription = async () => {
        try {
          const prescription = await getPrescriptionById(editRxId);
          if (!prescription) return;
          
          setExistingPrescriptionData(prescription);

          const itemsData = await getPrescriptionItems(editRxId);

          setFormData({
            patientName: prescription.patient_name || "",
            patientPhone: prescription.patient_phone || "",
            patientAge: prescription.patient_age?.toString() || "",
            doctorName: prescription.doctor_name || "",
            doctorLicense: prescription.doctor_license || "",
            priority: toPrescriptionPriority(prescription.priority),
            insurance: prescription.insurance || "",
            notes: prescription.notes || "",
            medications: itemsData.map((item: PrescriptionItem) => ({
              id: item.id,
              productName: item.product_name,
              strength: item.strength || "",
              dosage: item.dosage || "",
              quantity: item.quantity || 1,
              instructions: item.instructions || "",
              cost: item.cost || 0,
              refillsAuthorized: item.refills_authorized || 0,
              refillIntervalDays: item.refill_interval_days || 30,
            })),
          });
        } catch (error) {
          console.error("Failed to fetch prescription to edit", error);
        }
      };
      fetchPrescription();
    }
  }, [editRxId]);

  const addMedication = () => {
    if (!newMedication.productName || !newMedication.dosage) {
      toast.error("Please fill in medication name and dosage");
      return;
    }

    if (!newMedication.quantity || Number(newMedication.quantity) <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }

    const product = availableProducts.find(
      (m) =>
        m.name === newMedication.productName &&
        m.strength === newMedication.strength
    );

    if (!product) {
      toast.error("Selected product not found");
      return;
    }

    const medication: PrescriptionMedication = {
      id: generateId(),
      productName: newMedication.productName,
      strength: newMedication.strength,
      dosage: newMedication.dosage,
      quantity: Number(newMedication.quantity),
      instructions: newMedication.instructions,
      cost: newMedication.cost !== "" ? Number(newMedication.cost) : (product.cost * Number(newMedication.quantity)),
      refillsAuthorized: Number(newMedication.refillsAuthorized) || 0,
      refillIntervalDays: Number(newMedication.refillIntervalDays) || 30,
    };

    setFormData((prev) => ({
      ...prev,
      medications: [...prev.medications, medication],
    }));

    setNewMedication({
      productName: "",
      strength: "",
      dosage: "",
      quantity: "",
      instructions: "",
      refillsAuthorized: 0,
      refillIntervalDays: 30,
      cost: "",
    });
  };

  const removeMedication = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      medications: prev.medications.filter((med) => med.id !== id),
    }));
  };

  const editMedication = (id: string) => {
    const medToEdit = formData.medications.find((med) => med.id === id);
    if (medToEdit) {
      setNewMedication({
        productName: medToEdit.productName,
        strength: medToEdit.strength,
        dosage: medToEdit.dosage,
        quantity: medToEdit.quantity,
        instructions: medToEdit.instructions,
        refillsAuthorized: medToEdit.refillsAuthorized,
        refillIntervalDays: medToEdit.refillIntervalDays,
        cost: medToEdit.cost,
      });
      removeMedication(id);
    }
  };

  const resetForm = () => {
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
    });
  };

  const cancelEdit = () => {
    const params = new URLSearchParams(searchParams.toString());
    // Both must go — showNewPrescription in PrescriptionManagement is
    // action==="add" OR edit_rx present, and handleEdit sets both.
    params.delete("edit_rx");
    params.delete("action");
    params.set("tab", "queue");
    router.replace(`${pathname}?${params.toString()}`);
  };

  // Closes the "New Prescription" full-screen overlay (PrescriptionManagement
  // shows it based on the "action"/"edit_rx" params) after a successful create.
  const closeNewPrescriptionForm = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("action");
    params.delete("edit_rx");
    const query = params.toString();
    router.push(`${pathname}${query ? `?${query}` : ""}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.patientName ||
      !formData.patientPhone ||
      !formData.doctorName ||
      !formData.doctorLicense ||
      formData.medications.length === 0
    ) {
      toast.error(
        "Please fill in all required fields and add at least one medication"
      );
      return;
    }

    try {
      const now = new Date().toISOString();
      if (isEditing && editRxId) {
        // Handle update
        await updatePrescriptionRecord(editRxId, {
            patient_name: formData.patientName,
            patient_phone: formData.patientPhone,
            patient_age: parseInt(formData.patientAge) || 0,
            doctor_name: formData.doctorName,
            doctor_license: formData.doctorLicense,
            priority: formData.priority,
            insurance: formData.insurance,
            notes: formData.notes,
            total_cost: formData.medications.reduce((sum, med) => sum + med.cost, 0),
            updated_at: now
        });

        // Delete old items and insert new ones
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
              refills_authorized: med.refillsAuthorized,
              refill_interval_days: med.refillIntervalDays,
              next_refill_date: nextRefillDate.toISOString(),
              created_at: now,
              updated_at: now
          });
        }

        // updatePrescriptionRecord/deletePrescriptionItems/insertPrescriptionItem
        // all write via raw query() and don't go through the insert/update
        // helpers that auto-invalidate — do it explicitly so the detail
        // panel reflects the edited medications.
        queryClient.invalidateQueries(queryKeys.prescriptions.all());

        toast.success("Prescription updated successfully!");
        cancelEdit();
      } else {
        // Generate new prescription
        const prescriptionId = generateId();

        const prescriptionData = {
          id: prescriptionId,
          prescription_number: `RX-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`,
          patient_name: formData.patientName,
          patient_phone: formData.patientPhone,
          patient_age: parseInt(formData.patientAge) || 0,
          user_id: user?.id,
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
            refills_authorized: med.refillsAuthorized,
            refill_interval_days: med.refillIntervalDays,
            next_refill_date: nextRefillDate.toISOString(),
            created_at: now,
            updated_at: now,
          };
        });

        await createPrescription(prescriptionData, prescriptionItems);
        toast.success("Prescription created successfully!");
        resetForm();
        closeNewPrescriptionForm();
      }
    } catch (err) {
      console.error("Failed to create prescription", err);
      toast.error("Failed to save prescription");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const totalCost = formData.medications.reduce((sum, med) => sum + med.cost, 0);

  return {
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
  };
}
