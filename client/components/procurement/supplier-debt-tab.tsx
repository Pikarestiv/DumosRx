"use client";

import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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
  getSupplierDebtBalances,
  getUnpaidPurchaseOrders,
  type SupplierDebtBalance
} from "@/lib/db/supplier-debt-queries";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { ArrowLeft, CreditCard } from "lucide-react";

export function SupplierDebtTab() {
  const [balances, setBalances] = useState<SupplierDebtBalance[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [selectedSupplierName, setSelectedSupplierName] = useState<string>("");
  const [unpaidOrders, setUnpaidOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentPO, setPaymentPO] = useState<any>(null);

  useEffect(() => {
    fetchBalances();
  }, []);

  useEffect(() => {
    if (selectedSupplierId) {
      fetchUnpaidOrders(selectedSupplierId);
    }
  }, [selectedSupplierId]);

  const fetchBalances = async () => {
    setLoading(true);
    try {
      const { data } = await getSupplierDebtBalances();
      setBalances(data);
    } catch (error) {
      console.error("Failed to fetch supplier debt balances:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnpaidOrders = async (supplierId: string) => {
    setLoading(true);
    try {
      const { data } = await getUnpaidPurchaseOrders(supplierId);
      setUnpaidOrders(data);
    } catch (error) {
      console.error("Failed to fetch unpaid orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentRecorded = () => {
    fetchBalances();
    if (selectedSupplierId) {
      fetchUnpaidOrders(selectedSupplierId);
    }
  };

  if (selectedSupplierId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => setSelectedSupplierId(null)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Summary
          </Button>
          <h2 className="text-xl font-serif font-bold text-primary">
            Unpaid Orders for {selectedSupplierName}
          </h2>
        </div>

        <Card className="border-accent/10">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-accent/5">
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead className="text-right">Amount Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">Loading...</TableCell>
                  </TableRow>
                ) : unpaidOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No unpaid orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  unpaidOrders.map((po) => {
                    const balance = po.total_amount - po.amount_paid;
                    const poNumber = po.id.split('-')[0].toUpperCase();
                    return (
                      <TableRow key={po.id}>
                        <TableCell className="font-medium">{poNumber}</TableCell>
                        <TableCell>{new Date(po.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                            {po.payment_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(po.total_amount)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(po.amount_paid)}</TableCell>
                        <TableCell className="text-right text-destructive font-bold">{formatCurrency(balance)}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            size="sm" 
                            variant="default"
                            onClick={() => {
                              setPaymentPO(po);
                              setPaymentDialogOpen(true);
                            }}
                          >
                            <CreditCard className="w-4 h-4 mr-2" /> Pay
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {paymentPO && (
          <RecordPaymentDialog
            open={paymentDialogOpen}
            onOpenChange={setPaymentDialogOpen}
            supplierId={selectedSupplierId}
            supplierName={selectedSupplierName}
            poId={paymentPO.id}
            poNumber={paymentPO.id.split('-')[0].toUpperCase()}
            amountOwed={paymentPO.total_amount - paymentPO.amount_paid}
            onPaymentRecorded={handlePaymentRecorded}
          />
        )}
      </div>
    );
  }

  return (
    <Card className="border-accent/10">
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-accent/5">
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Unpaid POs</TableHead>
              <TableHead className="text-right">Total Debt</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">Loading...</TableCell>
              </TableRow>
            ) : balances.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No supplier debt found.
                </TableCell>
              </TableRow>
            ) : (
              balances.map((balance) => (
                <TableRow key={balance.supplier_id}>
                  <TableCell className="font-bold text-primary">{balance.supplier_name}</TableCell>
                  <TableCell className="text-right">{balance.unpaid_pos_count}</TableCell>
                  <TableCell className="text-right text-destructive font-bold">{formatCurrency(balance.total_debt)}</TableCell>
                  <TableCell className="text-right">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        setSelectedSupplierId(balance.supplier_id);
                        setSelectedSupplierName(balance.supplier_name);
                      }}
                    >
                      View Details
                    </Button>
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
