"use client";

import { format } from "date-fns";
import { Pencil, Check, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { Expense } from "@/lib/db/queries/finance";

export const EDITABLE_CATEGORIES = ["Rent", "Utilities", "Salaries", "Maintenance", "Marketing", "Other"];

export const CATEGORY_META: Record<string, { badgeClass: string }> = {
  Rent: { badgeClass: "bg-chart-1/10 text-chart-1" },
  Utilities: { badgeClass: "bg-chart-3/10 text-chart-3" },
  Salaries: { badgeClass: "bg-emerald-600/10 text-emerald-600" },
  Maintenance: { badgeClass: "bg-muted text-muted-foreground" },
  Marketing: { badgeClass: "bg-chart-2/10 text-chart-2" },
  Other: { badgeClass: "bg-muted text-muted-foreground" },
  Unknown: { badgeClass: "bg-muted text-muted-foreground" },
};

export interface ExpenseDraft {
  amount: number;
  category: string;
}

interface ExpenseDesktopRowProps {
  expense: Expense;
  currencyCode?: string;
  style: React.CSSProperties;
  isEditing: boolean;
  draft: ExpenseDraft | null;
  onDraftChange: (draft: ExpenseDraft) => void;
  onSelect: () => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function ExpenseDesktopRow({
  expense,
  currencyCode,
  style,
  isEditing,
  draft,
  onDraftChange,
  onSelect,
  onStartEdit,
  onSave,
  onCancel,
}: ExpenseDesktopRowProps) {
  const meta = CATEGORY_META[expense.category] || CATEGORY_META["Unknown"];

  return (
    <div
      className="group absolute top-0 left-0 w-full grid grid-cols-[110px_150px_1fr_130px_120px_28px] gap-2 items-center px-5 py-3.5 border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
      style={style}
      onClick={() => {
        if (!isEditing) onSelect();
      }}
    >
      <div className="text-[13px] font-medium">
        {format(new Date(expense.date), "MMM dd, yyyy")}
      </div>
      {isEditing && draft ? (
        <select
          onClick={(e) => e.stopPropagation()}
          value={draft.category}
          onChange={(e) => onDraftChange({ ...draft, category: e.target.value })}
          className="text-[12px] border border-border rounded-md px-1.5 py-1 bg-background outline-none focus:border-primary"
        >
          {EDITABLE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      ) : (
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11px] font-bold ${meta.badgeClass}`}
          >
            {expense.category}
          </span>
        </div>
      )}
      <div className="text-[13px] text-foreground truncate">
        {expense.description || "-"}
      </div>
      <div className="text-[13px] text-muted-foreground">
        {expense.payment_method}
      </div>
      {isEditing && draft ? (
        <div onClick={(e) => e.stopPropagation()}>
          <EditableNumberCell
            value={draft.amount}
            onCommit={(val) => onDraftChange({ ...draft, amount: val })}
            parse={parseFloat}
            step="0.01"
            widthClassName="w-24"
            autoFocus
          />
        </div>
      ) : (
        <div className="text-[14px] font-bold text-foreground text-right">
          {formatCurrency(expense.amount, currencyCode || "NGN")}
        </div>
      )}
      {isEditing ? (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onSave}
            className="p-1 rounded text-emerald-600 hover:bg-emerald-500/10"
            title="Save"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded text-muted-foreground hover:bg-muted"
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStartEdit();
          }}
          className="p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground transition-opacity"
          title="Quick edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
