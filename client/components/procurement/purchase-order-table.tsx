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
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
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
  isFuzzyFallback?: boolean;
}

export function PurchaseOrderTable({
  orders,
  loading,
  searchQuery,
  onSearchChange,
  activeTab,
  onTabChange,
  onReceivePO,
  isFuzzyFallback
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
    <Card className="rounded-[14px] border border-[#E6EAF2] bg-[#FFFFFF] shadow-[0_1px_2px_rgba(16,24,40,0.04)] flex flex-col flex-1 overflow-hidden">
      <div className="px-[22px] py-[18px] border-b border-[#E6EAF2] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-[16px] font-bold text-[#101828]">Purchase Orders</h3>
          <p className="text-[13px] text-[#667085] mt-0.5">Manage stock replenishments</p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-3">
          <Tabs value={activeTab} className="w-full md:w-auto" onValueChange={onTabChange}>
            <TabsList className="h-9 gap-2 bg-transparent">
              <TabsTrigger value="all" className="px-4 py-2 rounded-full text-[13px] font-semibold cursor-pointer border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=inactive]:text-muted-foreground data-[state=inactive]:bg-accent data-[state=inactive]:border-border shadow-none">All Orders</TabsTrigger>
              <TabsTrigger value="draft" className="px-4 py-2 rounded-full text-[13px] font-semibold cursor-pointer border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=inactive]:text-muted-foreground data-[state=inactive]:bg-accent data-[state=inactive]:border-border shadow-none">Drafts</TabsTrigger>
              <TabsTrigger value="sent" className="px-4 py-2 rounded-full text-[13px] font-semibold cursor-pointer border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=inactive]:text-muted-foreground data-[state=inactive]:bg-accent data-[state=inactive]:border-border shadow-none">Sent</TabsTrigger>
              <TabsTrigger value="received" className="px-4 py-2 rounded-full text-[13px] font-semibold cursor-pointer border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=inactive]:text-muted-foreground data-[state=inactive]:bg-accent data-[state=inactive]:border-border shadow-none">Received</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full md:w-[280px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4 pointer-events-none" />
            <Input 
              placeholder="Search vendor or PO#..." 
              className="pl-9 h-9 text-[13px] rounded-[10px] bg-[#F5F8FC] border-[#E6EAF2]"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="px-5 pt-4 pb-2">
          {isFuzzyFallback && orders.length > 0 && (
            <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-[13px] border border-amber-500/20 text-center font-medium rounded-md mb-2">
              Did you mean? (No exact matches found. Showing closest names.)
            </div>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-[#E6EAF2]">
              <TableHead className="w-[110px] text-[11px] font-bold text-[#98A2B3] uppercase tracking-wide h-11 align-middle">PO Number</TableHead>
              <TableHead className="text-[11px] font-bold text-[#98A2B3] uppercase tracking-wide h-11 align-middle">Vendor</TableHead>
              <TableHead className="w-[100px] text-[11px] font-bold text-[#98A2B3] uppercase tracking-wide h-11 align-middle">Date</TableHead>
              <TableHead className="w-[120px] text-[11px] font-bold text-[#98A2B3] uppercase tracking-wide h-11 align-middle">Amount</TableHead>
              <TableHead className="w-[100px] text-[11px] font-bold text-[#98A2B3] uppercase tracking-wide h-11 align-middle">Status</TableHead>
              <TableHead className="w-[80px] text-right text-[11px] font-bold text-[#98A2B3] uppercase tracking-wide h-11 align-middle"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <Clock className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" />
                  Loading orders...
                </TableCell>
              </TableRow>
            )}
            {!loading && orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No purchase orders found
                </TableCell>
              </TableRow>
            )}
            {!loading && orders.length > 0 && orders.map((po) => (
              <TableRow key={po.id} className="border-b border-[#E6EAF2]/50 hover:bg-[#F9FAFB] transition-colors group">
                <TableCell className="font-mono text-xs text-[#667085] py-[14px]">
                  #{po.id.split('-')[0].toUpperCase()}
                </TableCell>
                <TableCell className="py-[14px]">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-[#EAF0FE] flex items-center justify-center text-[#153C9E] text-xs font-bold uppercase">
                      {po.vendor_name ? po.vendor_name[0] : "V"}
                    </div>
                    <span className="text-[13.5px] font-semibold text-[#101828]">{po.vendor_name || "Unknown Vendor"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-[#667085] text-[13.5px] py-[14px]">
                  {formatDateToDDMMYYYY(po.created_at)}
                </TableCell>
                <TableCell className="font-bold text-[14px] text-[#101828] py-[14px]">
                  {formatCurrency(po.total_amount)}
                </TableCell>
                <TableCell className="py-[14px]">
                  {getStatusBadge(po.status)}
                </TableCell>
                <TableCell className="text-right py-[14px]">
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
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
