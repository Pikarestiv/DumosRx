export interface Service {
  id: string;
  store_id?: string | null;
  name: string;
  code?: string | null;
  description?: string | null;
  category?: string | null;
  price: number;
  is_active: number | boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  _version?: number;
  _synced?: number;
  _synced_at?: string | null;
  _deleted?: number;
}

export interface SaleService {
  id: string;
  sale_id: string;
  service_id?: string | null;
  service_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  _version?: number;
  _synced?: number;
  _synced_at?: string | null;
  _deleted?: number;
}

export interface ReturnService {
  id: string;
  return_id: string;
  sale_service_id?: string | null;
  quantity: number;
  refund_amount: number;
  reason?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  _version?: number;
  _synced?: number;
  _synced_at?: string | null;
  _deleted?: number;
}
