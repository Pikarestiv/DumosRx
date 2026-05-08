"use client";

import { useState, useEffect, useMemo } from "react";
import { query } from "@/lib/db/local-database";

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

  const fetchPrescriptions = async () => {
    setLoading(true);
    try {
      // 1. Fetch prescriptions
      const pData = await query<any>(
        "SELECT * FROM prescriptions WHERE _deleted = 0 ORDER BY created_at DESC"
      );

      // 2. Fetch all prescription items for these prescriptions
      const itemsData = await query<any>(
        "SELECT * FROM prescription_items WHERE _deleted = 0"
      );

      // 3. Group items by prescription_id
      const itemsMap: Record<string, any[]> = {};
      itemsData.forEach((item) => {
        if (!itemsMap[item.prescription_id]) {
          itemsMap[item.prescription_id] = [];
        }
        itemsMap[item.prescription_id].push({
          id: item.id,
          medicineName: item.medicine_name,
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
        status: p.status,
        priority: p.priority,
        medications: itemsMap[p.id] || [],
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

  const updatePrescriptionStatus = async (id: string, newStatus: Prescription["status"]) => {
    try {
      await query("UPDATE prescriptions SET status = ?, updated_at = ? WHERE id = ?", [
        newStatus,
        new Date().toISOString(),
        id,
      ]);
      setPrescriptions((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p))
      );
    } catch (err) {
      console.error("Failed to update status", err);
    }
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
    refetch: fetchPrescriptions,
  };
}
