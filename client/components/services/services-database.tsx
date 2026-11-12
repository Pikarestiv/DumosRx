"use client";

import { useState, useMemo } from "react";
import { Plus, Search, Sparkles, Edit, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useStore } from "@/lib/context/store-context";
import { formatCurrency } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import { getServices } from "@/lib/db/queries/services";
import { ServiceFormDialog } from "./service-form-dialog";
import { ServiceDeleteDialog } from "./service-delete-dialog";
import type { Service } from "@/lib/types/service";

export function ServicesDatabase() {
  const { activeStoreId, storeProfile } = useStore();
  const currencyCode = storeProfile?.currency;

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);

  const { data: rawServices = [], isLoading } = useQuery({
    ...queryKeys.services.all(),
    queryFn: () => getServices({ storeId: activeStoreId, activeOnly: false }),
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of rawServices) {
      if (s.category?.trim()) set.add(s.category.trim());
    }
    return Array.from(set).sort();
  }, [rawServices]);

  const filteredServices = useMemo(() => {
    return rawServices.filter((s) => {
      if (categoryFilter !== "all" && s.category !== categoryFilter)
        return false;
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "inactive" && s.is_active) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const mName = s.name.toLowerCase().includes(q);
        const mCode = s.code?.toLowerCase().includes(q);
        const mCat = s.category?.toLowerCase().includes(q);
        return mName || mCode || mCat;
      }
      return true;
    });
  }, [rawServices, categoryFilter, statusFilter, searchTerm]);

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setFormOpen(true);
  };

  const handleDelete = (service: Service) => {
    setServiceToDelete(service);
    setDeleteOpen(true);
  };

  const handleAdd = () => {
    setEditingService(null);
    setFormOpen(true);
  };

  const isFiltered = Boolean(
    searchTerm.trim() || categoryFilter !== "all" || statusFilter !== "all",
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {/* Top Filter & Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search services by name, code or category..."
              className="pl-9 h-10 bg-background"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-10 px-3 text-xs rounded-xl border border-border bg-background text-foreground"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | "active" | "inactive")
            }
            className="h-10 px-3 text-xs rounded-xl border border-border bg-background text-foreground"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <Button
            onClick={handleAdd}
            className="h-10 rounded-xl gap-1.5 shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Service</span>
          </Button>
        </div>
      </div>

      {/* Main Table / Grid Content */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
            Loading services catalog...
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Sparkles}
              title={
                rawServices.length === 0
                  ? "No services configured"
                  : "No services found"
              }
              description={
                rawServices.length === 0
                  ? "Add spa, styling, consultation, or clinic services to sell them at POS alongside physical products."
                  : "No services matched your active search or filters."
              }
              action={
                isFiltered
                  ? {
                      label: "Clear filters",
                      onClick: () => {
                        setSearchTerm("");
                        setCategoryFilter("all");
                        setStatusFilter("all");
                      },
                    }
                  : {
                      label: "Add Service",
                      onClick: handleAdd,
                    }
              }
            />
          </div>
        ) : (
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
                {filteredServices.map((srv) => (
                  <tr
                    key={srv.id}
                    className="hover:bg-muted/20 transition-colors"
                  >
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
                          onClick={() => handleEdit(srv)}
                          aria-label={`Edit ${srv.name}`}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(srv)}
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
        )}
      </div>

      <ServiceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        service={editingService}
      />

      <ServiceDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        service={serviceToDelete}
      />
    </div>
  );
}
