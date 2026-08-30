import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/context/auth-context";
import { getAvailableStockBatches } from "@/lib/db/queries/inventory";
import { generateId } from "@/lib/db/local-database";
import { getPrescriptionById, getPrescriptionItems } from "@/lib/db/queries/prescriptions";
import { queryKeys } from "@/lib/query-keys";
import type { PrescriptionItem, PrescriptionPriority, PrescriptionRow } from "@/lib/types/prescription";
import { toPrescriptionPriority } from "@/lib/types/prescription";
import { calculatePrescriptionItemCost } from "@/lib/utils/prescription-calculations";
import { useSavePrescriptionMutation } from "@/lib/hooks/use-save-prescription-mutation";

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
  unitCost: number | "";
}

export interface PrescriptionMedication {
  id: string;
  productName: string;
  strength: string;
  dosage: string;
  quantity: number;
  instructions: string;
  unitCost: number;
  /** Always unitCost * quantity — computed, never independently entered. */
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
    unitCost: "",
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
            medications: itemsData.map((item: PrescriptionItem) => {
              const quantity = item.quantity || 1;
              const cost = item.cost || 0;
              // Older records predate the unit_cost column — derive it from
              // the stored total so editing still prefills something sane.
              const unitCost = item.unit_cost || (quantity > 0 ? cost / quantity : 0);
              return {
                id: item.id,
                productName: item.product_name,
                strength: item.strength || "",
                dosage: item.dosage || "",
                quantity,
                instructions: item.instructions || "",
                unitCost,
                cost,
                refillsAuthorized: item.refills_authorized || 0,
                refillIntervalDays: item.refill_interval_days || 30,
              };
            }),
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

    const quantity = Number(newMedication.quantity);
    const unitCost = newMedication.unitCost !== "" ? Number(newMedication.unitCost) : product.cost;

    const medication: PrescriptionMedication = {
      id: generateId(),
      productName: newMedication.productName,
      strength: newMedication.strength,
      dosage: newMedication.dosage,
      quantity,
      instructions: newMedication.instructions,
      unitCost,
      cost: calculatePrescriptionItemCost(unitCost, quantity),
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
      unitCost: "",
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
        unitCost: medToEdit.unitCost,
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
    // Both must go: showNewPrescription in PrescriptionManagement is
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

  const savePrescriptionMutation = useSavePrescriptionMutation();

  const handleSubmit = (e: React.FormEvent) => {
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

    if (savePrescriptionMutation.isPending) return;

    savePrescriptionMutation.mutate(
      { isEditing, editRxId, formData, userId: user?.id },
      {
        onSuccess: () => {
          if (isEditing && editRxId) {
            cancelEdit();
          } else {
            resetForm();
            closeNewPrescriptionForm();
          }
        },
      },
    );
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
    isSaving: savePrescriptionMutation.isPending,
    resetForm,
    cancelEdit,
    formatCurrency,
    totalCost,
  };
}
