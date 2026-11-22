"use client";

import { Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import { useSortableData } from "@/lib/hooks/use-sortable-data";
import { formatCurrency } from "@/lib/utils";
import type { Service } from "@/lib/types/service";

type ServiceSortKey = "name" | "code" | "category" | "price" | "status";

const SERVICE_SORT_ACCESSORS: Record<ServiceSortKey, (service: Service) => string | number> = {
  name: (service) => service.name.toLowerCase(),
  code: (service) => (service.code ?? "").toLowerCase(),
  category: (service) => (service.category ?? "").toLowerCase(),
  price: (service) => Number(service.price) || 0,
  status: (service) => (service.is_active ? 0 : 1),
};

const SORTABLE_COLUMNS: { key: ServiceSortKey; label: string; thClass: string; buttonClass: string }[] = [
  { key: "name", label: "Service Name", thClass: "", buttonClass: "" },
  { key: "code", label: "Code", thClass: "", buttonClass: "" },
  { key: "category", label: "Category", thClass: "", buttonClass: "" },
  { key: "price", label: "Price", thClass: "text-right", buttonClass: "ml-auto" },
  { key: "status", label: "Status", thClass: "text-center", buttonClass: "mx-auto" },
];

interface ServicesListProps {
  services: Service[];
  currencyCode?: string;
  onEdit?: (service: Service) => void;
  onDelete?: (service: Service) => void;
}

function ServiceRowActions({ srv, onEdit, onDelete }: { srv: Service } & Pick<ServicesListProps, "onEdit" | "onDelete">) {
  return (
    <>
      {onEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => onEdit(srv)}
          aria-label={`Edit ${srv.name}`}
        >
          <Edit className="h-3.5 w-3.5" />
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(srv)}
          aria-label={`Delete ${srv.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </>
  );
}

export function ServicesList({
  services,
  currencyCode,
  onEdit,
  onDelete,
}: ServicesListProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const capsClass = useUppercaseDisplayClass();
  const { sortKey, direction, toggleSort, sortedData } = useSortableData(services, SERVICE_SORT_ACCESSORS);

  if (!isDesktop) {
    return (
      <div className="pb-3 sm:p-4 space-y-2.5">
        {sortedData.map((srv) => (
          <div
            key={srv.id}
            data-service-card-mobile
            className="p-3.5 bg-card border border-border rounded-xl hover:bg-muted/30 transition-colors shadow-sm space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <div className={`font-semibold text-foreground text-[15px] leading-snug line-clamp-2 ${capsClass}`}>
                  {srv.name}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                  {srv.code && <span className="font-mono">{srv.code}</span>}
                  {srv.code && srv.category && <span>•</span>}
                  <span className={capsClass}>{srv.category || "Uncategorized"}</span>
                </div>
                {srv.description && (
                  <div className="text-[11.5px] text-muted-foreground/80 mt-1 line-clamp-2">
                    {srv.description}
                  </div>
                )}
              </div>
              {srv.is_active ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground shrink-0">
                  Inactive
                </span>
              )}
            </div>
            <div className="pt-2.5 border-t border-border/50 flex items-center justify-between gap-2">
              <div className="font-bold text-[15px] text-foreground tabular-nums">
                {formatCurrency(srv.price, currencyCode)}
              </div>
              <div className="flex items-center gap-1">
                <ServiceRowActions srv={srv} onEdit={onEdit} onDelete={onDelete} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold">
          <tr>
            {SORTABLE_COLUMNS.map((column) => (
              <th key={column.key} className={`py-3 px-4 ${column.thClass}`}>
                <SortableHeaderCell
                  label={column.label}
                  active={sortKey === column.key}
                  direction={direction}
                  onClick={() => toggleSort(column.key)}
                  className={column.buttonClass}
                />
              </th>
            ))}
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {sortedData.map((srv) => (
            <tr key={srv.id} className="hover:bg-muted/20 transition-colors">
              <td className="py-3 px-4 font-medium text-foreground">
                <div className={capsClass}>{srv.name}</div>
                {srv.description && (
                  <div className="text-[11px] text-muted-foreground line-clamp-1">
                    {srv.description}
                  </div>
                )}
              </td>
              <td className="py-3 px-4 text-muted-foreground font-mono">
                {srv.code || "—"}
              </td>
              <td className="py-3 px-4">
                {srv.category ? (
                  <span className={`inline-flex px-2 py-0.5 rounded-md bg-muted text-[11px] font-medium ${capsClass}`}>
                    {srv.category}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-3 px-4 text-right font-semibold text-foreground">
                {formatCurrency(srv.price, currencyCode)}
              </td>
              <td className="py-3 px-4 text-center">
                {srv.is_active ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-muted text-muted-foreground">
                    Inactive
                  </span>
                )}
              </td>
              <td className="py-3 px-4 text-right">
                <div className="flex items-center justify-end gap-1">
                  <ServiceRowActions srv={srv} onEdit={onEdit} onDelete={onDelete} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
