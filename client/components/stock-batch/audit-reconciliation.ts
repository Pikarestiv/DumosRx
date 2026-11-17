import type { AuditItem } from "./stock-audits";
import type { ProductWithDetails } from "@/lib/types/product";
import { isAuditItemCounted } from "./audit-derivations";

export function toAuditItem(p: ProductWithDetails): AuditItem {
  return {
    id: p.id,
    name: p.name,
    sku: p.barcode || `SKU-${p.id.substring(0, 6)}`,
    category: p.category_name || "Uncategorized",
    systemQty: p.stock_quantity || 0,
    costPrice: p.cost_price ?? undefined,
    sellingPrice: p.selling_price ?? undefined,
    countedQty: undefined,
    countedCostPrice: p.cost_price ?? undefined,
    countedSellingPrice: p.selling_price ?? undefined,
    lastAuditedAt: p.last_audited_at ?? null,
  };
}

// Reconciles a resumed cycle-count draft against live catalog products:
// (1) Appends newly created products to the draft sheet.
// (2) Drops uncounted soft-deleted products from the draft.
// (3) Marks counted soft-deleted products as isDeleted: true (un-submittable).
// (4) Refreshes system stock and prices for uncounted products.
// (5) Refreshes lastAuditedAt across all live items.
export function reconcileAuditDraftWithCatalog(
  draftItems: AuditItem[],
  liveProducts: ProductWithDetails[],
): AuditItem[] {
  if (draftItems.length === 0 || liveProducts.length === 0) return draftItems;

  const liveById = new Map<string, ProductWithDetails>(
    liveProducts.map((p) => [p.id, p]),
  );
  let changed = false;
  const next: AuditItem[] = [];

  for (const item of draftItems) {
    const live = liveById.get(item.id);
    if (!live) {
      if (!isAuditItemCounted(item)) {
        changed = true;
        continue;
      }
      if (!item.isDeleted) {
        changed = true;
        next.push({ ...item, isDeleted: true });
      } else {
        next.push(item);
      }
      continue;
    }

    const freshLastAudited = live.last_audited_at ?? null;
    const isCounted = isAuditItemCounted(item);

    if (item.isDeleted) {
      changed = true;
      next.push({
        ...item,
        isDeleted: false,
        lastAuditedAt: freshLastAudited,
      });
      continue;
    }

    if (!isCounted) {
      const freshSystemQty = live.stock_quantity || 0;
      const freshCost = live.cost_price ?? undefined;
      const freshSelling = live.selling_price ?? undefined;
      const freshSku = live.barcode || `SKU-${live.id.substring(0, 6)}`;
      const freshCat = live.category_name || "Uncategorized";

      if (
        item.lastAuditedAt !== freshLastAudited ||
        item.systemQty !== freshSystemQty ||
        item.costPrice !== freshCost ||
        item.sellingPrice !== freshSelling ||
        item.sku !== freshSku ||
        item.category !== freshCat ||
        item.name !== live.name
      ) {
        changed = true;
        next.push({
          ...item,
          name: live.name,
          sku: freshSku,
          category: freshCat,
          systemQty: freshSystemQty,
          costPrice: freshCost,
          sellingPrice: freshSelling,
          countedCostPrice: freshCost,
          countedSellingPrice: freshSelling,
          lastAuditedAt: freshLastAudited,
        });
      } else {
        next.push(item);
      }
    } else {
      if (item.lastAuditedAt !== freshLastAudited) {
        changed = true;
        next.push({ ...item, lastAuditedAt: freshLastAudited });
      } else {
        next.push(item);
      }
    }
  }

  const draftIds = new Set(draftItems.map((i) => i.id));
  for (const product of liveProducts) {
    if (!draftIds.has(product.id)) {
      changed = true;
      next.push(toAuditItem(product));
    }
  }

  return changed ? next : draftItems;
}
