import {
  MoreVertical,
  ExternalLink,
  CreditCard,
  History,
  Ban,
  Mail,
  Store as StoreIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PharmacyTableProps {
  pharmacyList: any[];
  isLoading: boolean;
  handleImpersonate: (pharmacy: any) => void;
  handleViewBilling: (pharmacy: any) => void;
  setSelectedPharmacy: (pharmacy: any) => void;
  setIsSuspendDialogOpen: (open: boolean) => void;
  router: any;
}

export function PharmacyTable({
  pharmacyList,
  isLoading,
  handleImpersonate,
  handleViewBilling,
  setSelectedPharmacy,
  setIsSuspendDialogOpen,
  router,
}: PharmacyTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 pl-6 h-12">
            Pharmacy Details
          </TableHead>
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">
            Owner & Contact
          </TableHead>
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">
            Subscription
          </TableHead>
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">
            Fleet Size
          </TableHead>
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-right h-12">
            Total Revenue
          </TableHead>
          <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">
            Status
          </TableHead>
          <TableHead className="w-[80px] h-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pharmacyList.map((pharmacy: any) => (
          <TableRow
            key={pharmacy.id}
            className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-colors"
          >
            <TableCell className="pl-6 py-5">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center font-black text-indigo-500 border border-indigo-500/20 text-xs">
                  {pharmacy.name.charAt(0)}
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors">
                    {pharmacy.name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">
                    {pharmacy.id}
                  </span>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-bold text-sm text-slate-700 dark:text-slate-300">
                  {pharmacy.owner}
                </span>
                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Mail className="h-3 w-3" />
                  {pharmacy.email}
                </div>
              </div>
            </TableCell>
            <TableCell className="text-center">
              <div className="flex flex-col items-center">
                <Badge
                  variant="outline"
                  className="bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20 font-bold text-[10px] py-0.5"
                >
                  {pharmacy.plan}
                </Badge>
                <span className="text-[9px] text-slate-400 mt-1">
                  Since {pharmacy.date}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-center">
              <div className="flex items-center justify-center gap-2">
                <div className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-black text-xs text-slate-700 dark:text-slate-200">
                  {pharmacy.stores}
                </div>
                <StoreIcon className="h-3 w-3 text-slate-400" />
              </div>
            </TableCell>
            <TableCell className="text-right pr-4 font-black text-slate-900 dark:text-white">
              {pharmacy.revenue}
            </TableCell>
            <TableCell className="text-center">
              <Badge
                className={
                  pharmacy.status === "Active"
                    ? "bg-emerald-500 hover:bg-emerald-600"
                    : pharmacy.status === "Suspended"
                      ? "bg-rose-500 hover:bg-rose-600"
                      : "bg-amber-500 hover:bg-amber-600"
                }
              >
                {pharmacy.status}
              </Badge>
            </TableCell>
            <TableCell className="pr-6">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                  >
                    <MoreVertical className="h-4 w-4 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl shadow-xl border-slate-200 dark:border-slate-800">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-3 py-2">Actions</DropdownMenuLabel>
                  <DropdownMenuItem 
                    className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold"
                    onClick={() => handleImpersonate(pharmacy)}
                  >
                    <ExternalLink className="h-4 w-4 text-indigo-500" />
                    Impersonate (Admin)
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold"
                    onClick={() => handleViewBilling(pharmacy)}
                  >
                    <CreditCard className="h-4 w-4 text-emerald-500" />
                    View Billing History
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold"
                    onClick={() => router.push(`/admin/system?search=${pharmacy.id}`)}
                  >
                    <History className="h-4 w-4 text-blue-500" />
                    System Logs
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-2 bg-slate-100 dark:bg-slate-800" />
                  <DropdownMenuItem 
                    className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                    onClick={() => {
                      setSelectedPharmacy(pharmacy);
                      setIsSuspendDialogOpen(true);
                    }}
                  >
                    <Ban className="h-4 w-4" />
                    Suspend Account
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
        {pharmacyList.length === 0 && !isLoading && (
          <TableRow>
            <TableCell
              colSpan={7}
              className="text-center py-20 text-slate-400 font-medium"
            >
              <div className="flex flex-col items-center gap-2">
                <StoreIcon className="h-10 w-10 opacity-20" />
                <span>No pharmacies match your search criteria</span>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
