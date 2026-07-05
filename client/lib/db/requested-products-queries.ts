import { query, execute } from "./core";
import { insert, update, softDelete } from "./base-helpers";

export interface RequestedProduct {
  id: string;
  product_name: string;
  requested_by_customer?: string;
  request_count: number;
  status: 'pending' | 'ordered';
  created_at: string;
  updated_at: string;
}

export async function logRequestedProduct(product_name: string, requested_by_customer?: string): Promise<string> {
  const now = new Date().toISOString();
  
  // Check if a pending request for this product already exists
  const existing = await query<RequestedProduct>(
    `SELECT * FROM requested_products WHERE lower(product_name) = lower(?) AND status = 'pending' AND _deleted = 0`,
    [product_name]
  );

  if (existing.length > 0) {
    const record = existing[0];
    const newCount = record.request_count + 1;
    
    // Determine the new customer string if provided
    let newCustomerString = record.requested_by_customer || '';
    if (requested_by_customer) {
      if (newCustomerString && !newCustomerString.includes(requested_by_customer)) {
        newCustomerString += `, ${requested_by_customer}`;
      } else if (!newCustomerString) {
        newCustomerString = requested_by_customer;
      }
    }

    await update("requested_products", record.id, {
      request_count: newCount,
      requested_by_customer: newCustomerString
    });

    return record.id;
  } else {
    const record = {
      product_name,
      requested_by_customer: requested_by_customer || null,
      request_count: 1,
      status: 'pending'
    };

    const id = await insert("requested_products", record);
    return id;
  }
}

export async function getRequestedProducts(status: 'pending' | 'ordered' | 'all' = 'pending'): Promise<RequestedProduct[]> {
  let sql = `SELECT * FROM requested_products WHERE _deleted = 0`;
  const params: any[] = [];

  if (status !== 'all') {
    sql += ` AND status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY request_count DESC, created_at DESC`;

  return await query<RequestedProduct>(sql, params);
}

export async function markRequestedProductAsOrdered(id: string): Promise<void> {
  await update("requested_products", id, { status: 'ordered' });
}

export async function deleteRequestedProduct(id: string): Promise<void> {
  await softDelete("requested_products", id);
}
