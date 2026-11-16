import { queryClient } from "@/lib/query-client";

export async function refreshPendingCount(): Promise<void> {
  try {
    await queryClient.invalidateQueries({
      predicate: (q) => (q.meta?.tables as string[] | undefined)?.includes("_sync_queue") ?? false,
    });
  } catch (err) {
    console.error("Failed to refresh the pending sync count:", err);
  }
}
