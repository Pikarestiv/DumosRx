"use client";

import { Prescription } from "@/lib/hooks/use-prescription-queue";
import { Search, MapPin, Phone, User, Stethoscope } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface PrescriptionListProps {
  prescriptions: Prescription[];
  selectedPrescription: Prescription | null;
  onSelect: (prescription: Prescription) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: string;
  setStatusFilter: (filter: string) => void;
  isFuzzyFallback?: boolean;
}

export function PrescriptionList({
  prescriptions,
  selectedPrescription,
  onSelect,
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  isFuzzyFallback,
}: PrescriptionListProps) {
  
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-gray-100 text-gray-700";
      case "ready": return "bg-green-100 text-green-700";
      case "dispensed": return "bg-blue-100 text-blue-700";
      case "completed": return "bg-emerald-100 text-emerald-700";
      case "on_hold": return "bg-amber-100 text-amber-700";
      case "cancelled": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "text-amber-600 bg-amber-50";
      case "stat": return "text-red-600 bg-red-50";
      default: return "hidden";
    }
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#E6EAF2] rounded-2xl flex flex-col min-h-0 h-[calc(100vh-320px)]">
      {/* Search */}
      <div className="p-4 pb-3 border-b border-[#E6EAF2]">
        <div className="flex items-center gap-2 bg-[#F5F8FC] border border-[#E6EAF2] rounded-[10px] px-3.5 py-2.5">
          <Search className="w-4 h-4 text-[#98A2B3] shrink-0" />
          <input
            type="text"
            placeholder="Search by patient or medication"
            className="border-0 outline-none text-[13px] w-full bg-transparent text-[#101828] placeholder:text-[#98A2B3]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isFuzzyFallback && prescriptions.length > 0 && (
        <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-xs border-b border-amber-500/20 text-center font-medium">
          Did you mean? (No exact matches found)
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {prescriptions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No prescriptions found matching your criteria.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {prescriptions.map((rx) => {
              const isSelected = selectedPrescription?.id === rx.id;
              
              return (
                <div
                  key={rx.id}
                  onClick={() => onSelect(rx)}
                  className={`p-4 cursor-pointer transition-colors ${
                    isSelected ? "bg-primary/5 border-l-4 border-l-primary" : "hover:bg-accent/50 border-l-4 border-l-transparent"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-semibold text-sm text-foreground">
                      {rx.patientName}
                    </div>
                    <div className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${getStatusBadgeColor(rx.status)}`}>
                      {rx.status.replace("_", " ")}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{rx.prescriptionNumber}</span>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <Stethoscope className="w-3 h-3" />
                      {rx.doctorName}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div>
                      {new Date(rx.dateIssued).toLocaleDateString()}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {rx.priority !== "normal" && (
                        <div className={`px-2 py-0.5 rounded font-medium ${getPriorityColor(rx.priority)}`}>
                          {rx.priority.toUpperCase()}
                        </div>
                      )}
                      <div className="font-medium text-foreground">
                        {formatCurrency(rx.totalCost)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
