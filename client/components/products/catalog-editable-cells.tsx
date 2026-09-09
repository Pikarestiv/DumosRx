import { useState } from "react";
import { Pencil } from "lucide-react";
import { Product } from "./types";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { SearchableInput } from "@/components/ui/searchable-input";

/** Shared hover/touch affordance for a per-cell quick edit: on a mouse/
 * trackpad device the pencil only appears while hovering that specific
 * cell (`group/cell`, scoped per-cell so hovering one editable cell doesn't
 * light up its neighbors); on a touch-capable device it renders statically
 * since :hover never fires there, so it has to be visible up front to be
 * discoverable at all. */
function CellEditPencil({ hasTouchCapability }: { hasTouchCapability: boolean }) {
  return (
    <Pencil
      className={`w-3 h-3 text-muted-foreground shrink-0 ${
        hasTouchCapability ? "opacity-60" : "opacity-0 group-hover/cell:opacity-100"
      }`}
    />
  );
}

export function EditableCategoryCell({
  product,
  categoryOptions,
  canEdit,
  hasTouchCapability,
  onSave,
}: {
  product: Product;
  categoryOptions: string[];
  canEdit: boolean;
  hasTouchCapability: boolean;
  onSave: (product: Product, category: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(product.category || "");

  if (!canEdit) {
    return (
      <div className="flex items-center">
        <span className="text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md truncate max-w-[100px] inline-block">
          {product.category || "Uncategorized"}
        </span>
      </div>
    );
  }

  if (editing) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <SearchableInput
          options={categoryOptions}
          value={value}
          onValueChange={setValue}
          placeholder={product.category || "Category"}
          className="h-7 text-[11px]"
          autoFocus
          onBlur={() => {
            setEditing(false);
            // Left blank (the field opens empty precisely so the full
            // category list shows instead of narrowing to matches of
            // whatever was already there) means "changed my mind" - the
            // category shouldn't get blanked out just for blurring away
            // without picking anything.
            const trimmed = value.trim();
            if (trimmed && trimmed !== (product.category || "").trim()) {
              onSave(product, trimmed);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="group/cell flex items-center gap-1 min-w-0 cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        // Start empty rather than pre-filled with the current category:
        // SearchableInput filters its dropdown against the input's text, so
        // pre-filling it would narrow the list to near-matches of the
        // current value instead of showing every category to pick from.
        setValue("");
        setEditing(true);
      }}
    >
      <span className="text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md truncate max-w-[80px] inline-block">
        {product.category || "Uncategorized"}
      </span>
      <CellEditPencil hasTouchCapability={hasTouchCapability} />
    </div>
  );
}

export function EditableQuickNumberCell({
  displayValue,
  displayClassName = "text-[13px] font-semibold",
  value,
  parse,
  step,
  widthClassName = "w-16",
  canEdit,
  hasTouchCapability,
  onSave,
}: {
  displayValue: string;
  displayClassName?: string;
  value: number;
  parse: (raw: string) => number;
  step?: string;
  widthClassName?: string;
  canEdit: boolean;
  hasTouchCapability: boolean;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!canEdit) {
    return <div className={displayClassName}>{displayValue}</div>;
  }

  if (editing) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <EditableNumberCell
          value={draft}
          onCommit={setDraft}
          parse={parse}
          step={step}
          widthClassName={widthClassName}
          autoFocus
          onBlur={() => {
            setEditing(false);
            if (draft !== value) onSave(draft);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="group/cell flex items-center gap-1 cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        setDraft(value);
        setEditing(true);
      }}
    >
      <span className={displayClassName}>{displayValue}</span>
      <CellEditPencil hasTouchCapability={hasTouchCapability} />
    </div>
  );
}
