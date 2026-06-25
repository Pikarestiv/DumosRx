import { useState } from "react";
import { genericFuzzySearch } from "@/lib/utils/search";

export interface RefillRequest {
  id: string;
  originalPrescription: string;
  patientName: string;
  patientPhone: string;
  medicineName: string;
  strength: string;
  lastFilled: string;
  nextRefillDate: string;
  refillsRemaining: number;
  totalRefills: number;
  status: "due" | "early" | "overdue" | "completed" | "expired";
  doctorName: string;
  cost: number;
}

const refillsData: RefillRequest[] = [
  {
    id: "1",
    originalPrescription: "RX-2023-145",
    patientName: "John Doe",
    patientPhone: "08012345678",
    medicineName: "Lisinopril",
    strength: "10mg",
    lastFilled: "2026-01-05",
    nextRefillDate: "2026-01-20",
    refillsRemaining: 3,
    totalRefills: 5,
    status: "due",
    doctorName: "Dr. Sarah Johnson",
    cost: 2400,
  },
  {
    id: "2",
    originalPrescription: "RX-2023-167",
    patientName: "Mary Smith",
    patientPhone: "08087654321",
    medicineName: "Metformin",
    strength: "500mg",
    lastFilled: "2026-01-10",
    nextRefillDate: "2026-01-25",
    refillsRemaining: 2,
    totalRefills: 6,
    status: "early",
    doctorName: "Dr. Michael Brown",
    cost: 3600,
  },
  {
    id: "3",
    originalPrescription: "RX-2023-189",
    patientName: "David Wilson",
    patientPhone: "08098765432",
    medicineName: "Amlodipine",
    strength: "5mg",
    lastFilled: "2023-12-15",
    nextRefillDate: "2026-01-15",
    refillsRemaining: 1,
    totalRefills: 3,
    status: "overdue",
    doctorName: "Dr. Emily Davis",
    cost: 1800,
  },
  {
    id: "4",
    originalPrescription: "RX-2023-201",
    patientName: "Sarah Johnson",
    patientPhone: "08076543210",
    medicineName: "Atorvastatin",
    strength: "20mg",
    lastFilled: "2026-01-18",
    nextRefillDate: "2026-02-18",
    refillsRemaining: 0,
    totalRefills: 4,
    status: "completed",
    doctorName: "Dr. James Wilson",
    cost: 4200,
  },
];

export function useRefillManagement() {
  const [refills, setRefills] = useState<RefillRequest[]>(refillsData);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const preFilteredRefills = refills.filter((refill) => {
    const matchesStatus =
      statusFilter === "all" || refill.status === statusFilter;

    return matchesStatus;
  });

  const { results: filteredRefills, isFuzzyFallback } = genericFuzzySearch(
    searchTerm,
    preFilteredRefills,
    ["patientName", "originalPrescription", "medicineName"]
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const processRefill = (id: string) => {
    setRefills(
      refills.map((refill) => {
        if (refill.id === id) {
          const newRefillsRemaining = refill.refillsRemaining - 1;
          const nextRefillDate = new Date();
          nextRefillDate.setDate(nextRefillDate.getDate() + 30); // 30 days from now

          return {
            ...refill,
            lastFilled: new Date().toISOString().split("T")[0],
            nextRefillDate: nextRefillDate.toISOString().split("T")[0],
            refillsRemaining: newRefillsRemaining,
            status:
              newRefillsRemaining > 0
                ? ("early" as const)
                : ("completed" as const),
          };
        }
        return refill;
      })
    );
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
