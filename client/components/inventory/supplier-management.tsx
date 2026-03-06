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
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { useStore } from "@/lib/context/store-context";
import { SupplierStats } from "./supplier-stats";
import { SupplierTable } from "./supplier-table";

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
  totalOrders: 0,
  totalValue: 0,
  lastOrderDate: new Date().toISOString(),
  paymentTerms: apiData.payment_terms || "30 days",
  rating: isNaN(Number(apiData.rating)) ? 5.0 : Number(apiData.rating),
});

export function SupplierManagement() {
  const { t } = useStore();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [_loading, setLoading] = useState(true);

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
  
  const avgRating = suppliers.length > 0 
    ? suppliers.reduce((sum, s) => sum + s.rating, 0) / suppliers.length 
    : 0;

  return (
    <div className="space-y-6">
      <SupplierStats 
        totalSuppliers={suppliers.length}
        activeSuppliers={activeSuppliers}
        totalValue={totalSupplierValue}
        avgRating={avgRating}
        ratingStars={getRatingStars(avgRating)}
        formatCurrency={formatCurrency}
      />

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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search suppliers, contacts, locations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <SupplierTable 
        suppliers={filteredSuppliers}
        totalCount={suppliers.length}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
        getStatusBadge={getStatusBadge}
        getRatingStars={getRatingStars}
      />

      <AddSupplierDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAddSupplier={handleAddSupplier}
      />
    </div>
  );
}
