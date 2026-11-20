import { useRef, useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Product } from "./types";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { SearchableInput } from "@/components/ui/searchable-input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useUnsavedEdit } from "@/lib/hooks/use-unsaved-edit";
import { useUppercaseDisplayClass, capitalizeWords } from "@/lib/hooks/use-uppercase-display";

// Shared hover/touch affordance for a per-cell quick edit:
// Rationale: docs/CLIENT_COMMENTS.md#block-components-products-catalog-editable-cells-tsx-L8
function CellEditPencil({ hasTouchCapability }: { hasTouchCapability: boolean }) {
  return (
    <Pencil
      className={`w-3 h-3 text-muted-foreground shrink-0 ${
        hasTouchCapability ? "opacity-60" : "opacity-0 group-hover:opacity-100"
      }`}
    />
  );
}

const UNSAVED_TITLE = "Not saved yet: tap the tick to save or the cross to cancel";

const KEEP_INPUT_FOCUSED = {
  onMouseDown: (e: React.SyntheticEvent) => e.preventDefault(),
  onPointerDown: (e: React.SyntheticEvent) => e.preventDefault(),
};

const ACTION_BUTTON = "flex h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11 items-center justify-center rounded-lg";

/** An editing cell: the input where the value was, with its Save and Cancel
 * buttons in a floating bar under it, so they get a real tap target without
 * squeezing into the column or covering the neighbouring cell. The buttons
 * swallow mousedown and pointerdown so the input keeps focus through the tap
 * (a real blur would run the input's own save path before the button's). */
function InlineEditFrame({
  unsaved = false,
  onSave,
  onCancel,
  children,
}: {
  unsaved?: boolean;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <Popover open>
      <PopoverAnchor asChild>
        <div
          className={`flex items-center rounded-lg ${unsaved ? "ring-2 ring-amber-400/70 ring-offset-1" : ""}`}
          title={unsaved ? UNSAVED_TITLE : undefined}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {children}
          <span role="status" aria-live="polite" className="sr-only">
            {unsaved ? UNSAVED_TITLE : ""}
          </span>
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="center"
        sideOffset={6}
        className="flex w-auto gap-1 rounded-xl p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button type="button" {...KEEP_INPUT_FOCUSED} onClick={onSave} title="Save" className={`${ACTION_BUTTON} text-emerald-600 hover:bg-emerald-500/10`}>
          <Check className="h-4 w-4 pointer-coarse:h-5 pointer-coarse:w-5" />
        </button>
        <button type="button" {...KEEP_INPUT_FOCUSED} onClick={onCancel} title="Cancel" className={`${ACTION_BUTTON} text-muted-foreground hover:bg-muted`}>
          <X className="h-4 w-4 pointer-coarse:h-5 pointer-coarse:w-5" />
        </button>
      </PopoverContent>
    </Popover>
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

  const unsaved = value.trim() !== "" && value.trim() !== (product.category || "").trim();
  useUnsavedEdit(editing && unsaved);

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
      <InlineEditFrame
        unsaved={unsaved}
        onSave={() => finish(true, value)}
        onCancel={() => finish(false, value)}
      >
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
            if (!unsaved) finish(false, value);
          }}
        />
      </InlineEditFrame>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Edit category (${product.category || "Uncategorized"})`}
      className="flex items-center gap-1 min-w-0 cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(e) => {
        e.stopPropagation();
        // Start empty rather than pre-filled with the current category:
        // SearchableInput filters its dropdown against the input's text, so
        // pre-filling it would narrow the list to near-matches of the
        // current value instead of showing every category to pick from.
        setValue("");
        skipNextBlur.current = false;
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          setValue("");
          skipNextBlur.current = false;
          setEditing(true);
        }
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
  ariaLabel,
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
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const skipNextBlur = useRef(false);

  const unsaved = draft !== value;
  useUnsavedEdit(editing && unsaved);

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
      <InlineEditFrame
        unsaved={unsaved}
        onSave={() => finish(true, draft)}
        onCancel={() => finish(false, draft)}
      >
        <EditableNumberCell
          value={draft}
          onCommit={setDraft}
          parse={parse}
          step={step}
          widthClassName={widthClassName}
          autoFocus
          onCancel={() => finish(false, draft)}
          onSubmit={() => finish(true, draft)}
          onBlur={() => {
            if (skipNextBlur.current) {
              skipNextBlur.current = false;
              return;
            }
            if (!unsaved) finish(false, draft);
          }}
        />
      </InlineEditFrame>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel ?? `Edit value (${displayValue})`}
      className="flex items-center gap-1 cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(e) => {
        e.stopPropagation();
        setDraft(value);
        skipNextBlur.current = false;
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          setDraft(value);
          skipNextBlur.current = false;
          setEditing(true);
        }
      }}
    >
      <span className={displayClassName}>{displayValue}</span>
      <CellEditPencil hasTouchCapability={hasTouchCapability} />
    </div>
  );
}
