import { query } from "@/lib/db/local-database";

export async function getPrescriptionById(id: string) {
  const pData = await query<any>(
    "SELECT * FROM prescriptions WHERE id = ? AND _deleted = 0",
    [id]
  );
  return pData.length > 0 ? pData[0] : null;
}

export async function getPrescriptionItems(prescriptionId: string) {
  return await query<any>(
    "SELECT * FROM prescription_items WHERE prescription_id = ? AND _deleted = 0",
    [prescriptionId]
  );
}

export async function getQueueCount() {
  const result = await query<any>(
    "SELECT COUNT(*) as count FROM prescriptions WHERE _deleted = 0 AND status IN ('pending', 'processing')"
  );
  return result[0]?.count || 0;
}


export async function updatePrescriptionRecord(id: string, data: any) {
  const { patient_name, patient_phone, patient_age, doctor_name, doctor_license, priority, insurance, notes, total_cost, updated_at } = data;
  return query(
    `UPDATE prescriptions 
     SET patient_name = ?, patient_phone = ?, patient_age = ?, doctor_name = ?, doctor_license = ?, priority = ?, insurance = ?, notes = ?, total_cost = ?, updated_at = ?
     WHERE id = ?`,
    [patient_name, patient_phone, patient_age, doctor_name, doctor_license, priority, insurance, notes, total_cost, updated_at, id]
  );
}

export async function deletePrescriptionItems(prescriptionId: string) {
  return query(
    `DELETE FROM prescription_items WHERE prescription_id = ?`,
    [prescriptionId]
  );
}

export async function insertPrescriptionItem(data: any) {
  return await query(
    `INSERT INTO prescription_items (id, prescription_id, product_name, strength, dosage, quantity, instructions, cost, refills_authorized, refill_interval_days, next_refill_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.id, data.prescription_id, data.product_name, data.strength, data.dosage, data.quantity, data.instructions, data.cost, data.refills_authorized, data.refill_interval_days, data.next_refill_date, data.created_at, data.updated_at]
  );
}
export async function getRefillManagementData() {
  return query<any>(
    `SELECT 
      pi.id,
      p.id as prescription_id,
      p.prescription_number,
      p.patient_name,
      p.patient_phone,
      p.doctor_name,
      pi.product_name,
      pi.strength,
      pi.dosage,
      pi.quantity,
      pi.instructions,
      pi.cost,
      pi.refills_authorized,
      pi.refills_used,
      pi.refill_interval_days,
      pi.next_refill_date,
      p.updated_at
     FROM prescription_items pi
     JOIN prescriptions p ON pi.prescription_id = p.id
     WHERE pi.refills_authorized > 0 AND p.status IN ('completed', 'dispensed') AND pi._deleted = 0`
  );
}

export async function getActivePrescriptions() {
  return query<any>(
    "SELECT * FROM prescriptions WHERE _deleted = 0 AND status != 'completed' ORDER BY created_at DESC"
  );
}

export async function getHistoryPrescriptions() {
  return query<any>(
    "SELECT * FROM prescriptions WHERE _deleted = 0 AND status = 'completed' ORDER BY created_at DESC"
  );
}

export async function getAllPrescriptionItems() {
  return await query<any>(
    "SELECT * FROM prescription_items WHERE _deleted = 0"
  );
}

export async function updatePrescriptionStatus(id: string, status: string) {
  const { update } = await import("@/lib/db/local-database");
  const data: Record<string, unknown> = { status };
  if (status === "dispensed" || status === "completed") {
    data.dispensed_at = new Date().toISOString();
  }
  return update("prescriptions", id, data);
}
