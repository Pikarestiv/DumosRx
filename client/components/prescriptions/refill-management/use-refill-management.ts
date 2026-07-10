import { useState, useEffect, useMemo } from "react";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { genericFuzzySearch } from "@/lib/utils/search";
import { useQuery } from "@tanstack/react-query";
import { getRefillManagementData } from "@/lib/db/queries/prescriptions";
import {
  execute,
  generateId,
  createPrescription,
} from "@/lib/db/local-database";
import { toast } from "sonner";

export interface RefillRequest {
  id: string;
  originalPrescription: string;
  patientName: string;
  patientPhone: string;
  productName: string;
  strength: string;
  lastFilled: string;
  nextRefillDate: string;
  refillsRemaining: number;
  totalRefills: number;
  status: "due" | "early" | "overdue" | "completed" | "expired";
  doctorName: string;
  cost: number;
  prescriptionId: string;
  dosage: string;
  quantity: number;
  instructions: string;
  refillIntervalDays: number;
}

export function useRefillManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refills, setRefills] = useState<RefillRequest[]>([]);

  const { data: dataRaw, refetch } = useQuery({
    queryKey: ['refillManagementData'],
    queryFn: () => getRefillManagementData()
  });
  const data = dataRaw || [];

  useEffect(() => {
    if (data) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const parsedRefills: RefillRequest[] = data.map((item) => {
        const remaining = item.refills_authorized - item.refills_used;
        const nextDateStr = item.next_refill_date || new Date().toISOString();
        const nextDate = new Date(nextDateStr);
        nextDate.setHours(0, 0, 0, 0);

        const diffTime = nextDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let status: RefillRequest["status"] = "due";
        if (remaining <= 0) {
          status = "completed";
        } else if (diffDays < -3) {
          status = "overdue";
        } else if (diffDays <= 3 && diffDays >= -3) {
          status = "due";
        } else {
          status = "early";
        }

        return {
          id: item.id,
          prescriptionId: item.prescription_id,
          originalPrescription: item.prescription_number || "Unknown",
          patientName: item.patient_name || "Unknown",
          patientPhone: item.patient_phone || "Unknown",
          productName: item.product_name,
          strength: item.strength || "",
          dosage: item.dosage || "",
          quantity: item.quantity || 1,
          instructions: item.instructions || "",
          lastFilled:
            item.updated_at?.split("T")[0] ||
            new Date().toISOString().split("T")[0],
          nextRefillDate: nextDateStr.split("T")[0],
          refillsRemaining: remaining,
          totalRefills: item.refills_authorized,
          status,
          doctorName: item.doctor_name || "",
          cost: item.cost || 0,
          refillIntervalDays: item.refill_interval_days || 30,
        };
      });
      setRefills(parsedRefills);
    }
  }, [data]);

  const preFilteredRefills = useMemo(() => {
    return refills.filter((refill) => {
      return statusFilter === "all" || refill.status === statusFilter;
    });
  }, [refills, statusFilter]);

  const { results: filteredRefills, isFuzzyFallback } = genericFuzzySearch(
    searchTerm,
    preFilteredRefills,
    ["patientName", "originalPrescription", "productName"],
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return formatDateToDDMMYYYY(dateString);
  };

  const processRefill = async (id: string) => {
    const refillItem = refills.find((r) => r.id === id);
    if (!refillItem) return;

    if (refillItem.refillsRemaining <= 0) {
      toast.error("No refills remaining for this medication.");
      return;
    }

    try {
      const now = new Date();

      // 1. Generate a new prescription record (pending)
      const newPrescriptionId = generateId();
      const newPrescription = {
        id: newPrescriptionId,
        prescription_number: `RX-${now.getFullYear()}-${String(Date.now()).slice(-3)}`,
        patient_name: refillItem.patientName,
        patient_phone: refillItem.patientPhone,
        doctor_name: refillItem.doctorName,
        priority: "normal",
        status: "pending",
        total_cost: refillItem.cost,
        issued_at: now.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        notes: `Refill for ${refillItem.originalPrescription}`,
      };

      const newPrescriptionItem = {
        id: generateId(),
        product_name: refillItem.productName,
        strength: refillItem.strength,
        dosage: refillItem.dosage,
        quantity: refillItem.quantity,
        instructions: refillItem.instructions,
        cost: refillItem.cost,
        refills_authorized: 0, // The child prescription does not authorize further refills directly
        refill_interval_days: 0,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };

      await createPrescription(newPrescription, [newPrescriptionItem]);

      // 2. Update the master record to decrement remaining refills and set new target date
      const nextDate = new Date(refillItem.nextRefillDate);
      nextDate.setDate(nextDate.getDate() + refillItem.refillIntervalDays);

      await execute(
        `UPDATE prescription_items 
         SET refills_used = refills_used + 1, next_refill_date = ? 
         WHERE id = ?`,
        [nextDate.toISOString(), id],
      );

      toast.success("Refill processed and sent to active queue!");
      refetch();
    } catch (err) {
      console.error(err);
      toast.error("Failed to process refill.");
    }
  };

  const dueCount = refills.filter((r) => r.status === "due").length;
  const overdueCount = refills.filter((r) => r.status === "overdue").length;
  const earlyCount = refills.filter((r) => r.status === "early").length;
  const completedCount = refills.filter((r) => r.status === "completed").length;

  return {
    refills,
    filteredRefills,
    isFuzzyFallback,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    formatCurrency,
    formatDate,
    processRefill,
    dueCount,
    overdueCount,
    earlyCount,
    completedCount,
  };
}
