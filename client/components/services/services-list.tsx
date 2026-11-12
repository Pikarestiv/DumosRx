"use client";

import { Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatCurrency } from "@/lib/utils";
import type { Service } from "@/lib/types/service";

interface ServicesListProps {
  services: Service[];
  currencyCode?: string;
  onEdit: (service: Service) => void;
  onDelete: (service: Service) => void;
}

export function ServicesList({
  services,
  currencyCode,
  onEdit,
  onDelete,
}: ServicesListProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");

  if (!isDesktop) {
    return (
      <div className="p-3 sm:p-4 space-y-2.5">
        {services.map((srv) => (
          <div
            key={srv.id}
            data-service-card-mobile
            className="flex items-center justify-between p-3.5 bg-card border border-border rounded-xl hover:bg-muted/30 transition-colors shadow-sm"
          >
            <div className="min-w-0 pr-3 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-sm truncate">
                  {srv.name}
                </span>
                {srv.is_active ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold bg-muted text-muted-foreground shrink-0">
                    Inactive
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate">
                {srv.code && <span className="font-mono">{srv.code}</span>}
                {srv.code && srv.category && <span>•</span>}
                <span>{srv.category || "Uncategorized"}</span>
              </div>
              {srv.description && (
                <div className="text-[11.5px] text-muted-foreground/80 mt-1 line-clamp-1">
                  {srv.description}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="text-right">
                <div className="font-bold text-sm text-foreground">
                  {formatCurrency(srv.price, currencyCode)}
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => onEdit(srv)}
                  aria-label={`Edit ${srv.name}`}
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(srv)}
                  aria-label={`Delete ${srv.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
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
            <th className="py-3 px-4">Service Name</th>
            <th className="py-3 px-4">Code</th>
            <th className="py-3 px-4">Category</th>
            <th className="py-3 px-4 text-right">Price</th>
            <th className="py-3 px-4 text-center">Status</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {services.map((srv) => (
            <tr key={srv.id} className="hover:bg-muted/20 transition-colors">
              <td className="py-3 px-4 font-medium text-foreground">
                <div>{srv.name}</div>
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
                  <span className="inline-flex px-2 py-0.5 rounded-md bg-muted text-[11px] font-medium">
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => onEdit(srv)}
                    aria-label={`Edit ${srv.name}`}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(srv)}
                    aria-label={`Delete ${srv.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
