"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  PauseCircle, 
  PlayCircle,
  Trash2,
  Clock,
  User,
  ShoppingBag
} from "lucide-react";
import { query } from "@/lib/db/core";
import { remove } from "@/lib/db/local-database";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface HeldTransaction {
  id: string;
  customer_name: string;
  items_json: string;
  total_amount: number;
  created_at: string;
}

interface HeldTransactionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRecall: (transaction: HeldTransaction) => void;
}

export function HeldTransactionsDialog({ isOpen, onClose, onRecall }: HeldTransactionsDialogProps) {
  const [heldItems, setHeldItems] = useState<HeldTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadHeldTransactions();
    }
  }, [isOpen]);

  const loadHeldTransactions = async () => {
    try {
      setLoading(true);
      const res = await query<HeldTransaction>("SELECT * FROM held_transactions ORDER BY created_at DESC");
      setHeldItems(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove("held_transactions", id);
      toast.success("Held transaction discarded");
      loadHeldTransactions();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete transaction");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-background/95 backdrop-blur-xl border-accent/10">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <PauseCircle className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-serif">Held Transactions</DialogTitle>
              <DialogDescription>
                Recall transactions that were previously paused.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4 min-h-[300px] max-h-[500px] overflow-y-auto space-y-4">
          {loading ? (
            <div className="py-20 text-center text-muted-foreground animate-pulse">Loading held sales...</div>
          ) : heldItems.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center space-y-3 opacity-40">
              <ShoppingBag className="w-12 h-12" />
              <p className="italic">No held transactions found</p>
            </div>
          ) : (
            heldItems.map((item) => (
              <div key={item.id} className="group flex items-center justify-between p-4 rounded-2xl border border-accent/10 bg-card/50 hover:bg-accent/5 transition-all">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center border border-accent/5">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <p className="font-bold">{item.customer_name || "Walk-in Customer"}</p>
                        <Badge variant="outline" className="text-[10px] h-4 bg-amber-500/5 text-amber-500 border-amber-500/20">Held</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(item.created_at).toLocaleTimeString()}</span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                        <span>{JSON.parse(item.items_json).length} Items</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total</p>
                        <p className="font-bold text-lg">NGN {item.total_amount.toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                            variant="destructive" 
                            size="icon" 
                            className="h-10 w-10 rounded-xl"
                            onClick={() => handleDelete(item.id)}
                        >
                            <Trash2 className="w-5 h-5" />
                        </Button>
                        <Button 
                            variant="default" 
                            className="h-10 px-4 rounded-xl font-bold bg-primary hover:bg-primary/90"
                            onClick={() => onRecall(item)}
                        >
                            <PlayCircle className="w-5 h-5 mr-2" />
                            Recall
                        </Button>
                    </div>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="border-t border-accent/10 pt-6">
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
