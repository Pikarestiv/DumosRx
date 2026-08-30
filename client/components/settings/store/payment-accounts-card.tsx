"use client";

import { useState } from "react";
import { Plus, Trash2, Edit2, Loader2, CreditCard, Smartphone, Banknote, Info } from "lucide-react";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  usePaymentAccounts,
  useSavePaymentAccountMutation,
  useDeletePaymentAccountMutation,
} from "@/lib/hooks/use-payment-accounts";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NIGERIAN_BANKS } from "@/lib/constants/suggestions";
import { SearchableInput } from "@/components/ui/searchable-input";
import { useDefaultPaymentAccounts } from "@/lib/hooks/use-default-payment-accounts";
import type { PaymentAccount } from "@/lib/types/payment-account";

export function PaymentAccountsCard() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    account_type: "bank",
    account_number: "",
    bank_name: "",
  });

  const { storeProfile } = useStore();
  const { user, isAdmin } = useAuth();
  const { defaults, setDefaultAccount } = useDefaultPaymentAccounts();

  const activeStoreId = storeProfile?.id;
  const activeUserId = user?.id;

  const { accounts, loading } = usePaymentAccounts(activeStoreId);

  const handleOpenDialog = (account?: PaymentAccount) => {
    if (account) {
      setEditingId(account.id);
      setFormData({
        name: account.name,
        account_type: account.account_type,
        account_number: account.account_number || "",
        bank_name: account.bank_name || "",
      });
      const method = account.account_type === "pos_terminal" ? "card" : "transfer";
      setSetAsDefault(defaults[`${activeStoreId}_${method}`] === account.id);
    } else {
      setEditingId(null);
      setSetAsDefault(false);
      setFormData({
        name: "",
        account_type: "bank",
        account_number: "",
        bank_name: "",
      });
    }
    setIsDialogOpen(true);
  };

  const saveMutation = useSavePaymentAccountMutation();

  const handleSave = () => {
    if (!formData.name) {
      toast.error("Account name is required");
      return;
    }
    if (saveMutation.isPending) return;
    saveMutation.mutate(
      { formData, editingId, activeUserId, activeStoreId },
      {
        onSuccess: (accountId) => {
          if (setAsDefault && activeStoreId) {
            setDefaultAccount(activeStoreId, formData.account_type === "pos_terminal" ? "card" : "transfer", accountId);
          }
          setIsDialogOpen(false);
        },
      },
    );
  };

  const deleteMutation = useDeletePaymentAccountMutation(activeStoreId);

  const handleDelete = async () => {
    if (!accountToDelete) return;
    try {
      await deleteMutation.mutateAsync(accountToDelete);
    } finally {
      setIsConfirmOpen(false);
      setAccountToDelete(null);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "bank": return <Banknote className="h-4 w-4 text-primary" />;
      case "pos_terminal": return <CreditCard className="h-4 w-4 text-purple-500" />;
      case "mobile_money": return <Smartphone className="h-4 w-4 text-green-500" />;
      default: return <Banknote className="h-4 w-4" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span className="flex items-center gap-2">
            Payment Accounts
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>The bank accounts, POS terminals, and mobile money wallets cashiers can pick as the destination for Transfer and Card payments.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
          {isAdmin && (
            <Button onClick={() => handleOpenDialog()} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          Manage destination accounts for Transfer and Card payments.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!!(loading) && (
                        <div className="flex justify-center p-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      )}
              {(!(loading) && accounts.length === 0) && (
                                      <div className="text-center p-8 border rounded-lg border-dashed">
                                        <p className="text-muted-foreground text-sm">No payment accounts configured.</p>
                                        {isAdmin && (
                                          <Button variant="link" onClick={() => handleOpenDialog()} className="mt-2">
                                            Add your first account
                                          </Button>
                                        )}
                                      </div>
                                    )}
              {!(!(loading) && accounts.length === 0) && (
                                      <div className={`grid gap-3 ${accounts.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
                                        {accounts.map((account) => (
                                          <div key={account.id} className="flex flex-col justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                                            <div className="flex items-center gap-4">
                                              <div className="p-2 bg-muted rounded-full">
                                                {getIcon(account.account_type)}
                                              </div>
                                              <div className="flex-1">
                                                <h4 className="font-semibold text-sm">{account.name}</h4>
                                                <p className="text-xs text-muted-foreground">
                                                  {account.account_type === "bank" && "Bank Account"}
                                                            {(!(account.account_type === "bank") && account.account_type === "pos_terminal") && "POS Terminal"}
                                                            {!(!(account.account_type === "bank") && account.account_type === "pos_terminal") && "Mobile Money"}
                                                  {account.bank_name && ` • ${account.bank_name}`}
                                                  {account.account_number && ` • ${account.account_number}`}
                                                </p>
                                              </div>
                                            </div>
                                            {isAdmin && (
                                                <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                                                  <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    className="flex-1"
                                                    onClick={() => handleOpenDialog(account)}
                                                  >
                                                    <Edit2 className="h-4 w-4 mr-2" />
                                                    Edit
                                                  </Button>
                                                  <Button 
                                                    variant="destructive" 
                                                    size="icon"
                                                    className="shrink-0"
                                                    onClick={() => {
                                                      setAccountToDelete(account.id);
                                                      setIsConfirmOpen(true);
                                                    }}
                                                  >
                                                    <Trash2 className="h-4 w-4" />
                                                  </Button>
                                                </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{!!(editingId) && "Edit Account"}
                      {!(editingId) && "Add Payment Account"}</DialogTitle>
            <DialogDescription>
              Details for tracking where payments are received.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Account Name *</Label>
              <Input 
                placeholder="e.g. Moniepoint POS 1, Zenith Main" 
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select 
                value={formData.account_type} 
                onValueChange={(val) => setFormData({...formData, account_type: val})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank Account</SelectItem>
                  <SelectItem value="pos_terminal">POS Terminal</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money (OPay, Palmpay)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bank Name (Optional)</Label>
                <SearchableInput 
                  id="bank_name"
                  placeholder="e.g. Zenith Bank" 
                  value={formData.bank_name}
                  onValueChange={(val) => setFormData({...formData, bank_name: val})}
                  options={NIGERIAN_BANKS}
                />
              </div>
              <div className="space-y-2">
                <Label>Account Number (Optional)</Label>
                <Input 
                  placeholder="e.g. 1012345678" 
                  value={formData.account_number}
                  onChange={(e) => setFormData({...formData, account_number: e.target.value})}
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2 pt-2">
              <input 
                type="checkbox" 
                id="setAsDefaultNew"
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer"
                checked={setAsDefault}
                onChange={(e) => setSetAsDefault(e.target.checked)}
              />
              <label htmlFor="setAsDefaultNew" className="text-sm cursor-pointer select-none">
                Set as default for <span className="font-bold">{formData.account_type === "pos_terminal" && "Card"}
                              {!(formData.account_type === "pos_terminal") && "Transfer"}</span> on this device
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saveMutation.isPending}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title="Delete Account?"
        description="Are you sure you want to remove this payment account? This will not affect past transactions."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </Card>
  );
}
