import { query, insert, update, softDelete } from "@/lib/db/local-database";
import type { Service, ReturnService } from "@/lib/types/service";
import type { SaleServiceDetail } from "@/lib/types/sale";

export interface GetServicesFilter {
  storeId?: string | null;
  search?: string;
  category?: string;
  activeOnly?: boolean;
}

export async function getServices(filter: GetServicesFilter = {}): Promise<Service[]> {
  const { storeId, search, category, activeOnly = true } = filter;
  const conditions: string[] = ["(_deleted = 0 OR _deleted IS NULL)"];
  const params: (string | number | null)[] = [];

  if (storeId) {
    conditions.push("(store_id = ? OR store_id IS NULL)");
    params.push(storeId);
  }

  if (activeOnly) {
    conditions.push("is_active = 1");
  }

  if (category && category !== "all") {
    conditions.push("category = ?");
    params.push(category);
  }

  if (search && search.trim()) {
    conditions.push("(name LIKE ? OR code LIKE ?)");
    const term = `%${search.trim()}%`;
    params.push(term, term);
  }

  const sql = `SELECT * FROM services WHERE ${conditions.join(" AND ")} ORDER BY name ASC`;
  return query<Service>(sql, params);
}

export async function getServiceById(id: string): Promise<Service | null> {
  const rows = await query<Service>(
    "SELECT * FROM services WHERE id = ? AND (_deleted = 0 OR _deleted IS NULL) LIMIT 1",
    [id],
  );
  return rows[0] || null;
}

export async function createService(
  data: Omit<Service, "id" | "_version" | "_synced" | "_synced_at" | "_deleted">,
): Promise<string> {
  if (!data.store_id) throw new Error("Select a store before adding a service.");
  return insert("services", {
    ...data,
    price: Math.max(0, Number(data.price) || 0),
    is_active: data.is_active ? 1 : 0,
  });
}

export async function updateServiceDetails(
  id: string,
  data: Partial<Omit<Service, "id">>,
): Promise<void> {
  await update("services", id, {
    ...data,
    ...(data.price !== undefined ? { price: Math.max(0, Number(data.price) || 0) } : {}),
    ...(data.is_active !== undefined ? { is_active: data.is_active ? 1 : 0 } : {}),
  });
}

export async function deleteService(id: string): Promise<void> {
  await softDelete("services", id);
}

export async function getSaleServices(saleId: string): Promise<SaleServiceDetail[]> {
  return query<SaleServiceDetail>(
    `SELECT ss.*, ss.service_name as name, ss.total_price as subtotal,
            COALESCE(rs.returned_qty, 0) as returned_quantity
     FROM sale_services ss
     LEFT JOIN (
       SELECT sale_service_id, SUM(quantity) as returned_qty
       FROM return_services
       WHERE (_deleted = 0 OR _deleted IS NULL)
       GROUP BY sale_service_id
     ) rs ON rs.sale_service_id = ss.id
     WHERE ss.sale_id = ? AND (ss._deleted = 0 OR ss._deleted IS NULL)`,
    [saleId],
  );
}

export async function getReturnServices(returnId: string): Promise<ReturnService[]> {
  return query<ReturnService>(
    `SELECT * FROM return_services
     WHERE return_id = ? AND (_deleted = 0 OR _deleted IS NULL)`,
    [returnId],
  );
}
