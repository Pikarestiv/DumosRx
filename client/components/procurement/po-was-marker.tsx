"use client";

import { changedFields, type RevertableField } from "./order-screen/po-draft-state";
import type { POLineItemDraft } from "./po-item-ledger-table";

interface POWasMarkerProps {
  item: POLineItemDraft;
  field: RevertableField;
  baseline?: Map<string, POLineItemDraft>;
  onRevert?: (lineId: string, field: RevertableField) => void;
}

export function POWasMarker({ item, field, baseline, onRevert }: POWasMarkerProps) {
  const opened = item.id ? baseline?.get(item.id) : undefined;
  if (!opened || !item.id || !onRevert || !changedFields(item, opened).includes(field)) return null;
  const was = opened[field];
  const lineId = item.id;
  return (
    <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
      was {was == null || was === "" ? "blank" : String(was)}
      <button
        type="button"
        className="underline underline-offset-2 hover:text-foreground"
        aria-label={`Revert ${field.replaceAll("_", " ")} for ${item.product_name}`}
        onClick={() => onRevert(lineId, field)}
      >
        revert
      </button>
    </span>
  );
}
