"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, CreditCard, Filter, ArrowUpRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useStore } from "@/lib/context/store-context";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { RepaymentDialog } from "./repayment-dialog";

export function DebtDashboard() {
  const { storeProfile } = useStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [isRepaymentOpen, setIsRepaymentOpen] = useState(false);

  const { data: debtors, loading, refetch } = useLocalData<any>(
    "SELECT * FROM customers WHERE outstanding_balance > 0 AND _deleted = 0 ORDER BY outstanding_balance DESC"
  );

  const filteredDebtors = debtors.filter(
    (d) =>
      d.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.phone.includes(searchTerm)
  );

  const totalDebt = debtors.reduce((sum, d) => sum + (d.outstanding_balance || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-destructive/5 border-destructive/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive">
              Total Outstanding Debt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(totalDebt, storeProfile?.currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Owed by {debtors.length} customers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Avg. Debt per Customer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(
                debtors.length > 0 ? totalDebt / debtors.length : 0,
                storeProfile?.currency
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Collections (MTD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(0, storeProfile?.currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Coming from payment tracking
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Debtor List</CardTitle>
              <CardDescription>
                Customers with active credit balances
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search debtors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Credit Limit</TableHead>
                <TableHead className="text-right">Outstanding Balance</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    Loading debtors...
                  </TableCell>
                </TableRow>
              ) : filteredDebtors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    No debtors found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredDebtors.map((debtor) => (
                  <TableRow key={debtor.id}>
                    <TableCell>
                      <span className="font-medium">
                        {debtor.first_name} {debtor.last_name}
                      </span>
                    </TableCell>
                    <TableCell>{debtor.phone}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(debtor.credit_limit || 0, storeProfile?.currency)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-destructive">
                      {formatCurrency(debtor.outstanding_balance, storeProfile?.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedCustomer({
                            ...debtor,
                            name: `${debtor.first_name} ${debtor.last_name}`,
                          });
                          setIsRepaymentOpen(true);
                        }}
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Record Pay
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RepaymentDialog
        open={isRepaymentOpen}
        onOpenChange={setIsRepaymentOpen}
        customer={selectedCustomer}
        onSuccess={refetch}
        currencyCode={storeProfile?.currency}
      />
    </div>
  );
}
