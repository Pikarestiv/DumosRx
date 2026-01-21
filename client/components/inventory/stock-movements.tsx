"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Download,
  ArrowUpCircle,
  ArrowDownCircle,
  RotateCcw,
  PackageX,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";

interface StockMovement {
  id: string;
  date: string;
  medicine: string;
  type: "in" | "out" | "adjustment";
  quantity: number;
  reason: string;
  reference: string;
  user: string;
  supplier?: string;
  batchNumber?: string;
}

export function StockMovements() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  useEffect(() => {
    async function fetchMovements() {
      setLoading(true);
      try {
        const res = await apiClient.getStockMovements(1, 100);
        const items = (res.data || []).map((m: any) => ({
          id: m.id,
          date: m.created_at || m.date,
          medicine: m.medicine?.name || m.medicine_name || "Unknown",
          type: m.type || "adjustment",
          quantity: m.quantity || 0,
          reason: m.reason || "",
          reference: m.reference || "",
          user: m.user?.name || m.user_name || "System",
          supplier: m.supplier?.name || m.supplier_name,
          batchNumber: m.batch_number,
        }));
        setMovements(items);
      } catch (error) {
        console.error("Failed to fetch stock movements:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchMovements();
  }, []);

  const filteredMovements = movements.filter((movement) => {
    const matchesSearch =
      movement.medicine.toLowerCase().includes(searchTerm.toLowerCase()) ||
      movement.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
      movement.reason.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = typeFilter === "all" || movement.type === typeFilter;

    const matchesDate =
      dateFilter === "all" || checkDateFilter(movement.date, dateFilter);

    return matchesSearch && matchesType && matchesDate;
  });

  function checkDateFilter(date: string, filter: string): boolean {
    const movementDate = new Date(date);
    const now = new Date();
    const daysDiff = Math.floor(
      (now.getTime() - movementDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    switch (filter) {
      case "today":
        return daysDiff === 0;
      case "week":
        return daysDiff <= 7;
      case "month":
        return daysDiff <= 30;
      default:
        return true;
    }
  }

  const getMovementIcon = (type: StockMovement["type"]) => {
    switch (type) {
      case "in":
        return <ArrowUpCircle className="h-4 w-4 text-green-600" />;
      case "out":
        return <ArrowDownCircle className="h-4 w-4 text-red-600" />;
      case "adjustment":
        return <RotateCcw className="h-4 w-4 text-blue-600" />;
    }
  };

  const getMovementBadge = (type: StockMovement["type"]) => {
    const variants = {
      in: "default",
      out: "destructive",
      adjustment: "secondary",
    } as const;

    const labels = {
      in: "Stock In",
      out: "Stock Out",
      adjustment: "Adjustment",
    };

    return (
      <Badge variant={variants[type]} className="text-xs">
        {labels[type]}
      </Badge>
    );
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-10 w-24" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">
            Stock Movement History
          </CardTitle>
          <CardDescription>
            Track all inventory movements and transactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search movements, medicines, references..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Movement Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="in">Stock In</SelectItem>
                <SelectItem value="out">Stock Out</SelectItem>
                <SelectItem value="adjustment">Adjustments</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="flex items-center gap-2 bg-transparent cursor-pointer"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Movements Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">
            Movement Records
          </CardTitle>
          <CardDescription>
            Showing {filteredMovements.length} of {movements.length} movements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Supplier/Batch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <PackageX className="h-8 w-8 mb-2 opacity-50" />
                        <p className="font-medium">No stock movements found</p>
                        <p className="text-sm">
                          {movements.length === 0
                            ? "Stock movements will appear here as they happen"
                            : "Try adjusting your search or filters"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMovements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">
                            {formatDateTime(movement.date)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{movement.medicine}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getMovementIcon(movement.type)}
                          {getMovementBadge(movement.type)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div
                          className={`font-medium ${
                            movement.quantity > 0
                              ? "text-green-600"
                              : movement.quantity < 0
                                ? "text-red-600"
                                : "text-blue-600"
                          }`}
                        >
                          {movement.quantity > 0 ? "+" : ""}
                          {movement.quantity}
                        </div>
                      </TableCell>
                      <TableCell>{movement.reason}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {movement.reference}
                        </code>
                      </TableCell>
                      <TableCell>{movement.user}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {movement.supplier && (
                            <div className="font-medium">
                              {movement.supplier}
                            </div>
                          )}
                          {movement.batchNumber && (
                            <div className="text-muted-foreground">
                              Batch: {movement.batchNumber}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
