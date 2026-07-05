import { query, execute, generateId } from "./core";
import { insert, update } from "./base-helpers";

export interface SupplierDebtBalance {
  supplier_id: string;
  supplier_name: string;
  total_debt: number;
  unpaid_pos_count: number;
}

export interface SupplierPaymentRecord {
  id: string;
  supplier_id: string;
  po_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_note: string | null;
  created_at: string;
}

export async function getSupplierDebtBalances(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const results = await query<SupplierDebtBalance>(
    `SELECT po.supplier_id, s.name as supplier_name,
            SUM(po.total_amount - po.amount_paid) as total_debt,
            COUNT(po.id) as unpaid_pos_count
     FROM purchase_orders po
     JOIN suppliers s ON po.supplier_id = s.id
     WHERE po.payment_status != 'paid' AND po._deleted = 0
     GROUP BY po.supplier_id
     HAVING total_debt > 0
     ORDER BY total_debt DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return { data: results, page, limit };
}

export async function getUnpaidPurchaseOrders(supplierId?: string, page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  let sql = `
     SELECT po.*, s.name as supplier_name
     FROM purchase_orders po
     JOIN suppliers s ON po.supplier_id = s.id
     WHERE po.payment_status != 'paid' AND po._deleted = 0
  `;
  const params: any[] = [];
  
  if (supplierId) {
    sql += ` AND po.supplier_id = ?`;
    params.push(supplierId);
  }
  
  sql += ` ORDER BY po.created_at ASC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  
  const results = await query<any>(sql, params);
  return { data: results, page, limit };
}

export async function recordSupplierPayment(
  supplierId: string,
  supplierName: string,
  poId: string,
  amount: number,
  paymentMethod: string,
  referenceNote: string,
  paymentDate: string
) {
  const poDetails = await query<any>(
    `SELECT total_amount, amount_paid FROM purchase_orders WHERE id = ? AND _deleted = 0`,
    [poId]
  );

  if (!poDetails.length) throw new Error("Purchase order not found");

  const po = poDetails[0];
  const newAmountPaid = po.amount_paid + amount;
  
  let newPaymentStatus = 'partial';
  // Use a small epsilon to account for floating point differences
  if (newAmountPaid >= po.total_amount - 0.01) {
    newPaymentStatus = 'paid';
  }

  // 1. Update the purchase order
  await update("purchase_orders", poId, {
    amount_paid: newAmountPaid,
    payment_status: newPaymentStatus
  });

  // 2. Create the supplier payment record
  const paymentId = generateId();
  await insert("supplier_payments", {
    id: paymentId,
    supplier_id: supplierId,
    po_id: poId,
    amount,
    payment_date: paymentDate,
    payment_method: paymentMethod,
    reference_note: referenceNote
  });

  // 3. Log the expense
  const expenseId = generateId();
  await insert("expenses", {
    id: expenseId,
    category: "Procurement/Supplier Payment",
    description: `Payment to ${supplierName} for PO #${poId.split('-')[0].toUpperCase()} - ${referenceNote}`,
    amount,
    date: paymentDate,
    payment_method: paymentMethod,
    vendor_name: supplierName,
    reference_number: poId
  });
}
