export interface PaymentAccount {
  id: string;
  name: string;
  account_type: "bank" | "pos_terminal" | "mobile_money";
  account_number?: string;
  bank_name?: string;
  is_active?: number;
  sort_order?: number;
}
