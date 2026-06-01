"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Copy, Check, Users, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useReferralStats } from "@/lib/api/hooks";

interface ReferredUser {
  id: string;
  name: string;
  pharmacy_name: string;
  created_at: string;
  status: "active" | "pending";
}

interface CreditTransaction {
  id: string;
  type: "earned" | "spent" | "admin_adjustment";
  amount: string;
  description: string;
  created_at: string;
}

export function ReferralTab() {
  const { data: stats, isLoading: loading } = useReferralStats();
  const [copied, setCopied] = useState(false);

  const copyReferralLink = () => {
    if (!stats?.referral_code) return;
    const referralLink = `${window.location.origin}/register?ref=${stats.referral_code}`;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Referral link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const referralLink = stats?.referral_code
    ? `${window.location.origin}/register?ref=${stats.referral_code}`
    : "";

  return (
    <div className="space-y-6">
      {/* Top Banner and Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 border-none shadow-sm flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" /> Invite Others, Earn
              Credits!
            </CardTitle>
            <CardDescription>
              Share your referral link with other store owners. When they
              subscribe to any plan, you&apos;ll earn a percentage of their payment
              as credits to offset your own future bills!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Input
                  readOnly
                  value={referralLink}
                  placeholder="Loading your referral link..."
                  className="bg-muted/30 border-muted pr-10 text-sm font-mono truncate"
                />
              </div>
              <Button onClick={copyReferralLink} size="icon" variant="outline" disabled={!referralLink}>
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: Copy and share this link directly on WhatsApp or Email.
            </p>
          </CardContent>
        </Card>

        {/* Balance Card */}
        <Card className="border-none shadow-sm bg-linear-to-br from-primary/10 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Referral Balance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-black tracking-tight text-primary">
              ₦{stats?.referral_credits?.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              These credits will be automatically available at checkout to
              discount your subscriptions.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Referred Signups */}
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" /> Referred Signups
          </CardTitle>
          <CardDescription>
            Businesses that registered using your referral link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats?.referrals && stats.referrals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              You haven&apos;t referred anyone yet. Share your link to get
              started!
            </div>
          ) : (
            <div className="border rounded-md border-muted/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/10">
                  <TableRow>
                    <TableHead>Store Name</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Registered On</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats?.referrals.map((ref: ReferredUser) => (
                    <TableRow key={ref.id}>
                      <TableCell className="font-semibold">
                        {ref.pharmacy_name}
                      </TableCell>
                      <TableCell>{ref.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(ref.created_at), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            ref.status === "active"
                              ? "bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20"
                              : "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border-yellow-500/20"
                          }
                          variant="outline"
                        >
                          {ref.status === "active"
                            ? "Subscribed"
                            : "Registered / Trial"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction Statement */}
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle>Credit Statements</CardTitle>
          <CardDescription>
            Statement of credits earned and applied.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats?.transactions && stats.transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No credit transactions recorded yet.
            </div>
          ) : (
            <div className="border rounded-md border-muted/50 overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/10">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats?.transactions.map((txn: CreditTransaction) => (
                    <TableRow key={txn.id}>
                      <TableCell className="text-muted-foreground text-sm font-mono">
                        {format(new Date(txn.created_at), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            txn.type === "earned" ? "default" : "secondary"
                          }
                          className={
                            txn.type === "earned"
                              ? "bg-green-500"
                              : "bg-muted-foreground/30 text-foreground"
                          }
                        >
                          {txn.type === "earned"
                            ? "Credit"
                            : txn.type === "spent"
                              ? "Debit"
                              : "Adjustment"}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`font-bold ${txn.type === "earned" ? "text-green-500" : "text-rose-500"}`}
                      >
                        {txn.type === "earned" ? "+" : "-"}₦
                        {Number(txn.amount).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {txn.description}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
