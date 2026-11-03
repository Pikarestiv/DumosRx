"use client";

import { useState } from "react";
import { CheckCircle2, FileText, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { StorefrontBranch } from "@/lib/api/storefront-data";

interface StorePrescriptionFormProps {
  storeSlug: string;
  branches?: StorefrontBranch[];
}

export function StorePrescriptionForm({
  storeSlug,
  branches,
}: StorePrescriptionFormProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [branchId, setBranchId] = useState(branches?.[0]?.id || "");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a prescription image or PDF document to upload.");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("customer_name", customerName);
    formData.append("customer_phone", customerPhone);
    if (notes) formData.append("notes", notes);
    if (branchId) formData.append("branch_id", branchId);
    formData.append("prescription_file", file);

    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

    try {
      const res = await fetch(`${apiUrl}/storefront/${storeSlug}/prescriptions`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(
          errData.message || "Failed to upload prescription. Please check the file and try again.",
        );
        return;
      }

      const data = await res.json();
      setTicketNumber(data.prescription_number);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (ticketNumber) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm text-center space-y-4 max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="font-heading text-xl font-bold text-foreground">
            Prescription Uploaded Successfully!
          </h2>
          <p className="text-xs text-muted-foreground">
            Our licensed pharmacy team is reviewing your prescription. We will contact you at{" "}
            <span className="font-medium text-foreground">{customerPhone}</span> to confirm pricing, dosage, and delivery.
          </p>
        </div>
        <div className="p-3 bg-muted/40 rounded-2xl border border-border inline-block">
          <span className="text-xs text-muted-foreground block">Your Prescription Ticket:</span>
          <span className="font-mono text-base font-bold text-primary">{ticketNumber}</span>
        </div>
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setTicketNumber(null);
              setFile(null);
              setNotes("");
            }}
            className="rounded-full mt-2"
          >
            Upload Another Prescription
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5"
    >
      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Full Name *
        </label>
        <Input
          type="text"
          placeholder="e.g. Mary Okonkwo"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          required
          className="rounded-full bg-muted/40 h-10 px-4 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Phone Number (for Order Confirmation) *
        </label>
        <Input
          type="tel"
          placeholder="e.g. 08012345678"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          required
          className="rounded-full bg-muted/40 h-10 px-4 text-sm"
        />
      </div>

      {branches && branches.length > 1 && (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Preferred Pickup Branch
          </label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="w-full h-10 rounded-full bg-muted/40 border border-input px-4 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.location || b.address || "Main"})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Upload Doctor's Prescription (Image or PDF) *
        </label>
        <div className="border-2 border-dashed border-border/80 hover:border-primary/50 rounded-2xl p-6 text-center cursor-pointer bg-muted/20 transition-colors">
          <input
            id="prescription-file-upload"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          <label
            htmlFor="prescription-file-upload"
            className="cursor-pointer flex flex-col items-center justify-center gap-2"
          >
            {file ? (
              <div className="flex items-center gap-2 text-primary font-medium text-sm">
                <FileText className="h-5 w-5" />
                <span className="truncate max-w-xs">{file.name}</span>
              </div>
            ) : (
              <>
                <UploadCloud className="h-8 w-8 text-muted-foreground/80" />
                <span className="text-sm font-semibold text-foreground">
                  Click to choose file or drag & drop
                </span>
                <span className="text-xs text-muted-foreground">
                  Supports JPEG, PNG, or PDF up to 5MB
                </span>
              </>
            )}
          </label>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Special Notes or Specific Brand Requests (Optional)
        </label>
        <Textarea
          placeholder="e.g. Please check if Glucophage 500mg XR is in stock instead of regular."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="rounded-2xl bg-muted/40 p-3 text-sm"
        />
      </div>

      {error && <p className="text-xs text-destructive font-medium">{error}</p>}

      <Button
        type="submit"
        disabled={loading}
        className="w-full rounded-full h-11 text-sm font-semibold"
      >
        {loading ? "Uploading Prescription…" : "Submit Prescription"}
      </Button>
    </form>
  );
}

