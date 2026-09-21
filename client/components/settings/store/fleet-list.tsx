import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Edit2, Trash2, Store as StoreIcon } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import { EmptyState } from "@/components/ui/empty-state";
import type { FleetStore } from "@/lib/types/store";

interface FleetListProps {
  stores: FleetStore[];
  isLoading: boolean;
  activeStoreId: string | null;
  onEdit: (store: FleetStore) => void;
  onDelete: (id: string, name: string) => void;
  onAddStore?: () => void;
}

function NoStoresRow({
  canManageFleet,
  onAddStore,
}: {
  canManageFleet: boolean;
  onAddStore?: () => void;
}) {
  return (
    <TableRow>
      <TableCell colSpan={4} className="h-24">
        <EmptyState
          icon={StoreIcon}
          title="No stores found"
          action={
            canManageFleet && onAddStore
              ? { label: "Add Store", onClick: onAddStore }
              : undefined
          }
        />
      </TableCell>
    </TableRow>
  );
}

export function FleetList({
  stores,
  isLoading,
  activeStoreId,
  onEdit,
  onDelete,
  onAddStore,
}: FleetListProps) {
  const { user } = useAuth();
  const canManageFleet =
    user?.role === "store_owner" || user?.role === "super_admin";
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && stores.length === 0 && (
          <>
            {Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
              </TableRow>
            ))}
          </>
        )}
        {!isLoading && stores.length === 0 && (
          <NoStoresRow canManageFleet={canManageFleet} onAddStore={onAddStore} />
        )}
        {stores.map((store) => {
            const isActiveStore = store.id === activeStoreId;
            return (
              <TableRow key={store.id}>
                <TableCell className="font-medium">{store.name}</TableCell>
                <TableCell>{store.location || "—"}</TableCell>
                <TableCell className="capitalize">{store.store_type || "—"}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(store)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isActiveStore}
                    title={
                      isActiveStore
                        ? "Cannot delete the store this device is currently operating"
                        : undefined
                    }
                    onClick={() => onDelete(store.id, store.name)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
      </TableBody>
    </Table>
  );
}
