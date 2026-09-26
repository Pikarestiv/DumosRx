"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { sync } from "@/lib/db/sync-engine";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";

/** Paystack's own six supported countries for this store's storefront
 * payments (see StoreController::paymentBanks's OA enum). Only
 * nigeria/ghana/kenya/south africa get a real bank list back from
 * PaystackSubaccountService::listBanks - the other two degrade to a
 * free-text bank-name field, and resolveAccount() there similarly returns
 * null (not an error) rather than pretending it verified something it
 * can't, which is why this component treats "no name back" as an
 * unverified-but-allowed path rather than a failure. */
const SUPPORTED_COUNTRIES = [
  { value: "nigeria", label: "Nigeria" },
  { value: "ghana", label: "Ghana" },
  { value: "kenya", label: "Kenya" },
  { value: "south africa", label: "South Africa" },
  { value: "rwanda", label: "Rwanda" },
  { value: "cote d'ivoire", label: "Côte d'Ivoire" },
];

interface OnlinePaymentsSectionProps {
  storeId: string;
  storeName: string;
}

export function OnlinePaymentsSection({ storeId }: OnlinePaymentsSectionProps) {
  const [country, setCountry] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [manualBankName, setManualBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolveAttempted, setResolveAttempted] = useState(false);
  const [confirmedUnverifiable, setConfirmedUnverifiable] = useState(false);

  const { data: banksData } = useQuery({
    queryKey: ["payment-banks", storeId, country],
    queryFn: () => apiClient.getPaymentBanks(storeId, country),
    enabled: !!country,
  });
  const banks = banksData?.banks ?? [];
  const effectiveBankCode = banks.length > 0 ? bankCode : manualBankName;

  const resetVerification = () => {
    setResolveAttempted(false);
    setResolvedName(null);
    setConfirmedUnverifiable(false);
  };

  const resolveMutation = useMutation({
    mutationFn: () =>
      apiClient.resolvePaymentAccount(storeId, {
        account_number: accountNumber,
        bank_code: effectiveBankCode,
        country,
      }),
    onSuccess: (data) => {
      setResolvedName(data.account_name);
      setResolveAttempted(true);
    },
    onError: () => {
      toast.error("Could not verify this account. Please double-check the details.");
    },
  });

  const connectMutation = useMutation({
    mutationFn: () =>
      apiClient.createPaymentAccount(storeId, {
        account_number: accountNumber,
        bank_code: effectiveBankCode,
        country,
        confirmed_unverifiable: confirmedUnverifiable,
      }),
    onSuccess: async () => {
      toast.success("Payment account connected.");
      // Server-authoritative fields (paystack_subaccount_code etc.) are
      // never written to local SQLite from here - pull them down through
      // the normal sync cycle instead, same as every other server write.
      await sync(true);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Could not connect this bank account.");
    },
  });

  const isUnverifiable = resolveAttempted && !resolvedName;
  const canConnect = resolveAttempted && (resolvedName !== null || confirmedUnverifiable);
  const canVerify = !!country && !!accountNumber && !!effectiveBankCode && !resolveMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Online Payments</CardTitle>
        <CardDescription>
          Connect a bank account so customers can pay online at your storefront - the money goes straight to this account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="op-country">Country</Label>
          <Select
            value={country}
            onValueChange={(val) => {
              setCountry(val);
              setBankCode("");
              setManualBankName("");
              resetVerification();
            }}
          >
            <SelectTrigger id="op-country" aria-label="Country" className="w-full">
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_COUNTRIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {country && banks.length > 0 ? (
          <div className="space-y-2">
            <Label htmlFor="op-bank">Bank</Label>
            <Select
              value={bankCode}
              onValueChange={(val) => {
                setBankCode(val);
                resetVerification();
              }}
            >
              <SelectTrigger id="op-bank" aria-label="Bank" className="w-full">
                <SelectValue placeholder="Select bank" />
              </SelectTrigger>
              <SelectContent>
                {banks.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : country ? (
          <div className="space-y-2">
            <Label htmlFor="op-bank-name">Bank name</Label>
            <Input
              id="op-bank-name"
              value={manualBankName}
              onChange={(e) => {
                setManualBankName(e.target.value);
                resetVerification();
              }}
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="op-account-number">Account number</Label>
          <Input
            id="op-account-number"
            value={accountNumber}
            onChange={(e) => {
              setAccountNumber(e.target.value);
              resetVerification();
            }}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={!canVerify}
          onClick={() => resolveMutation.mutate()}
        >
          {resolveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Verify account
        </Button>

        {resolveAttempted && resolvedName && (
          <p className="text-sm text-emerald-600">Pay to: {resolvedName}</p>
        )}

        {isUnverifiable && (
          <div className="space-y-2">
            <p className="text-sm text-amber-600">
              We can&apos;t verify this automatically - please double-check the details.
            </p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="op-confirm-unverifiable"
                aria-label="I have double-checked these details"
                checked={confirmedUnverifiable}
                onCheckedChange={(checked) => setConfirmedUnverifiable(checked === true)}
              />
              <Label htmlFor="op-confirm-unverifiable" className="text-sm font-normal">
                I have double-checked these details
              </Label>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          disabled={!canConnect || connectMutation.isPending}
          onClick={() => connectMutation.mutate()}
        >
          {connectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Connect
        </Button>
      </CardFooter>
    </Card>
  );
}
