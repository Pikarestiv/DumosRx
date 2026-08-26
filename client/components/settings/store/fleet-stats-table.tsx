import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FleetStore } from "@/lib/types/store";

export function FleetStatsTable({ stores }: { stores: FleetStore[] }) {
  if (stores.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">No stores to show yet.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Store</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last Sync</TableHead>
          <TableHead className="text-right">Total Sales</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stores.map((store) => (
          <TableRow key={store.id}>
            <TableCell>
              <div className="font-medium">{store.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{store.id}</div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${store.status === "online" ? "bg-green-500" : "bg-slate-400"}`}
                />
                <span className="capitalize text-sm">{store.status ?? "unknown"}</span>
              </div>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{store.lastSync ?? "—"}</TableCell>
            <TableCell className="text-right font-semibold">{store.sales ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
