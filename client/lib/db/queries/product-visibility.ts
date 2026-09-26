import { query, transaction, update, getActiveStoreId } from "@/lib/db/local-database";

/**
 * Bulk publish/unpublish for the online storefront. `products.show_online`
 * defaults off and the only other way to change it is the per-product switch in
 * the add/edit dialog, so a store that imported hundreds of products and then
 * enabled its online store had an empty storefront and no way out but opening
 * every dialog (see docs/STOREFRONT_REVIEW.md, feature #7).
 *
 * `productIds` is the catalog table's currently-filtered set, matching the
 * export toolbar's convention of acting on what's on screen; undefined means
 * the whole store. Rows already in the target state are skipped so this doesn't
 * queue a no-op sync push per product.
 *
 * @returns how many products actually changed
 */
export async function setProductsShowOnline(
  showOnline: boolean,
  productIds?: string[],
): Promise<number> {
  const storeId = getActiveStoreId();
  const params: (string | number)[] = [];

  const stateFilter = showOnline
    ? "(p.show_online IS NULL OR p.show_online = 0)"
    : "p.show_online = 1";

  let sql = `SELECT p.id FROM products p WHERE p._deleted = 0 AND ${stateFilter}`;

  if (storeId) {
    sql += " AND p.store_id = ?";
    params.push(storeId);
  }
  if (productIds && productIds.length > 0) {
    sql += ` AND p.id IN (${productIds.map(() => "?").join(",")})`;
    params.push(...productIds);
  }

  const rows = await query<{ id: string }>(sql, params);
  if (rows.length === 0) return 0;

  await transaction(async () => {
    for (const row of rows) {
      await update("products", row.id, { show_online: showOnline ? 1 : 0 });
    }
  });

  return rows.length;
}
