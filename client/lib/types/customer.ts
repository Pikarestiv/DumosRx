export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  loyalty_points: number;
  outstanding_balance?: number;
  email?: string;
  address?: string;
}

/** Row shape returned by getCustomers() — the raw `customers` table joined
 * with each customer's lifetime spend and most recent visit. */
export interface CustomerDbRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  allergies?: string | null;
  medical_conditions?: string | null;
  loyalty_points?: number;
  outstanding_balance?: number;
  is_active?: number | boolean;
  created_at?: string;
  total_spent?: number;
  last_visit?: string | null;
}

/** Row shape returned by getCustomerTransactions(). */
export interface CustomerTransactionRow {
  id: string;
  transaction_number: string;
  customer_id: string;
  first_name?: string;
  last_name?: string;
  total_amount?: number;
  points_earned?: number;
  transaction_date: string;
  item_count?: number;
  item_names?: string;
}

/** Editable fields accepted by addCustomer()/updateCustomer() form submissions. */
export interface CustomerFormPayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  date_of_birth?: string;
  gender?: string;
  allergies?: string;
  medical_conditions?: string;
}
