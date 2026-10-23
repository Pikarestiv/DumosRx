import { query } from "./core";

/** One rule for every legacy-row decision: with more than one store, a NULL store_id cannot be attributed (A-248, A-303). */
export async function deviceHoldsSeveralStores(): Promise<boolean> {
  const [row] = await query<{ count: number }>("SELECT COUNT(*) AS count FROM stores");
  return (row?.count ?? 0) > 1;
}
