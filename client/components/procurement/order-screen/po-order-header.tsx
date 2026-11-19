"use client";

import { ArrowLeft, Download, Loader2, MoreHorizontal, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFormatCurrency } from "@/lib/hooks/use-format-currency";
import { PoSaveStatus } from "./po-save-status";
import type { AutosaveState } from "@/lib/utils/autosave-scheduler";

export interface PoOrderHeaderProps {
  compact: boolean;
  title: string;
  totalAmount: number;
  saveState: AutosaveState;
  persisted: boolean;
  pendingWrites: number;
  isWalkIn: boolean;
  isDraft: boolean;
  canReceive: boolean;
  canUndo: boolean;
  readOnly: boolean;
  isBusy: boolean;
  isGeneratingPdf: boolean;
  onBack: () => void;
  onSaveNow: () => void;
  onUndo: () => void;
  onDownloadPdf: () => void;
  onReceive: () => void;
  onSend: () => void;
  onDelete: () => void;
}

export function PoOrderHeader(props: PoOrderHeaderProps) {
  const formatCurrency = useFormatCurrency();
  const size = props.compact
    ? "h-9 px-3 rounded-[10px] text-[12.5px] font-semibold"
    : "h-10 px-5 rounded-[10px] text-[13px] font-bold";
  const showSend = props.isDraft && !props.isWalkIn && !props.readOnly;
  const showReceive = props.canReceive && !props.readOnly;

  return (
    <div
      className={`flex flex-wrap items-center gap-3 border-b border-border bg-card shrink-0 ${props.compact ? "px-4 pb-3" : "px-6 pb-5"}`}
      style={{ paddingTop: "calc(var(--tauri-top, env(safe-area-inset-top, 0px)) + 1.25rem)" }}
    >
      <button
        type="button"
        aria-label="Back"
        className="w-[38px] h-[38px] rounded-[10px] bg-muted flex items-center justify-center text-muted-foreground shrink-0 hover:bg-muted/80 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        onClick={props.onBack}
      >
        <ArrowLeft className="w-[17px] h-[17px]" />
      </button>
      <div className="min-w-0">
        <div className={`${props.compact ? "text-[15px]" : "text-[17px]"} font-serif font-bold leading-tight`}>{props.title}</div>
        <PoSaveStatus
          saveState={props.saveState}
          persisted={props.persisted}
          pendingWrites={props.pendingWrites}
          onSaveNow={props.onSaveNow}
        />
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {!props.compact && (
          <div className="text-right mr-2">
            <div className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide">Estimated total</div>
            <div className="text-[15px] font-bold font-serif text-primary leading-tight">{formatCurrency(props.totalAmount)}</div>
          </div>
        )}
        {props.canUndo && !props.readOnly && (
          <Button variant="ghost" size="icon" aria-label="Undo last change" title="Undo (Ctrl+Z)" onClick={props.onUndo}>
            <Undo2 className="h-4 w-4" />
          </Button>
        )}
        <Button variant="outline" className={size} aria-label="Download PDF" onClick={props.onDownloadPdf} disabled={props.isGeneratingPdf || !props.persisted}>
          {props.isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {props.compact ? "PDF" : "Download PDF"}
        </Button>
        {showReceive && (
          <Button variant={props.isWalkIn || !props.isDraft ? "default" : "outline"} className={size} onClick={props.onReceive} disabled={props.isBusy || !props.persisted}>
            Receive stock
          </Button>
        )}
        {showSend && (
          <Button className={size} onClick={props.onSend} disabled={props.isBusy || !props.persisted}>
            Send to vendor
          </Button>
        )}
        {props.persisted && !props.readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More order actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="h-11 text-destructive" onSelect={props.onDelete}>
                <Trash2 className="h-4 w-4" />
                {props.isDraft ? "Delete draft" : "Delete order"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
