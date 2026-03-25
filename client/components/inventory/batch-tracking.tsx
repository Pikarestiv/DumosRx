"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";

export function BatchTracking() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: batches, loading } = useLocalData<any>(
    `SELECT i.*, m.name as medicine_name, m.brand as medicine_brand 
     FROM inventory i 
     JOIN medicines m ON i.medicine_id = m.id 
     WHERE i._deleted = 0 
     ORDER BY i.expiry_date ASC`
  );

  const filteredBatches = batches.filter(
    (b) =>
      b.medicine_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.batch_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getExpiryStatus = (date: string) => {
    const days = Math.ceil(
      (new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days <= 0) return { label: "Expired", variant: "destructive" as const };
    if (days <= 90) return { label: `${days} days left`, variant: "outline" as const };
    if (days <= 180) return { label: "Near Expiry", variant: "secondary" as const };
    return { label: "Healthy", variant: "default" as const };
  };

  const expiringSoonCount = batches.filter((b) => {
    const days = Math.ceil(
      (new Date(b.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return days > 0 && days <= 90;
  }).length;

  const expiredCount = batches.filter((b) => {
    const days = Math.ceil(
      (new Date(b.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return days <= 0;
  }).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-destructive/5 border-destructive/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive">Expired Batches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{expiredCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Requires immediate disposal</p>
          </CardContent>
        </Card>

        <Card className="bg-orange-500/5 border-orange-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-600">Expiring Soon (90d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{expiringSoonCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Monitor these items closely</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary">Total Active Batches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{batches.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Across all medicines</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Batch & Expiry Tracker</CardTitle>
              <CardDescription>Monitor stock expiration dates and batch performance</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search batches..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medicine</TableHead>
                <TableHead>Batch Number</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">Loading batches...</TableCell>
                </TableRow>
              ) : filteredBatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">No batches found.</TableCell>
                </TableRow>
              ) : (
                filteredBatches.map((batch) => {
                  const status = getExpiryStatus(batch.expiry_date);
                  return (
                    <TableRow key={batch.id}>
                      <TableCell>
                        <div className="font-medium">{batch.medicine_name}</div>
                        <div className="text-xs text-muted-foreground">{batch.medicine_brand}</div>
                      </TableCell>
                      <TableCell className="font-mono">{batch.batch_number}</TableCell>
                      <TableCell>{batch.quantity}</TableCell>
                      <TableCell>{new Date(batch.expiry_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">Adjust</Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
