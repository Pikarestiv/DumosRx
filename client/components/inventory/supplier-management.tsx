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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  Edit,
  Eye,
  Users,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { useStore } from "@/lib/context/store-context";

interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  status: "active" | "inactive";
  totalOrders: number;
  totalValue: number;
  lastOrderDate: string;
  paymentTerms: string;
  rating: number;
}

// Helper to transform API response (snake_case) to UI model (camelCase)
const transformSupplier = (apiData: any): Supplier => ({
  id: apiData.id,
  name: apiData.name,
  contactPerson: apiData.contact_person || "",
  email: apiData.email || "",
  phone: apiData.phone || "",
  address: apiData.address || "",
  city: apiData.city || "",
  state: apiData.state || "",
  status: apiData.is_active ? "active" : "inactive",
  totalOrders: 0, // Mock for now
  totalValue: 0, // Mock for now
  lastOrderDate: new Date().toISOString(), // Mock for now
  paymentTerms: apiData.payment_terms || "30 days",
  rating: isNaN(Number(apiData.rating)) ? 5.0 : Number(apiData.rating),
});

export function SupplierManagement() {
  const { t } = useStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [_loading, setLoading] = useState(true);

  // Fetch suppliers on mount
  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getSuppliers(1, 100);
      const data = response.data || [];
      const transformed = data.map(transformSupplier);
      setSuppliers(transformed);
    } catch (error) {
      console.error("Failed to fetch suppliers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSupplier = async (payload: any) => {
    try {
      const response = await apiClient.createSupplier(payload);
      const newSupplier = transformSupplier(response);
      setSuppliers([newSupplier, ...suppliers]);
      setShowAddDialog(false);
    } catch (error) {
      console.error("Failed to create supplier:", error);
      alert("Failed to create supplier. Check console.");
    }
  };

  const filteredSuppliers = suppliers.filter(
    (supplier) =>
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.city.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: Supplier["status"]) => {
    return (
      <Badge
        variant={status === "active" ? "default" : "secondary"}
        className="text-xs"
      >
        {status === "active" ? "Active" : "Inactive"}
      </Badge>
    );
  };

  const getRatingStars = (rating: number) => {
    const safeRating = isNaN(rating) ? 0 : Math.min(5, Math.max(0, rating));
    return (
      "★".repeat(Math.floor(safeRating)) +
      "☆".repeat(5 - Math.floor(safeRating))
    );
  };

  const activeSuppliers = suppliers.filter((s) => s.status === "active").length;
  const totalSupplierValue = suppliers.reduce(
    (sum, supplier) => sum + supplier.totalValue,
    0,
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Suppliers</p>
                <p className="text-2xl font-bold">{suppliers.length}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-lg font-semibold text-primary">
                  {activeSuppliers}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Total Purchase Value
                </p>
                <p className="text-2xl font-bold">
                  {formatCurrency(totalSupplierValue)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Average Rating</p>
                <p className="text-2xl font-bold">
                  {(
                    suppliers.reduce((sum, s) => sum + s.rating, 0) /
                    suppliers.length
                  ).toFixed(1)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Stars</p>
                <p className="text-lg">
                  {getRatingStars(
                    suppliers.reduce((sum, s) => sum + s.rating, 0) /
                      suppliers.length,
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-serif font-semibold">
                Supplier Management
              </CardTitle>
              <CardDescription>
                Manage your {t('store').toLowerCase()} suppliers and vendors
              </CardDescription>
            </div>
            <Button
              className="bg-accent hover:bg-accent/90"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Supplier
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search suppliers, contacts, locations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suppliers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">
            Supplier Directory
          </CardTitle>
          <CardDescription>
            Showing {filteredSuppliers.length} of {suppliers.length} suppliers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier Details</TableHead>
                  <TableHead>Contact Information</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Last Order</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <Users className="h-8 w-8 mb-2 opacity-50" />
                        <p className="font-medium">No suppliers found</p>
                        <p className="text-sm">
                          {suppliers.length === 0
                            ? "Add your first supplier to get started"
                            : "Try adjusting your search"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{supplier.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {supplier.contactPerson}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Terms: {supplier.paymentTerms}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {supplier.email && (
                            <div className="flex items-center gap-1 text-sm">
                              <Mail className="h-3 w-3" />
                              <span className="text-xs">{supplier.email}</span>
                            </div>
                          )}
                          {supplier.phone && (
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="h-3 w-3" />
                              <span className="text-xs">{supplier.phone}</span>
                            </div>
                          )}
                          {!supplier.email && !supplier.phone && (
                            <span className="text-xs text-muted-foreground">
                              -
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-1">
                          <MapPin className="h-3 w-3 mt-0.5" />
                          <div className="text-sm">
                            <div>{supplier.city}</div>
                            <div className="text-xs text-muted-foreground">
                              {supplier.state}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(supplier.status)}</TableCell>
                      <TableCell>
                        <div className="text-center font-medium">
                          {supplier.totalOrders}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {formatCurrency(supplier.totalValue)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatDate(supplier.lastOrderDate)}
                      </TableCell>
                      <TableCell>
                        <div className="text-center">
                          <div className="font-medium">{supplier.rating}</div>
                          <div className="text-xs text-yellow-600">
                            {getRatingStars(supplier.rating)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
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

      <AddSupplierDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAddSupplier={handleAddSupplier}
      />
    </div>
  );
}
