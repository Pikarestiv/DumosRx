"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Copy, Check, Users, Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useReferralStats } from "@/lib/hooks/use-billing";

export function ReferralTab() {
  const { data: stats, isLoading } = useReferralStats();
  const [copied, setCopied] = useState(false);

  const referralLink = stats?.referral_code ? `${window.location.origin}/register?ref=${stats.referral_code}` : "";

  const copyReferralLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Referral link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 border-none shadow-sm flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" /> Invite Others, Earn Credits!
            </CardTitle>
            <CardDescription>
              Share your referral link with other store owners. When they subscribe to any plan,
              you&apos;ll earn a percentage of their payment as credits to offset your own future bills!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Input readOnly value={referralLink} placeholder="Loading your referral link..." className="bg-muted/30 border-muted text-sm font-mono truncate" />
              <Button onClick={copyReferralLink} size="icon" variant="outline" disabled={!referralLink}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Referral Balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-black tracking-tight text-primary">₦{(stats?.referral_credits ?? 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Automatically applied at checkout to discount your subscriptions.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" /> Referred Signups
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!stats?.referrals?.length ? (
            <div className="text-center py-8 text-muted-foreground">You haven&apos;t referred anyone yet. Share your link to get started!</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store Name</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Registered On</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.referrals.map((ref) => (
                  <TableRow key={ref.id}>
                    <TableCell className="font-semibold">{ref.store_name}</TableCell>
                    <TableCell>{ref.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{format(new Date(ref.created_at), "dd/MM/yyyy")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ref.status === "active" ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"}>
                        {ref.status === "active" ? "Subscribed" : "Registered / Trial"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle>Credit Statements</CardTitle>
        </CardHeader>
        <CardContent>
          {!stats?.transactions?.length ? (
            <div className="text-center py-8 text-muted-foreground">No credit transactions recorded yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.transactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell className="text-muted-foreground text-sm font-mono">{format(new Date(txn.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell>
                      <Badge className={txn.type === "earned" ? "bg-green-500" : "bg-muted-foreground/30 text-foreground"}>
                        {txn.type === "earned" ? "Credit" : txn.type === "spent" ? "Debit" : "Adjustment"}
                      </Badge>
                    </TableCell>
                    <TableCell className={`font-bold ${txn.type === "earned" ? "text-green-500" : "text-rose-500"}`}>
                      {txn.type === "earned" ? "+" : "-"}₦{Number(txn.amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">{txn.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
