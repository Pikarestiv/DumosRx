"use client";

import { 
  Search, 
  Filter, 
  MoreVertical, 
  ExternalLink, 
  CreditCard, 
  History,
  ShieldCheck,
  Ban,
  Mail,
  ChevronLeft,
  ChevronRight,
  Download,
  Store
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Card, CardContent } from "@/components/ui/card";

const pharmacies = [
  { id: "PH-921", name: "Ikeja Medical Center", owner: "Dr. Adebayo", email: "adebayo@ikeja-med.com", plan: "Enterprise", status: "Active", stores: 12, revenue: "₦4.2M", date: "Jan 12, 2026" },
  { id: "PH-920", name: "GreenLife Pharmacy", owner: "Sarah Jenkins", email: "sarah@greenlife.ng", plan: "Pro", status: "Active", stores: 3, revenue: "₦1.1M", date: "Feb 05, 2026" },
  { id: "PH-919", name: "Unity Health Plus", owner: "Michael Okoro", email: "mike@unityhealth.com", plan: "Free", status: "Active", stores: 1, revenue: "₦0", date: "Mar 10, 2026" },
  { id: "PH-918", name: "SwiftCure Pharma", owner: "John Doe", email: "john@swiftcure.com", plan: "Enterprise", status: "Suspended", stores: 8, revenue: "₦2.8M", date: "Dec 15, 2025" },
  { id: "PH-917", name: "Apex Drugs & Wellness", owner: "Linda Chen", email: "linda@apex-wellness.com", plan: "Pro", status: "Active", stores: 5, revenue: "₦1.8M", date: "Apr 20, 2026" },
  { id: "PH-916", name: "Neighborhood Rx", owner: "Tunde Williams", email: "tunde@neighborhood.ng", plan: "Pro", status: "Active", stores: 2, revenue: "₦650k", date: "May 01, 2026" },
];

export default function PharmaciesManagement() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Pharmacy Fleet</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">Manage and monitor all business accounts on the platform</p>
        </div>
        <div className="flex items-center gap-3">
            <Button variant="outline" className="border-2 font-bold dark:bg-slate-900 dark:border-slate-800">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
            </Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20">
                Register Pharmacy
            </Button>
        </div>
      </div>

      <Card className="border-none shadow-sm overflow-hidden bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative w-full max-w-sm group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <Input
                placeholder="Search by name, ID or owner..."
                className="pl-10 bg-slate-50 dark:bg-slate-800 border-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" className="font-bold border-2">
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                </Button>
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden md:block" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Showing 6 of 1,284 pharmacies</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                  <TableHead className="font-bold text-[10px] uppercase text-slate-400 pl-6 h-12">Pharmacy Details</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">Owner & Contact</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">Subscription</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">Fleet Size</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-right h-12">Total Revenue</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">Status</TableHead>
                  <TableHead className="w-[80px] h-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pharmacies.map((pharmacy) => (
                  <TableRow key={pharmacy.id} className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-colors">
                    <TableCell className="pl-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center font-black text-indigo-500 border border-indigo-500/20 text-xs">
                          {pharmacy.name.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors">{pharmacy.name}</span>
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">{pharmacy.id}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm text-slate-700 dark:text-slate-300">{pharmacy.owner}</span>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                          <Mail className="h-3 w-3" />
                          {pharmacy.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center">
                        <Badge variant="outline" className="bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20 font-bold text-[10px] py-0.5">
                          {pharmacy.plan}
                        </Badge>
                        <span className="text-[9px] text-slate-400 mt-1">Since {pharmacy.date}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-black text-xs text-slate-700 dark:text-slate-200">
                          {pharmacy.stores}
                        </div>
                        <Store className="h-3 w-3 text-slate-400" />
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-4 font-black text-slate-900 dark:text-white">
                      {pharmacy.revenue}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={
                        pharmacy.status === 'Active' ? 'bg-emerald-500 hover:bg-emerald-600' :
                        pharmacy.status === 'Suspended' ? 'bg-rose-500 hover:bg-rose-600' :
                        'bg-amber-500 hover:bg-amber-600'
                      }>
                        {pharmacy.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-6">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="hover:bg-indigo-50 dark:hover:bg-indigo-500/10">
                            <MoreVertical className="h-4 w-4 text-slate-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 p-2">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem className="cursor-pointer gap-2 py-2">
                            <ExternalLink className="h-4 w-4 text-indigo-500" />
                            <span>Impersonate (Admin)</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer gap-2 py-2">
                            <CreditCard className="h-4 w-4 text-emerald-500" />
                            <span>View Billing History</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer gap-2 py-2">
                            <History className="h-4 w-4 text-blue-500" />
                            <span>System Logs</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="cursor-pointer gap-2 py-2 text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-500/10">
                            <Ban className="h-4 w-4" />
                            <span>Suspend Account</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Page 1 of 214</p>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled className="h-8 border-2 font-black text-xs uppercase tracking-tighter">
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Prev
                </Button>
                <div className="flex gap-1">
                    {[1, 2, 3, '...', 214].map((n, i) => (
                        <Button key={i} variant={n === 1 ? "default" : "ghost"} size="sm" className={`h-8 w-8 p-0 font-bold ${n === 1 ? 'bg-indigo-600' : ''}`}>
                            {n}
                        </Button>
                    ))}
                </div>
                <Button variant="outline" size="sm" className="h-8 border-2 font-black text-xs uppercase tracking-tighter">
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
