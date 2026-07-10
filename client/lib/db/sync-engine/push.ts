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
      // payload needs to be parsed from string
      const changes = batch.map((item) => {
        const payload = JSON.parse(item.payload);

        return {
          ...item,
          payload,
        };
      });

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
