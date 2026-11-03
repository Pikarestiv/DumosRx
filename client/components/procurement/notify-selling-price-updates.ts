import { toast } from "sonner";

export function notifySellingPriceUpdates(count: number) {
  if (count <= 0) return;
  toast.success(
    count === 1 ? "Selling price updated for 1 item" : `Selling price updated for ${count} items`,
  );
}
