import { query, insert, update, softDelete } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";
import type {
  PrescriptionItem,
  PrescriptionRow,
  PrescriptionUpdatePayload,
  PrescriptionItemInsertPayload,
  PrescriptionItemUpdatePayload,
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
  return update("prescriptions", id, {
    patient_name: patient_name ?? null,
    patient_phone: patient_phone ?? null,
    patient_age: patient_age ?? null,
    doctor_name: doctor_name ?? null,
    doctor_license: doctor_license ?? null,
    priority: priority ?? null,
    insurance: insurance ?? null,
    notes: notes ?? null,
    total_cost: total_cost ?? null,
    updated_at,
  });
}

/** Soft-deletes a single item row (one medication line removed while editing
 * a prescription), leaving the prescription's other items — and their refill
 * history — untouched. */
export async function deletePrescriptionItem(id: string) {
  return softDelete("prescription_items", id);
}

/** Updates an existing item row in place. Deliberately never touches id,
 * refills_used or next_refill_date: re-editing a prescription must not reset
 * how many refills a patient has already collected, or when the next one is
 * due. */
export async function updatePrescriptionItem(id: string, data: PrescriptionItemUpdatePayload) {
  const { product_name, strength, dosage, quantity, instructions, cost, unit_cost, refills_authorized, refill_interval_days, updated_at } = data;
  return update("prescription_items", id, {
    product_name: product_name ?? null,
    strength: strength ?? null,
    dosage: dosage ?? null,
    quantity: quantity ?? null,
    instructions: instructions ?? null,
    cost: cost ?? null,
    unit_cost: unit_cost ?? null,
    refills_authorized: refills_authorized ?? null,
    refill_interval_days: refill_interval_days ?? null,
    updated_at,
  });
}

export async function insertPrescriptionItem(data: PrescriptionItemInsertPayload) {
  // insert() (base-helpers) auto-attaches store_id for STORE_SCOPED_TABLES
  // (prescription_items is one) and enqueues the row for sync - unlike a raw
  // query(), which did neither.
  return insert("prescription_items", {
    id: data.id,
    prescription_id: data.prescription_id,
    product_name: data.product_name,
    strength: data.strength ?? null,
    dosage: data.dosage ?? null,
    quantity: data.quantity ?? null,
    instructions: data.instructions ?? null,
    cost: data.cost ?? null,
    unit_cost: data.unit_cost ?? null,
    refills_authorized: data.refills_authorized ?? null,
    refill_interval_days: data.refill_interval_days ?? null,
    next_refill_date: data.next_refill_date ?? null,
    created_at: data.created_at ?? null,
    updated_at: data.updated_at ?? null,
  });
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
