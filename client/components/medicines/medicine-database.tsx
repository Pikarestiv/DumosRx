"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  Edit,
  Eye,
  AlertTriangle,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { AddMedicineDialog } from "./add-medicine-dialog";
import { MedicineDetailsDialog } from "./medicine-details-dialog";
import { insert } from "@/lib/db/local-database";
import { useLocalData } from "@/lib/db/hooks/useLocalData";

import { useStore } from "@/lib/context/store-context";

interface Medicine {
  id: string;
  name: string;
  genericName: string;
  brand: string;
  category: string;
  nafdacNumber: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  supplier: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  expiryDate: string;
  batchNumber: string;
  status: "active" | "inactive" | "expired" | "low_stock";
}

// Helper to transform API/Local response to UI model (camelCase)
const transformMedicine = (apiData: any): Medicine => ({
  id: apiData.id,
  name: apiData.name,
  genericName: apiData.generic_name || "",
  brand: apiData.brand_name || apiData.brand || "",
  category: apiData.category || apiData.category?.name || "Uncategorized",
  nafdacNumber: apiData.nafdac_number || "",
  strength: apiData.strength || "",
  dosageForm: apiData.dosage_form || "",
  manufacturer: apiData.manufacturer || "",
  supplier: apiData.supplier || apiData.supplier?.name || "Unknown",
  costPrice: Number(apiData.cost_price) || 0,
  sellingPrice: Number(apiData.selling_price) || 0,
  stockQuantity: Number(apiData.stock_quantity) || 0,
  reorderLevel: Number(apiData.reorder_level) || 0,
  expiryDate: apiData.expiry_date
    ? new Date(apiData.expiry_date).toISOString().split("T")[0]
    : "",
  batchNumber: apiData.batch_number || "",
  status: (apiData.status as any) || "active",
});

export function MedicineDatabase() {
  const { t, storeType } = useStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(
    null,
  );
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  const isPharmacy = storeType === "pharmacy";

  // Fetch medicines from local DB
  const {
    data: medicines,
    refetch,
  } = useLocalData<Medicine>(
    "SELECT * FROM medicines WHERE _deleted = 0 ORDER BY created_at DESC",
    [],
    { transform: transformMedicine },
  );

  const categories = isPharmacy 
    ? ["all", "Analgesics", "Antibiotics", "Antimalarials", "Vitamins", "Antacids"]
    : ["all", "Groceries", "Beverages", "Personal Care", "Household", "Snacks", "Dairy"];
    
  const statuses = ["all", "active", "inactive", "expired", "low_stock"];

  const handleAddMedicine = async (payload: any) => {
    try {
      // Create locally
      const localPayload = {
        ...payload,
        is_active: payload.status === "active" ? 1 : 0,
      };
      delete localPayload.status;

      insert("medicines", localPayload);

      toast.success(`${t('product')} added successfully`);
      refetch();
      setShowAddDialog(false);
    } catch (error) {
      console.error(`Failed to create ${t('product')}:`, error);
      toast.error(`Failed to save ${t('product')}.`);
    }
  };

  const filteredMedicines = medicines.filter((medicine) => {
    const matchesSearch =
      medicine.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      medicine.genericName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      medicine.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      medicine.nafdacNumber.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory =
      categoryFilter === "all" || medicine.category === categoryFilter;
    const matchesStatus =
      statusFilter === "all" || medicine.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getStatusBadge = (status: Medicine["status"]) => {
    const variants = {
      active: "default",
      inactive: "secondary",
      expired: "destructive",
      low_stock: "outline",
    } as const;

    const labels = {
      active: "Active",
      inactive: "Inactive",
      expired: "Expired",
      low_stock: "Low Stock",
    };

    return (
      <Badge variant={variants[status]} className="text-xs">
        {labels[status]}
      </Badge>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleViewDetails = (medicine: Medicine) => {
    setSelectedMedicine(medicine);
    setShowDetailsDialog(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif font-bold text-3xl text-foreground">
            {t('products')} Database
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your store's {t('products').toLowerCase()} inventory and information
          </p>
        </div>
        <Button
          onClick={() => setShowAddDialog(true)}
          className="bg-accent hover:bg-accent/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add {t('product')}
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total {t('products')}</p>
                <p className="text-2xl font-bold">{medicines.length}</p>
              </div>
              <div className="h-8 w-8 bg-accent/10 rounded-full flex items-center justify-center">
                <Search className="h-4 w-4 text-accent" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Active {t('products')}
                </p>
                <p className="text-2xl font-bold">
                  {medicines.filter((m) => m.status === "active").length}
                </p>
              </div>
              <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center">
                <Eye className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Low Stock</p>
                <p className="text-2xl font-bold text-destructive">
                  {medicines.filter((m) => m.status === "low_stock").length}
                </p>
              </div>
              <div className="h-8 w-8 bg-destructive/10 rounded-full flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expired</p>
                <p className="text-2xl font-bold text-destructive">
                  {medicines.filter((m) => m.status === "expired").length}
                </p>
              </div>
              <div className="h-8 w-8 bg-destructive/10 rounded-full flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">
            Search & Filter
          </CardTitle>
          <CardDescription>
            Find {t('products').toLowerCase()} by name, brand, {t('registration_number').toLowerCase()}, or other criteria
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={`Search ${t('products').toLowerCase()}, brands, ${t('registration_number').toLowerCase()}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder={t('category')} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category === "all" ? `All ${t('category')}s` : category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === "all"
                      ? "All Status"
                      : status.replace("_", " ").toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Medicine Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-semibold">
            {t('products')} Inventory
          </CardTitle>
          <CardDescription>
            Showing {filteredMedicines.length} of {medicines.length} {t('products').toLowerCase()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('product')} Name</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>{t('category')}</TableHead>
                  <TableHead>{t('registration_number')}</TableHead>
                  <TableHead>Size / Strength</TableHead>
                  <TableHead>{t('stock')}</TableHead>
                  <TableHead>Cost Price</TableHead>
                  <TableHead>Selling Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMedicines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <Package className="h-8 w-8 mb-2 opacity-50" />
                        <p className="font-medium">No {t('products').toLowerCase()} found</p>
                        <p className="text-sm">
                          {medicines.length === 0
                            ? `Add your first ${t('product').toLowerCase()} to get started`
                            : "Try adjusting your search or filters"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMedicines.map((medicine) => (
                    <TableRow key={medicine.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{medicine.name}</div>
                          {isPharmacy && medicine.genericName && (
                            <div className="text-sm text-muted-foreground">
                              {medicine.genericName}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{medicine.brand}</TableCell>
                      <TableCell>{medicine.category}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {medicine.nafdacNumber}
                      </TableCell>
                      <TableCell>{medicine.strength}</TableCell>
                      <TableCell>
                        <div
                          className={
                            medicine.stockQuantity <= medicine.reorderLevel
                              ? "text-destructive font-medium"
                              : ""
                          }
                        >
                          {medicine.stockQuantity}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Min: {medicine.reorderLevel}
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatCurrency(medicine.costPrice)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(medicine.sellingPrice)}
                      </TableCell>
                      <TableCell>{getStatusBadge(medicine.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(medicine)}
                          >
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

      {/* Dialogs */}
      <AddMedicineDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAddMedicine={handleAddMedicine}
      />

      <MedicineDetailsDialog
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        medicine={selectedMedicine}
      />
    </div>
  );
}
