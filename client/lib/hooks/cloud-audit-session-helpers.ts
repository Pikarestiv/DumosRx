import type { CloudAuditSession, CloudAuditSessionItem } from "@/lib/api/audit-sessions";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import { isAuditItemCounted } from "@/components/stock-batch/audit-derivations";
import { pendingAuditSessionIds } from "./cloud-audit-pending-ops";

export function unsyncedItems(
  sent: ReadonlyMap<string, string>,
  items: CloudAuditSessionItem[],
): CloudAuditSessionItem[] {
  return items.filter((item) => sent.get(item.product_id) !== JSON.stringify(item));
}

export function toCloudItem(item: AuditItem): CloudAuditSessionItem {
  return {
    product_id: item.id,
    system_quantity: item.systemQty,
    baseline_quantity: item.baselineQty ?? null,
    counted_quantity: item.countedQty ?? null,
    cost_price: item.costPrice ?? null,
    counted_cost_price: item.countedCostPrice ?? null,
    selling_price: item.sellingPrice ?? null,
    counted_selling_price: item.countedSellingPrice ?? null,
    counted: Boolean(item.counted),
    notes: item.reason ?? null,
    counted_at: item.countedAt ?? null,
  };
}

function remoteCountWins(local: AuditItem, remote: CloudAuditSessionItem): boolean {
  if (!isAuditItemCounted(local)) return true;
  if (!remote.counted_at) return false;
  return !local.countedAt || Date.parse(remote.counted_at) > Date.parse(local.countedAt);
}

export function isResumable(session: CloudAuditSession): boolean {
  return (
    session.status === "in_progress" &&
    !session.submitted_stock_audit_id &&
    !pendingAuditSessionIds().has(session.id)
  );
}

export function mergeCloudItemsIntoLocal(
  localItems: AuditItem[],
  cloudItems?: CloudAuditSessionItem[],
): AuditItem[] {
  if (!cloudItems || cloudItems.length === 0) return localItems;
  const cloudMap = new Map(cloudItems.map((ci) => [ci.product_id, ci]));

  return localItems.map((local) => {
    const remote = cloudMap.get(local.id);
    if (!remote) return local;

    if (
      remote.counted &&
      remote.counted_quantity !== null &&
      remote.counted_quantity !== undefined &&
      remoteCountWins(local, remote)
    ) {
      return {
        ...local,
        counted: true,
        baselineQty:
          remote.baseline_quantity !== null && remote.baseline_quantity !== undefined
            ? Number(remote.baseline_quantity)
            : local.baselineQty,
        countedQty: Number(remote.counted_quantity),
        countedAt: remote.counted_at ?? local.countedAt,
        countedCostPrice:
          remote.counted_cost_price !== null && remote.counted_cost_price !== undefined
            ? Number(remote.counted_cost_price)
            : local.countedCostPrice,
        countedSellingPrice:
          remote.counted_selling_price !== null && remote.counted_selling_price !== undefined
            ? Number(remote.counted_selling_price)
            : local.countedSellingPrice,
        reason: remote.notes || local.reason,
      };
    }
    return local;
  });
}
