import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit2, Trash2, Loader2, Store as StoreIcon } from "lucide-react";
import type { FleetStore } from "@/lib/types/store";

interface FleetListProps {
  stores: FleetStore[];
  isLoading: boolean;
  activeStoreId: string | null;
  onEdit: (store: FleetStore) => void;
  onDelete: (id: string, name: string) => void;
}

function NoStoresRow() {
  return (
    <TableRow>
      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
        <StoreIcon className="w-6 h-6 mx-auto mb-2 opacity-30" />
        No stores found.
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
}: FleetListProps) {
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
        {isLoading && (
          <TableRow>
            <TableCell colSpan={4} className="h-24 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
            </TableCell>
          </TableRow>
        )}
        {!isLoading && stores.length === 0 && <NoStoresRow />}
        {!isLoading &&
          stores.map((store) => {
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
