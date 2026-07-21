"use client";

import { useState, useEffect, useMemo } from "react";
import { getActivePrescriptions, getAllPrescriptionItems, updatePrescriptionStatus as updateDbPrescriptionStatus } from "@/lib/db/queries/prescriptions";
import { genericFuzzySearch } from "@/lib/utils/search";

export interface PrescriptionMedication {
  id: string;
  productName: string;
  strength: string;
  dosage: string;
  quantity: number;
  instructions: string;
  available: boolean;
  cost: number;
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
}

export function usePrescriptionQueue() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  const fetchPrescriptions = async () => {
    setLoading(true);
    try {
      // 1. Fetch prescriptions
      const pData = await getActivePrescriptions();
      const itemsData = await getAllPrescriptionItems();

      // 3. Group items by prescription_id
      const itemsMap = new Map<string, any[]>();
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
        });
      });

      // 4. Map to Prescription objects
      const items = pData.map((p: any) => ({
        id: p.id,
        prescriptionNumber: p.prescription_number,
        patientName: p.patient_name,
        patientPhone: p.patient_phone,
        patientAge: p.patient_age,
        doctorName: p.doctor_name,
        doctorLicense: p.doctor_license,
        dateIssued: p.issued_at,
        dateDispensed: p.dispensed_at,
        status: p.status,
        priority: p.priority,
        medications: itemsMap.get(p.id) || [],
        insurance: p.insurance,
        totalCost: p.total_cost,
        notes: p.notes,
      }));

      setPrescriptions(items);
    } catch (error) {
      console.error("Failed to fetch prescriptions:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrescriptions();
  }, []);

  const preFilteredPrescriptions = useMemo(() => {
    return prescriptions.filter((prescription) => {
      // Handle the "filled" filter to show dispensed/completed
      if (statusFilter === "filled") {
        return prescription.status === "dispensed" || prescription.status === "completed";
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
      await updateDbPrescriptionStatus(id, newStatus);
      setPrescriptions((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p))
      );
      if (selectedPrescription?.id === id) {
        setSelectedPrescription((prev) => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const viewPrescriptionDetails = (prescription: Prescription) => {
    setSelectedPrescription(prescription);
    setShowDetailsDialog(true);
  };

  const stats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    
    return {
      pending: prescriptions.filter((p) => p.status === "pending").length,
      inProgress: prescriptions.filter((p) => p.status === "in_progress").length,
      ready: prescriptions.filter((p) => p.status === "ready").length,
      urgent: prescriptions.filter((p) => p.priority === "urgent" || p.priority === "stat").length,
      filledToday: prescriptions.filter((p) => {
        const isFilled = p.status === "dispensed" || p.status === "completed";
        const dateStr = p.dateDispensed || p.dateIssued;
        const isToday = dateStr ? dateStr.startsWith(today) : false;
        return isFilled && isToday;
      }).length,
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
    refetch: fetchPrescriptions,
  };
}
