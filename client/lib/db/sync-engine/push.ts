import { getPendingSyncItems, markSynced } from "../local-database";
import { apiClient } from "@/lib/api/client";
import { PushResponse } from "./types";

const SYNC_BATCH_SIZE = 50;

/**
 * Push local changes to server
 */
export async function pushChanges(
  isManual: boolean = false,
  isSetup: boolean = false
): Promise<{ pushed: number }> {
  const pending = await getPendingSyncItems();

  if (pending.length === 0) return { pushed: 0 };

  // Process in batches
  let pushedCount = 0;

  for (let i = 0; i < pending.length; i += SYNC_BATCH_SIZE) {
    const batch = pending.slice(i, i + SYNC_BATCH_SIZE);

    try {
      const changes = batch
        .map((item) => {
          const payload = JSON.parse(item.payload);
          delete payload._deleted;
          delete payload._version;
          delete payload._synced;
          delete payload._synced_at;
          
          return {
            ...item,
            payload,
          };
        })
        .filter((item) => {
          if (item.table_name === "products") {
            const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            // Prevent bad payloads from blocking the entire sync queue
            if (
              item.payload.category_id &&
              !UUID_REGEX.test(item.payload.category_id)
            ) {
              return false;
            }
            if (
              item.payload.supplier_id &&
              !UUID_REGEX.test(item.payload.supplier_id)
            ) {
              return false;
            }
          }
          if (
            item.table_name === "purchase_order_items" ||
            item.table_name === "stock_batches" ||
            item.table_name === "stock_movements"
          ) {
            // Hotfix for bad product_id that was dropped from sync queue earlier
            if (
              item.payload.product_id === "5c5d33b4-13e0-4826-a69b-7745fa5ffed6"
            ) {
              return false;
            }
          }
          if (item.table_name === "stock_batches") {
            if (item.payload && "selling_price" in item.payload) {
              delete item.payload.selling_price;
            }
          }
          return true;
        });

      if (changes.length === 0) {
        // If all items in this batch were filtered out due to invalid data,
        // mark them as synced to remove them from the queue
        const ids = batch.map((b) => b.id);
        await markSynced(ids);
        continue;
      }

      const response = (await apiClient.pushChanges(
        {
          changes,
        },
        isManual,
        isSetup
      )) as PushResponse;

      // If successful, mark as synced
      if (response.success) {
        const ids = batch.map((b) => b.id);
        await markSynced(ids);
        pushedCount += ids.length;
      }
    } catch (error) {
      console.error("Push sync failed for batch:", error);
      // Throw to properly report failure
      throw error;
    }
  }

  return { pushed: pushedCount };
}
