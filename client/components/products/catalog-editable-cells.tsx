import { useRef, useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Product } from "./types";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { SearchableInput } from "@/components/ui/searchable-input";
import { useUppercaseDisplayClass, capitalizeWords } from "@/lib/hooks/use-uppercase-display";

/** Shared hover/touch affordance for a per-cell quick edit: on a mouse/
 * trackpad device every editable cell's pencil appears together as soon as
 * the pointer is anywhere over the row (`group-hover`, keyed off the row's
 * own `group` class) — signalling up front which cells are editable, rather
 * than only revealing one pencil at a time as the cursor happens to pass
 * over it. On a touch-capable device it renders statically since :hover
 * never fires there, so it has to be visible up front to be discoverable at
 * all. */
function CellEditPencil({ hasTouchCapability }: { hasTouchCapability: boolean }) {
  return (
    <Pencil
      className={`w-3 h-3 text-muted-foreground shrink-0 ${
        hasTouchCapability ? "opacity-60" : "opacity-0 group-hover:opacity-100"
      }`}
    />
  );
}

/** Explicit confirm/cancel affordance for mouse users, alongside
 * keyboard (Enter/Escape). `onMouseDown` preventDefault keeps focus on the
 * input through the click so it never blurs first — a real blur would run
 * the input's own onBlur/save path before this button's onClick got a
 * chance to run its own (possibly different, e.g. cancel) logic. */
function CellEditActions({
  onSave,
  onCancel,
}: {
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSave}
        className="p-0.5 rounded text-emerald-600 hover:bg-emerald-500/10 shrink-0"
        title="Save"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCancel}
        className="p-0.5 rounded text-muted-foreground hover:bg-muted shrink-0"
        title="Cancel"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </>
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
  const capsClass = useUppercaseDisplayClass();
  // Set right before setEditing(false) so a blur that fires as a side
  // effect of that (e.g. the input unmounting while still focused) is
  // recognized as "already handled" instead of running the save logic a
  // second time.
  const skipNextBlur = useRef(false);

  if (!canEdit) {
    return (
      <div className="flex items-center">
        <span className={`text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md truncate max-w-[140px] inline-block ${capsClass}`}>
          {product.category || "Uncategorized"}
        </span>
      </div>
    );
  }

  const commit = (category: string) => {
    const trimmed = category.trim();
    if (trimmed && trimmed !== (product.category || "").trim()) {
      onSave(product, trimmed);
    }
  };

  const finish = (shouldSave: boolean, category: string) => {
    skipNextBlur.current = true;
    setEditing(false);
    if (shouldSave) commit(category);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <SearchableInput
          options={categoryOptions}
          value={value}
          onValueChange={setValue}
          placeholder={
            product.category
              ? capsClass === "uppercase"
                ? product.category.toUpperCase()
                : capitalizeWords(product.category)
              : "Category"
          }
          className="h-7 text-[11px] bg-background"
          autoFocus
          onCommitKey={(val) => finish(true, val)}
          onEscapeKey={() => finish(false, value)}
          onBlur={() => {
            if (skipNextBlur.current) {
              skipNextBlur.current = false;
              return;
            }
            setEditing(false);
            commit(value);
          }}
        />
        <CellEditActions
          onSave={() => finish(true, value)}
          onCancel={() => finish(false, value)}
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1 min-w-0 cursor-pointer"
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
      <span className={`text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md truncate max-w-[120px] inline-block ${capsClass}`}>
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
  const skipNextBlur = useRef(false);

  if (!canEdit) {
    return <div className={displayClassName}>{displayValue}</div>;
  }

  const finish = (shouldSave: boolean, draftValue: number) => {
    skipNextBlur.current = true;
    setEditing(false);
    if (shouldSave && draftValue !== value) onSave(draftValue);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <EditableNumberCell
          value={draft}
          onCommit={setDraft}
          parse={parse}
          step={step}
          widthClassName={widthClassName}
          autoFocus
          onCancel={() => finish(false, draft)}
          onBlur={() => {
            if (skipNextBlur.current) {
              skipNextBlur.current = false;
              return;
            }
            finish(true, draft);
          }}
        />
        <CellEditActions
          onSave={() => finish(true, draft)}
          onCancel={() => finish(false, draft)}
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1 cursor-pointer"
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
