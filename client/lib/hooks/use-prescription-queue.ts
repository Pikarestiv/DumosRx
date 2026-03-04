"use client";

import { useState, useEffect, useMemo } from "react";
import { apiClient } from "@/lib/api/client";

export interface PrescriptionMedication {
  id: string;
  medicineName: string;
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
  status: "pending" | "in_progress" | "ready" | "dispensed" | "on_hold";
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

  useEffect(() => {
    async function fetchPrescriptions() {
      setLoading(true);
      try {
        const res = await apiClient.getPrescriptions(1, 100);
        const items = (res.data || []).map((p: any) => ({
          id: p.id,
          prescriptionNumber: p.prescription_number || `RX-${p.id}`,
          patientName: p.patient?.name || p.patient_name || "Unknown",
          patientPhone: p.patient?.phone || p.patient_phone || "",
          patientAge: p.patient?.age || p.patient_age || 0,
          doctorName: p.doctor?.name || p.doctor_name || "Unknown",
          doctorLicense: p.doctor?.license || p.doctor_license || "",
          dateIssued: p.issued_at || p.created_at,
          status: p.status || "pending",
          priority: p.priority || "normal",
          medications: (p.medications || p.items || []).map((m: any) => ({
            id: m.id,
            medicineName: m.medicine?.name || m.medicine_name || m.name,
            strength: m.strength || "",
            dosage: m.dosage || "",
            quantity: m.quantity || 0,
            instructions: m.instructions || "",
            available: m.available ?? true,
            cost: Number(m.cost) || 0,
          })),
          insurance: p.insurance,
          totalCost: Number(p.total_cost) || 0,
          notes: p.notes,
        }));
        setPrescriptions(items);
      } catch (error) {
        console.error("Failed to fetch prescriptions:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchPrescriptions();
  }, []);

  const filteredPrescriptions = useMemo(() => {
    return prescriptions.filter((prescription) => {
      const matchesSearch =
        prescription.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        prescription.prescriptionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        prescription.doctorName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === "all" || prescription.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || prescription.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [prescriptions, searchTerm, statusFilter, priorityFilter]);

  const updatePrescriptionStatus = (id: string, newStatus: Prescription["status"]) => {
    setPrescriptions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p))
    );
  };

  const viewPrescriptionDetails = (prescription: Prescription) => {
    setSelectedPrescription(prescription);
    setShowDetailsDialog(true);
  };

  const stats = useMemo(() => {
    return {
      pending: prescriptions.filter((p) => p.status === "pending").length,
      inProgress: prescriptions.filter((p) => p.status === "in_progress").length,
      ready: prescriptions.filter((p) => p.status === "ready").length,
      urgent: prescriptions.filter((p) => p.priority === "urgent" || p.priority === "stat").length,
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
    selectedPrescription,
    showDetailsDialog,
    setShowDetailsDialog,
    updatePrescriptionStatus,
    viewPrescriptionDetails,
    stats,
  };
}
