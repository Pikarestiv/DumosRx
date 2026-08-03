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
}
