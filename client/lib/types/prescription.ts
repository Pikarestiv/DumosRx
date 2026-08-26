export const PRESCRIPTION_PRIORITIES = ["normal", "urgent", "stat"] as const;
export type PrescriptionPriority = (typeof PRESCRIPTION_PRIORITIES)[number];

export const PRESCRIPTION_STATUSES = [
  "pending",
  "in_progress",
  "ready",
  "dispensed",
  "completed",
  "on_hold",
  "partially_dispensed",
  "cancelled",
] as const;
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number];

/** Narrows a raw DB string to a known PrescriptionPriority, falling back to
 * "normal" for anything unrecognized: prescriptions are healthcare data, so
 * an unchecked cast here could silently misrepresent urgency. */
export function toPrescriptionPriority(value: string | null | undefined): PrescriptionPriority {
  return (PRESCRIPTION_PRIORITIES as readonly string[]).includes(value ?? "")
    ? (value as PrescriptionPriority)
    : "normal";
}

/** Narrows a raw DB string to a known PrescriptionStatus, falling back to
 * "pending" for anything unrecognized. */
export function toPrescriptionStatus(value: string | null | undefined): PrescriptionStatus {
  return (PRESCRIPTION_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as PrescriptionStatus)
    : "pending";
}

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  product_name: string;
  strength?: string;
  dosage?: string;
  quantity?: number;
  instructions?: string;
  cost?: number;
  refills_authorized?: number;
  refills_used?: number;
  refill_interval_days?: number;
  next_refill_date?: string;
}

export interface PrescriptionRow {
  id: string;
  prescription_number?: string;
  customer_id?: string;
  user_id?: string;
  patient_name?: string;
  patient_phone?: string;
  patient_age?: number;
  doctor_name?: string;
  doctor_license?: string;
  status: string;
  priority: string;
  insurance?: string;
  total_cost?: number;
  notes?: string;
  issued_at?: string;
  dispensed_at?: string;
  created_at?: string;
  updated_at?: string;
  created_by_name?: string;
}

/** Payload accepted by updatePrescriptionRecord(): the editable fields from
 * the prescription form, plus the caller-supplied updated_at timestamp. */
export interface PrescriptionUpdatePayload {
  patient_name?: string;
  patient_phone?: string;
  patient_age?: number;
  doctor_name?: string;
  doctor_license?: string;
  priority?: string;
  insurance?: string;
  notes?: string;
  total_cost?: number;
  updated_at: string;
}

/** Payload accepted by insertPrescriptionItem(): a PrescriptionItem plus the
 * id/timestamps the caller assigns before insert. */
export interface PrescriptionItemInsertPayload extends PrescriptionItem {
  created_at?: string;
  updated_at?: string;
}
