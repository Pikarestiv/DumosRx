"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { query, softDelete } from "@/lib/db/local-database";
import { Button } from "@/components/ui/button";
import { Trash2, Building2, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

interface Vendor {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  payment_terms: string;
}

export function VendorList() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVendors = async () => {
    try {
      const data = await query<Vendor>(
        "SELECT * FROM suppliers WHERE _deleted = 0 ORDER BY name ASC"
      );
      setVendors(data);
    } catch (error) {
      console.error("Failed to fetch vendors:", error);
      toast.error("Failed to load vendors");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this vendor?")) return;

    try {
      await softDelete("suppliers", id);
      toast.success("Vendor deleted");
      fetchVendors();
    } catch (error) {
      console.error("Failed to delete vendor:", error);
      toast.error("Failed to delete vendor");
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center">Loading vendors...</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business Name</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Contact Info</TableHead>
                <TableHead>Terms</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Building2 className="h-8 w-8 opacity-20" />
                      <p>No vendors found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                vendors.map((vendor) => (
                  <TableRow key={vendor.id}>
                    <TableCell className="font-medium">
                      {vendor.name}
                    </TableCell>
                    <TableCell>{vendor.contact_person || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                        {vendor.phone && (
                          <div className="flex items-center gap-1 opacity-70">
                            <Phone className="h-3 w-3" /> {vendor.phone}
                          </div>
                        )}
                        {vendor.email && (
                          <div className="flex items-center gap-1 opacity-70">
                            <Mail className="h-3 w-3" /> {vendor.email}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{vendor.payment_terms || "-"}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(vendor.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
