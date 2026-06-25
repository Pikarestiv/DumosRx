"use client";

import { useState, useEffect, useMemo } from "react";
import { query } from "@/lib/db/local-database";
import { genericFuzzySearch } from "@/lib/utils/search";
import { Prescription, PrescriptionMedication } from "./use-prescription-queue";

export function usePrescriptionHistory() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      // 1. Fetch completed/cancelled prescriptions
      const pData = await query<any>(
        "SELECT * FROM prescriptions WHERE _deleted = 0 AND status IN ('completed', 'cancelled', 'dispensed') ORDER BY updated_at DESC"
      );

      // 2. Fetch all prescription items for these prescriptions
      const itemsData = await query<any>(
        "SELECT * FROM prescription_items WHERE _deleted = 0"
      );

      // 3. Group items by prescription_id
      const itemsMap = new Map<string, any[]>();
      itemsData.forEach((item) => {
        if (!itemsMap.has(item.prescription_id)) {
          itemsMap.set(item.prescription_id, []);
        }
        itemsMap.get(item.prescription_id)!.push({
          id: item.id,
          medicineName: item.medicine_name,
          strength: item.strength,
          dosage: item.dosage,
          quantity: item.quantity,
          instructions: item.instructions,
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
        dateDispensed: p.updated_at, // Use updated_at as dispense date
        status: p.status,
        priority: p.priority,
        medications: itemsMap.get(p.id) || [],
        insurance: p.insurance,
        totalCost: p.total_cost,
        notes: p.notes,
      }));

      setPrescriptions(items);
    } catch (error) {
      console.error("Failed to fetch prescription history:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const { filteredPrescriptions, isFuzzyFallback } = useMemo(() => {
    const { results, isFuzzyFallback } = genericFuzzySearch(
      searchTerm,
      prescriptions,
      ["patientName", "prescriptionNumber", "doctorName"]
    );
    return { filteredPrescriptions: results, isFuzzyFallback };
  }, [searchTerm, prescriptions]);

  const viewPrescriptionDetails = (prescription: Prescription) => {
    setSelectedPrescription(prescription);
    setShowDetailsDialog(true);
  };

  return {
    prescriptions,
    loading,
    searchTerm,
    setSearchTerm,
    filteredPrescriptions,
    isFuzzyFallback,
    selectedPrescription,
    showDetailsDialog,
    setShowDetailsDialog,
    viewPrescriptionDetails,
    refetch: fetchHistory,
  };
}
