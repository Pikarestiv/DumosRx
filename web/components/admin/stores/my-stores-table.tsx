"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RegisteredStoreSummary } from "@/lib/types/admin";

const PLAN_LABELS = new Map([
  ["free", "Free"],
  ["starter", "Starter"],
  ["pro", "Dumos Pro"],
  ["enterprise", "Enterprise"],
]);

const planLabel = (plan: string) => PLAN_LABELS.get(plan) ?? plan;

export function MyStoresTable({
  stores,
}: {
  stores: RegisteredStoreSummary[];
}) {
  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Store</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Registered</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stores.map((store) => (
            <TableRow key={store.id}>
              <TableCell className="font-semibold">
                {store.name}
                {store.is_demo && (
                  <Badge variant="secondary" className="ml-2">
                    Demo
                  </Badge>
                )}
                {store.device_id && (
                  <div className="text-xs text-muted-foreground font-mono">
                    {store.device_id}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <div>{store.owner}</div>
                <div className="text-xs text-muted-foreground">
                  {store.email}
                </div>
              </TableCell>
              <TableCell>
                <div className="font-medium">{planLabel(store.plan)}</div>
                <div className="text-xs text-muted-foreground">
                  {store.plan_status === "active" && store.plan_ends_at
                    ? `Renews ${store.plan_ends_at}`
                    : store.plan_status}
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    store.status.toLowerCase() === "active"
                      ? "default"
                      : "destructive"
                  }
                >
                  {store.status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {store.date}
              </TableCell>
            </TableRow>
          ))}
          {stores.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center py-10 text-muted-foreground"
              >
                No stores registered under your account yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
