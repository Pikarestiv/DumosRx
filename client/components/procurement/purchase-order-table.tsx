"use client";

import { 
  Search, 
  FileText, 
  CheckCircle2, 
  Clock, 
  MoreHorizontal,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";

interface PurchaseOrderTableProps {
  orders: any[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onReceivePO: (id: string) => void;
}

export function PurchaseOrderTable({
  orders,
  loading,
  searchQuery,
  onSearchChange,
  activeTab,
  onTabChange,
  onReceivePO
}: PurchaseOrderTableProps) {
  
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

  return (
    <Card className="border-accent/20 shadow-xl bg-card/50 backdrop-blur-sm">
      <CardHeader className="border-b border-accent/10 pb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <Tabs value={activeTab} className="w-full md:w-auto" onValueChange={onTabChange}>
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
              onChange={(e) => onSearchChange(e.target.value)}
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
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No purchase orders found
                </TableCell>
              </TableRow>
            ) : (
              orders.map((po) => (
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
                            onClick={() => onReceivePO(po.id)}
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
  );
}
