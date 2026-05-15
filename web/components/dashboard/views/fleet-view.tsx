"use client";

import { Plus, Circle, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FleetViewProps {
  stores: any[];
}

export function FleetView({ stores }: FleetViewProps) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Store Fleet</h1>
          <p className="text-muted-foreground">Manage and monitor all your connected pharmacy locations</p>
        </div>
        <Button className="font-bold">
          <Plus className="h-4 w-4 mr-2" />
          Register New Store
        </Button>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle>Connected Store Instances</CardTitle>
          <CardDescription>Live status and sales performance across your entire network.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-muted text-xs font-bold uppercase">
                <TableHead>Store Name</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Location</TableHead>
                <TableHead className="text-center">Last Sync</TableHead>
                <TableHead className="text-right">Daily Sales</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((store: any) => (
                <TableRow key={store.id} className="border-muted hover:bg-muted/30">
                  <TableCell className="font-bold py-4">
                    <div className="flex flex-col">
                      <span>{store.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{store.id}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={`${store.status === "online" ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-500 border-slate-200"} font-bold`}
                    >
                      <Circle className={`h-2 w-2 mr-2 fill-current ${store.status === "online" ? "text-green-500" : "text-slate-300"}`} />
                      {store.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm font-medium">{store.location || "Nigeria"}</TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">{store.lastSync}</TableCell>
                  <TableCell className="text-right font-black">{store.sales}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
