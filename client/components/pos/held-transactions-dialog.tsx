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
  ShoppingBag,
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

export function HeldTransactionsDialog({
  isOpen,
  onClose,
  onRecall,
}: HeldTransactionsDialogProps) {
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
      const res = await query<HeldTransaction>(
        "SELECT * FROM held_transactions ORDER BY created_at DESC",
      );
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
      <DialogContent className="sm:max-w-3xl bg-background/95 backdrop-blur-xl border-accent/10 p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <PauseCircle className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-serif">
                Held Transactions
              </DialogTitle>
              <DialogDescription>
                Recall transactions that were previously paused.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4 min-h-[300px] max-h-[500px] overflow-y-auto space-y-4">
          {loading ? (
            <div className="py-20 text-center text-muted-foreground animate-pulse">
              Loading held sales...
            </div>
          ) : heldItems.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center space-y-3 opacity-40">
              <ShoppingBag className="w-12 h-12" />
              <p className="italic">No held transactions found</p>
            </div>
          ) : (
            heldItems.map((item) => (
              <div
                key={item.id}
                className="group flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-accent/10 bg-card/50 hover:bg-accent/5 transition-all gap-3 sm:gap-4"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 rounded-full bg-muted flex items-center justify-center border border-accent/5">
                    <User className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                  </div>
                  <div className="space-y-1 sm:space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold truncate text-sm sm:text-base">
                        {item.customer_name || "Walk-in Customer"}
                      </p>
                      <Badge
                        variant="outline"
                        className="text-[9px] sm:text-[10px] h-4 bg-amber-500/5 text-amber-500 border-amber-500/20 shrink-0 px-1.5 sm:px-2.5"
                      >
                        Held
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wider font-medium flex-wrap">
                      <span className="flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3" />{" "}
                        {new Date(item.created_at).toLocaleTimeString()}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/30 shrink-0" />
                      <span className="shrink-0">
                        {JSON.parse(item.items_json).length} Items
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto border-t sm:border-0 border-border/50 pt-3 sm:pt-0">
                  <div className="text-left sm:text-right shrink-0">
                    <p className="text-[9px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      Total
                    </p>
                    <p className="font-bold text-base sm:text-lg leading-none mt-0.5 sm:mt-1">
                      NGN {item.total_amount.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl shrink-0"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </Button>
                    <Button
                      variant="default"
                      className="h-9 sm:h-10 px-3 sm:px-4 rounded-lg sm:rounded-xl text-sm sm:text-base font-bold bg-primary hover:bg-primary/90 shrink-0"
                      onClick={() => onRecall(item)}
                    >
                      <PlayCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-0 sm:mr-2" />
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
