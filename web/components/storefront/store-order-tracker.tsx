"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Package, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/utils/currency";

interface TrackedOrder {
  id: string;
  order_status: "pending" | "packed" | "fulfilled" | "cancelled";
  payment_status: "pending" | "paid" | "failed";
  payment_method: string;
  total_amount: number | string;
  currency: string;
  branch_name: string;
  customer_name: string;
  created_at?: string;
  items?: Array<{
    product_name: string;
    quantity: number;
  }>;
}

interface StoreOrderTrackerProps {
  storeSlug: string;
}

export function StoreOrderTracker({ storeSlug }: StoreOrderTrackerProps) {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<TrackedOrder | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;

    setLoading(true);
    setError(null);
    setOrder(null);

    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

    try {
      const res = await fetch(
        `${apiUrl}/storefront/${storeSlug}/orders/${encodeURIComponent(identifier.trim())}`,
      );
      if (!res.ok) {
        if (res.status === 404) {
          setError("No order found with that Reference or Order ID. Please check and try again.");
        } else {
          setError("Unable to track order right now. Please try again later.");
        }
        return;
      }

      const data = await res.json();
      setOrder(data.order);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: TrackedOrder["order_status"]) => {
    switch (status) {
      case "fulfilled":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> Order Ready / Completed
          </span>
        );
      case "packed":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            <Package className="h-3.5 w-3.5" /> Packed & Ready for Pickup
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-destructive/10 text-destructive">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <Clock className="h-3.5 w-3.5" /> Processing at Pharmacy
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSearch}
        className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
      >
        <div className="space-y-1.5">
          <label
            htmlFor="order-id-input"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
          >
            Order Reference or Paystack Transaction ID
          </label>
          <div className="flex gap-2">
            <Input
              id="order-id-input"
              type="text"
              placeholder="e.g. 01a19d67-... or DRX-SF-..."
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="rounded-full bg-muted/40 h-10 px-4 text-sm"
              required
            />
            <Button
              type="submit"
              disabled={loading}
              className="rounded-full h-10 px-6 gap-2 shrink-0"
            >
              <Search className="h-4 w-4" />
              {loading ? "Tracking…" : "Track"}
            </Button>
          </div>
        </div>
        {error && (
          <p className="text-xs text-destructive font-medium pl-1">{error}</p>
        )}
      </form>

      {order && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Order Status</span>
              <div>{getStatusBadge(order.order_status)}</div>
            </div>
            <div className="space-y-1 sm:text-right">
              <span className="text-xs text-muted-foreground">Total Amount</span>
              <p className="font-heading font-extrabold text-xl text-foreground">
                {formatMoney(Number(order.total_amount), order.currency)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Fulfilling Branch</span>
              <p className="font-semibold text-foreground">{order.branch_name}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Customer</span>
              <p className="font-semibold text-foreground">{order.customer_name}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Payment Method</span>
              <p className="font-semibold text-foreground uppercase text-xs">
                {order.payment_method} ({order.payment_status})
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Order Date</span>
              <p className="font-semibold text-foreground text-xs">
                {order.created_at ? new Date(order.created_at).toLocaleDateString() : "Recent"}
              </p>
            </div>
          </div>

          {order.items && order.items.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                Prescription & Products Ordered
              </h3>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {order.items.map((item, i) => (
                  <li key={i} className="py-2 flex items-center justify-between">
                    <span className="font-medium text-foreground">{item.product_name}</span>
                    <span className="text-xs text-muted-foreground">Qty: {item.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

