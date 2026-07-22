"use client";

import { useState, useEffect } from "react";
import { 
  getRequestedProducts, 
  markRequestedProductAsOrdered, 
  deleteRequestedProduct, 
  RequestedProduct 
} from "@/lib/db/requested-products-queries";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, Search, Trash2, Clock } from "lucide-react";
import { genericFuzzySearch } from "@/lib/utils/search";

export function RequestedProductsTab() {
  const [requests, setRequests] = useState<RequestedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await getRequestedProducts('all');
      setRequests(data);
    } catch (error) {
      console.error("Failed to fetch requested products:", error);
      toast.error("Could not load requested products");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsOrdered = async (id: string) => {
    try {
      await markRequestedProductAsOrdered(id);
      toast.success("Marked as ordered");
      fetchRequests();
    } catch (error) {
      console.error("Failed to mark as ordered:", error);
      toast.error("An error occurred");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRequestedProduct(id);
      toast.success("Request removed");
      fetchRequests();
    } catch (error) {
      console.error("Failed to delete request:", error);
      toast.error("An error occurred");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const { results: filteredRequests } = genericFuzzySearch(
    searchQuery,
    requests,
    ["product_name", "requested_by_customer"]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="w-5 h-5 text-muted-foreground" />
          Requested Products Log
        </h3>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search requested items..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product Name</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead>Request Count</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24">
                  Loading requests...
                </TableCell>
              </TableRow>
            )}
            {!loading && filteredRequests.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                  No requested products found.
                </TableCell>
              </TableRow>
            )}
            {!loading && filteredRequests.length > 0 && filteredRequests.map((req) => (
              <TableRow key={req.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {req.product_name}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(req.product_name)}
                      title="Copy to clipboard"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {req.requested_by_customer || "Anonymous"}
                </TableCell>
                <TableCell>
                  <Badge variant={req.request_count > 3 ? "destructive" : "secondary"}>
                    {req.request_count} {req.request_count === 1 ? 'time' : 'times'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={req.status === 'pending' ? 'outline' : 'default'} className={req.status === 'ordered' ? 'bg-green-500/10 text-green-600 border-green-200' : 'bg-amber-500/10 text-amber-600 border-amber-200'}>
                    {req.status === 'pending' ? 'Pending' : 'Ordered'}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(req.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {req.status === 'pending' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMarkAsOrdered(req.id)}
                        title="Mark as ordered"
                      >
                        <Check className="h-4 w-4 mr-1 text-green-500" />
                        Mark Ordered
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(req.id)}
                      title="Delete request"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
