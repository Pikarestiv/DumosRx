/** snake_case payload built by AddSupplierDialog's submit handler — the
 * shape createSupplier()/updateSupplier() insert into the `suppliers` table. */
export interface SupplierPayload {
  [key: string]: unknown;
  id?: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  payment_terms?: string | number;
  is_active?: boolean | number;
}

/** Display/view-model shape used by the supplier directory (stock-batch
 * management) — camelCase, with derived order-history fields joined in. */
export interface SupplierViewModel {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  status: "active" | "inactive";
  totalOrders: number;
  totalValue: number;
  lastOrderDate: string;
  paymentTerms: string;
  rating: number;
  hasDebt: boolean;
  debtAmount: number;
  // Not currently populated by transformSupplier() (see supplier-management.tsx) —
  // present here only because AddSupplierDialog reads it when pre-filling an edit.
  taxId?: string;
}

/** Row shape returned by getSuppliers() — the raw `suppliers` table joined
 * with each supplier's total outstanding debt across unpaid purchase orders. */
export interface SupplierDbRow {
  id: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  payment_terms?: string | number;
  rating?: number;
  is_active?: number | boolean;
  created_at?: string;
  total_debt?: number;
}
