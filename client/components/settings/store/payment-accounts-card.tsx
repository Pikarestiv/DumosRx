"use client";

import { useState } from "react";
import { Plus, Trash2, Edit2, Loader2, CreditCard, Smartphone, Banknote } from "lucide-react";
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
import { toast } from "sonner";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { insert, update, remove } from "@/lib/db/local-database";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NIGERIAN_BANKS } from "@/lib/constants/suggestions";
import { SearchableInput } from "@/components/ui/searchable-input";
import { useDefaultPaymentAccounts } from "@/lib/hooks/use-default-payment-accounts";

interface PaymentAccount {
  id: string;
  name: string;
  account_type: "bank" | "pos_terminal" | "mobile_money";
  account_number: string;
  bank_name: string;
}

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
  const { setDefaultAccount } = useDefaultPaymentAccounts();

  const activeStoreId = storeProfile?.id;
  const activeUserId = user?.id;

  const { data: accounts, loading, refetch } = useLocalData<PaymentAccount>(
    activeStoreId 
      ? `SELECT * FROM payment_accounts WHERE _deleted = 0 AND store_id = '${activeStoreId}' ORDER BY created_at DESC`
      : `SELECT * FROM payment_accounts WHERE _deleted = 0 ORDER BY created_at DESC`
  );

  const handleOpenDialog = (account?: PaymentAccount) => {
    setSetAsDefault(false);
    if (account) {
      setEditingId(account.id);
      setFormData({
        name: account.name,
        account_type: account.account_type,
        account_number: account.account_number || "",
        bank_name: account.bank_name || "",
      });
    } else {
      setEditingId(null);
      setFormData({
        name: "",
        account_type: "bank",
        account_number: "",
        bank_name: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error("Account name is required");
      return;
    }

    try {
      if (editingId) {
        await update("payment_accounts", editingId, {
          name: formData.name,
          account_type: formData.account_type,
          account_number: formData.account_number,
          bank_name: formData.bank_name,
          updated_at: new Date().toISOString(),
        });
        toast.success("Account updated successfully");
        if (setAsDefault && activeStoreId) {
          setDefaultAccount(activeStoreId, formData.account_type === "pos_terminal" ? "card" : "transfer", editingId);
        }
      } else {
        const newId = `pa_${Date.now()}`;
        await insert("payment_accounts", {
          id: newId,
          user_id: activeUserId,
          store_id: activeStoreId,
          name: formData.name,
          account_type: formData.account_type,
          account_number: formData.account_number,
          bank_name: formData.bank_name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        toast.success("Account added successfully");
        if (setAsDefault && activeStoreId) {
          setDefaultAccount(activeStoreId, formData.account_type === "pos_terminal" ? "card" : "transfer", newId);
        }
      }
      setIsDialogOpen(false);
      refetch();
    } catch (error) {
      console.error(error);
      toast.error("Failed to save account");
    }
  };

  const handleDelete = async () => {
    if (!accountToDelete) return;
    try {
      await remove("payment_accounts", accountToDelete);
      toast.success("Account deleted");
      refetch();
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete account");
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
        <CardTitle className="text-xl flex justify-between items-center">
          <span>Payment Accounts</span>
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
        {loading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center p-8 border rounded-lg border-dashed">
            <p className="text-muted-foreground text-sm">No payment accounts configured.</p>
            {isAdmin && (
              <Button variant="link" onClick={() => handleOpenDialog()} className="mt-2">
                Add your first account
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <div key={account.id} className="p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-muted rounded-full">
                    {getIcon(account.account_type)}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">{account.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {account.account_type === "bank" ? "Bank Account" : 
                       account.account_type === "pos_terminal" ? "POS Terminal" : "Mobile Money"}
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
            <DialogTitle>{editingId ? "Edit Account" : "Add Payment Account"}</DialogTitle>
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
                Set as default for {formData.account_type === "pos_terminal" ? "Card" : "Transfer"} on this device
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save Account</Button>
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
