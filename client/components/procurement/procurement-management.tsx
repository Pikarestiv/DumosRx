"use client";

import { useState, useEffect } from "react";
import { 
  Plus, 
  Search, 
  FileText, 
  CheckCircle2, 
  Clock, 
  MoreHorizontal,
  ChevronRight,
  Truck,
  ArrowRight,
  Pill,
  Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import { getPurchaseOrders, receivePurchaseOrder } from "@/lib/db/local-database";
import { toast } from "sonner";
import { CreatePODialog } from "./create-po-dialog";
import { useStore } from "@/lib/context/store-context";

export function ProcurementManagement() {
  const { t, storeType } = useStore();
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const ProductIcon = storeType === 'pharmacy' ? Pill : Package;

  useEffect(() => {
    fetchPurchaseOrders();
  }, [activeTab]);

  const fetchPurchaseOrders = async () => {
    setLoading(true);
    try {
      const { data } = await getPurchaseOrders(1, 100);
      setPurchaseOrders(data);
    } catch (error) {
      console.error("Failed to fetch POs:", error);
      toast.error("Could not load purchase orders");
    } finally {
      setLoading(false);
    }
  };

  const handleReceivePO = async (id: string) => {
    try {
      await receivePurchaseOrder(id);
      toast.success("Order received and stock updated!");
      fetchPurchaseOrders();
    } catch (error) {
      console.error("Failed to receive PO:", error);
      toast.error("Error receiving order");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "received":
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Received</Badge>;
      case "sent":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20"><ArrowRight className="w-3 h-3 mr-1" /> Sent</Badge>;
      case "draft":
        return <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/20"><Clock className="w-3 h-3 mr-1" /> Draft</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredOrders = purchaseOrders.filter(po => {
    const matchesSearch = po.vendor_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          po.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "all" || po.status === activeTab;
    return matchesSearch && matchesTab;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-3xl text-foreground">Procurement</h1>
          <p className="text-muted-foreground">Manage vendor purchase orders and inventory replenishment</p>
        </div>
        <CreatePODialog onPOIconCreated={fetchPurchaseOrders} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/10">
          <CardHeader className="pb-2">
            <CardDescription>Open Orders</CardDescription>
            <CardTitle className="text-2xl">{purchaseOrders.filter(p => p.status !== 'received').length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-emerald-500/5 border-emerald-500/10">
          <CardHeader className="pb-2">
            <CardDescription>Total Procurement Value</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(purchaseOrders.reduce((sum, p) => sum + p.total_amount, 0))}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-blue-500/5 border-blue-500/10">
          <CardHeader className="pb-2">
            <CardDescription>Active Vendors</CardDescription>
            <CardTitle className="text-2xl">{new Set(purchaseOrders.map(p => p.vendor_id)).size}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-accent/20 shadow-xl bg-card/50 backdrop-blur-sm">
        <CardHeader className="border-b border-accent/10 pb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <Tabs defaultValue="all" className="w-full md:w-auto" onValueChange={setActiveTab}>
              <TabsList className="bg-muted/50">
                <TabsTrigger value="all">All Orders</TabsTrigger>
                <TabsTrigger value="draft">Drafts</TabsTrigger>
                <TabsTrigger value="sent">Sent</TabsTrigger>
                <TabsTrigger value="received">Received</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search vendor or PO#..." 
                className="pl-10 bg-muted/30"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-accent/10">
                <TableHead className="w-[100px]">PO Number</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <Clock className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" />
                    Loading orders...
                  </TableCell>
                </TableRow>
              ) : filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No purchase orders found
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((po) => (
                  <TableRow key={po.id} className="border-accent/5 hover:bg-accent/5 transition-colors group">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      #{po.id.split('-')[0].toUpperCase()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold uppercase">
                          {po.vendor_name[0]}
                        </div>
                        <span className="font-medium">{po.vendor_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(po.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-bold">
                      {formatCurrency(po.total_amount)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(po.status)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="hover:bg-accent/20">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-card border-accent/20">
                          <DropdownMenuLabel>PO Actions</DropdownMenuLabel>
                          <DropdownMenuItem className="cursor-pointer">
                            <FileText className="w-4 h-4 mr-2" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {po.status === "draft" && (
                            <DropdownMenuItem className="cursor-pointer text-blue-500">
                              <ArrowRight className="w-4 h-4 mr-2" /> Mark as Sent
                            </DropdownMenuItem>
                          )}
                          {po.status === "sent" && (
                            <DropdownMenuItem 
                              className="cursor-pointer text-emerald-500 font-bold"
                              onClick={() => handleReceivePO(po.id)}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-2" /> Receive Goods
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive cursor-pointer">
                            Cancel Order
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
