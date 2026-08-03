"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getActivePrescriptions, getAllPrescriptionItems, updatePrescriptionStatus as updateDbPrescriptionStatus } from "@/lib/db/queries/prescriptions";
import { genericFuzzySearch } from "@/lib/utils/search";
import { queryKeys } from "@/lib/query-keys";
import type { PrescriptionRow } from "@/lib/types/prescription";

export interface PrescriptionMedication {
  id: string;
  productName: string;
  strength: string;
  dosage: string;
  quantity: number;
  instructions: string;
  available: boolean;
  cost: number;
  refillsAuthorized: number;
  refillsUsed: number;
  refillIntervalDays: number;
  nextRefillDate?: string;
}

export interface Prescription {
  id: string;
  prescriptionNumber: string;
  patientName: string;
  patientPhone: string;
  patientAge: number;
  doctorName: string;
  doctorLicense: string;
  dateIssued: string;
  dateDispensed?: string;
  status: "pending" | "in_progress" | "ready" | "dispensed" | "completed" | "on_hold" | "partially_dispensed" | "cancelled";
  priority: "normal" | "urgent" | "stat";
  medications: PrescriptionMedication[];
  insurance?: string;
  totalCost: number;
  notes?: string;
  hasRefillDue: boolean;
}

async function fetchPrescriptions(): Promise<Prescription[]> {
  // 1. Fetch prescriptions
  const pData = await getActivePrescriptions();
  const itemsData = await getAllPrescriptionItems();

  // 2. Group items by prescription_id
  const itemsMap = new Map<string, PrescriptionMedication[]>();
  itemsData.forEach((item) => {
    if (!itemsMap.has(item.prescription_id)) {
      itemsMap.set(item.prescription_id, []);
    }
    itemsMap.get(item.prescription_id)!.push({
      id: item.id,
      productName: item.product_name,
      strength: item.strength,
      dosage: item.dosage,
      quantity: item.quantity,
      instructions: item.instructions,
      available: true,
      cost: item.cost,
      refillsAuthorized: item.refills_authorized || 0,
      refillsUsed: item.refills_used || 0,
      refillIntervalDays: item.refill_interval_days || 30,
      nextRefillDate: item.next_refill_date || undefined,
    });
  });

  const nowIso = new Date().toISOString();

  // 3. Map to Prescription objects
  return pData.map((p: PrescriptionRow) => {
    const medications = itemsMap.get(p.id) || [];
    const isDispensable = p.status === "dispensed" || p.status === "completed";
    const hasRefillDue = isDispensable && medications.some(
      (m) =>
        m.refillsUsed < m.refillsAuthorized &&
        !!m.nextRefillDate &&
        m.nextRefillDate <= nowIso
    );

    return {
      id: p.id,
      prescriptionNumber: p.prescription_number || "",
      patientName: p.patient_name || "",
      patientPhone: p.patient_phone || "",
      patientAge: p.patient_age || 0,
      doctorName: p.doctor_name || "",
      doctorLicense: p.doctor_license || "",
      dateIssued: p.issued_at || "",
      dateDispensed: p.dispensed_at || undefined,
      status: p.status as Prescription["status"],
      priority: p.priority as Prescription["priority"],
      medications,
      insurance: p.insurance,
      totalCost: p.total_cost || 0,
      notes: p.notes,
      hasRefillDue,
    };
  });
}

export function usePrescriptionQueue() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<string | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  // Tagged with meta.tables: ["prescriptions"] (see lib/query-keys.ts) so it
  // auto-refetches whenever insert/update/softDelete touches that table
  // anywhere in the app — no manual refetch wiring needed.
  const { data, isLoading: loading, refetch } = useQuery({
    ...queryKeys.prescriptions.all(),
    queryFn: fetchPrescriptions,
  });
  const prescriptions = data || [];

  // Derived (not a separate snapshot) so an edit/refetch that changes the
  // selected prescription's medications, status, etc. is reflected immediately
  // instead of the detail panel showing whatever was selected at click-time.
  const selectedPrescription = useMemo(
    () => prescriptions.find((p) => p.id === selectedPrescriptionId) || null,
    [prescriptions, selectedPrescriptionId]
  );
  const setSelectedPrescription = (prescription: Prescription | null) => {
    setSelectedPrescriptionId(prescription?.id ?? null);
  };

  const preFilteredPrescriptions = useMemo(() => {
    return prescriptions.filter((prescription) => {
      // Handle the "filled" filter to show dispensed/completed
      if (statusFilter === "filled") {
        return prescription.status === "dispensed" || prescription.status === "completed";
      }

      // "refill_due" isn't a prescription status — it's derived from whether
      // any medication has refills remaining and its next_refill_date has passed.
      if (statusFilter === "refill_due") {
        return prescription.hasRefillDue;
      }

      const matchesStatus = statusFilter === "all" || prescription.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || prescription.priority === priorityFilter;

      return matchesStatus && matchesPriority;
    });
  }, [prescriptions, statusFilter, priorityFilter]);

  const { filteredPrescriptions, isFuzzyFallback } = useMemo(() => {
    const { results, isFuzzyFallback } = genericFuzzySearch(
      searchTerm,
      preFilteredPrescriptions,
      ["patientName", "prescriptionNumber", "doctorName"]
    );
    return { filteredPrescriptions: results, isFuzzyFallback };
  }, [searchTerm, preFilteredPrescriptions]);

  const updatePrescriptionStatus = async (id: string, newStatus: Prescription["status"]) => {
    try {
      // update() already invalidates queryKey: ["prescriptions"], triggering a
      // refetch — selectedPrescription is derived from that data, so it picks
      // up the new status automatically once the refetch lands.
      await updateDbPrescriptionStatus(id, newStatus);
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const viewPrescriptionDetails = (prescription: Prescription) => {
    setSelectedPrescription(prescription);
    setShowDetailsDialog(true);
  };

  const stats = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    
    let filledToday = 0;
    let filledYesterday = 0;

    const pending = prescriptions.filter((p) => p.status === "pending").length;
    const inProgress = prescriptions.filter((p) => p.status === "in_progress").length;
    const ready = prescriptions.filter((p) => p.status === "ready").length;
    const urgent = prescriptions.filter((p) => p.priority === "urgent" || p.priority === "stat").length;

    prescriptions.forEach((p) => {
      const isFilled = p.status === "dispensed" || p.status === "completed";
      if (!isFilled) return;
      const dateStr = p.dateDispensed || p.dateIssued;
      if (!dateStr) return;
      
      if (dateStr.startsWith(todayStr)) filledToday++;
      else if (dateStr.startsWith(yesterdayStr)) filledYesterday++;
    });

    return {
      pending,
      inProgress,
      ready,
      urgent,
      filledToday,
      filledYesterday,
    };
  }, [prescriptions]);

  return {
    prescriptions,
    loading,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    filteredPrescriptions,
    isFuzzyFallback,
    selectedPrescription,
    setSelectedPrescription,
    showDetailsDialog,
    setShowDetailsDialog,
    updatePrescriptionStatus,
    viewPrescriptionDetails,
    stats,
    refetch,
  };
}
