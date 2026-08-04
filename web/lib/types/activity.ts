export interface ActivityLog {
  id: string | number;
  created_at?: string | Date;
  action: string;
  table_name?: string;
  details?: string;
  description?: string;
  properties?: {
    table_name?: string;
    details?: string;
  };
  user_id?: string | number;
  user?: {
    name?: string;
    first_name?: string;
    store_id?: string | number;
    store?: {
      name?: string;
    };
  };
}
