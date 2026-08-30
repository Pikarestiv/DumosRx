import { query } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";
import type {
  PrescriptionItem,
  PrescriptionRow,
  PrescriptionUpdatePayload,
  PrescriptionItemInsertPayload,
} from "@/lib/types/prescription";

export async function getPrescriptionById(id: string) {
  const pData = await query<PrescriptionRow>(
    "SELECT * FROM prescriptions WHERE id = ? AND _deleted = 0",
    [id]
  );
  return pData.length > 0 ? pData[0] : null;
}

export async function getPrescriptionItems(prescriptionId: string) {
  return await query<PrescriptionItem>(
    "SELECT * FROM prescription_items WHERE prescription_id = ? AND _deleted = 0",
    [prescriptionId]
  );
}

export async function getQueueCount() {
  const storeId = getActiveStoreId();
  const result = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM prescriptions WHERE _deleted = 0 AND status IN ('pending', 'processing')${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );
  return result[0]?.count || 0;
}


export async function updatePrescriptionRecord(id: string, data: PrescriptionUpdatePayload) {
  const { patient_name, patient_phone, patient_age, doctor_name, doctor_license, priority, insurance, notes, total_cost, updated_at } = data;
  return query(
    `UPDATE prescriptions 
     SET patient_name = ?, patient_phone = ?, patient_age = ?, doctor_name = ?, doctor_license = ?, priority = ?, insurance = ?, notes = ?, total_cost = ?, updated_at = ?
     WHERE id = ?`,
    [
      patient_name ?? null,
      patient_phone ?? null,
      patient_age ?? null,
      doctor_name ?? null,
      doctor_license ?? null,
      priority ?? null,
      insurance ?? null,
      notes ?? null,
      total_cost ?? null,
      updated_at,
      id,
    ]
  );
}

export async function deletePrescriptionItems(prescriptionId: string) {
  return query(
    `DELETE FROM prescription_items WHERE prescription_id = ?`,
    [prescriptionId]
  );
}

export async function insertPrescriptionItem(data: PrescriptionItemInsertPayload) {
  // Raw INSERT (not base-helpers' insert()), so store_id isn't auto-injected;
  // set it explicitly here to stay scoped like every other write path.
  const storeId = getActiveStoreId();
  return await query(
    `INSERT INTO prescription_items (id, prescription_id, product_name, strength, dosage, quantity, instructions, cost, unit_cost, refills_authorized, refill_interval_days, next_refill_date, created_at, updated_at, store_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.id,
      data.prescription_id,
      data.product_name,
      data.strength ?? null,
      data.dosage ?? null,
      data.quantity ?? null,
      data.instructions ?? null,
      data.cost ?? null,
      data.unit_cost ?? null,
      data.refills_authorized ?? null,
      data.refill_interval_days ?? null,
      data.next_refill_date ?? null,
      data.created_at ?? null,
      data.updated_at ?? null,
      storeId,
    ]
  );
}
export interface RefillManagementRow {
  id: string;
  prescription_id: string;
  prescription_number?: string;
  patient_name?: string;
  patient_phone?: string;
  doctor_name?: string;
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
  updated_at?: string;
}

export async function getRefillManagementData() {
  const storeId = getActiveStoreId();
  return query<RefillManagementRow>(
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
     WHERE pi.refills_authorized > 0 AND p.status IN ('completed', 'dispensed') AND pi._deleted = 0${storeId ? " AND p.store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );
}

export async function getActivePrescriptions() {
  // Includes completed prescriptions too: the queue view filters by status
  // client-side (including the "History" chip), so excluding completed here
  // made that chip always render empty.
  const storeId = getActiveStoreId();
  return query<PrescriptionRow>(
    `SELECT * FROM prescriptions WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""} ORDER BY created_at DESC`,
    storeId ? [storeId] : [],
  );
}

export async function getHistoryPrescriptions() {
  const storeId = getActiveStoreId();
  return query<PrescriptionRow>(
    `SELECT * FROM prescriptions WHERE _deleted = 0 AND status = 'completed'${storeId ? " AND store_id = ?" : ""} ORDER BY created_at DESC`,
    storeId ? [storeId] : [],
  );
}

export async function getAllPrescriptionItems() {
  const storeId = getActiveStoreId();
  return await query<PrescriptionItem>(
    `SELECT * FROM prescription_items WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [storeId] : [],
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

/**
 * Records a refill dispense on an already-completed/dispensed prescription:
 * bumps refills_used and pushes next_refill_date forward for every item that
 * still has refills remaining, and stamps the prescription's dispensed_at so
 * it counts toward "filled today" stats.
 */
export async function dispensePrescriptionRefill(prescriptionId: string) {
  const { update } = await import("@/lib/db/local-database");
  const now = new Date();

  const items = await query<PrescriptionItem>(
    "SELECT * FROM prescription_items WHERE prescription_id = ? AND _deleted = 0 AND refills_authorized > refills_used",
    [prescriptionId]
  );

  for (const item of items) {
    const nextRefillDate = new Date(now);
    nextRefillDate.setDate(nextRefillDate.getDate() + (item.refill_interval_days || 30));
    await update("prescription_items", item.id, {
      refills_used: (item.refills_used || 0) + 1,
      next_refill_date: nextRefillDate.toISOString(),
    });
  }

  return update("prescriptions", prescriptionId, {
    dispensed_at: now.toISOString(),
  });
}

/** Prescription items with at least one refill remaining and due today or earlier. */
export async function getRefillsDue() {
  const storeId = getActiveStoreId();
  return query<PrescriptionItem & { prescription_number?: string; patient_name?: string; prescription_status?: string }>(
    `SELECT pi.*, p.prescription_number, p.patient_name, p.status as prescription_status
     FROM prescription_items pi
     JOIN prescriptions p ON pi.prescription_id = p.id
     WHERE pi._deleted = 0 AND p._deleted = 0
       AND p.status IN ('dispensed', 'completed')
       AND pi.refills_authorized > pi.refills_used
       AND pi.next_refill_date IS NOT NULL
       AND pi.next_refill_date <= ?${storeId ? " AND p.store_id = ?" : ""}`,
    storeId ? [new Date().toISOString(), storeId] : [new Date().toISOString()],
  );
}
