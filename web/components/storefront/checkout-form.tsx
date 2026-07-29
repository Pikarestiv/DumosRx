"use client";

import { useState } from "react";
import { useCartStore } from "@/lib/store/use-cart-store";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api/base-client";

interface CheckoutFormProps {
  storeSlug: string;
}

export function CheckoutForm({ storeSlug }: CheckoutFormProps) {
  const cart = useCartStore();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    customer_name: "",
    customer_phone: "",
    customer_address: "",
    payment_method: "in_store", // paystack, transfer, in_store
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleMethodChange = (value: string) => {
    setFormData((prev) => ({ ...prev, payment_method: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (cart.items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    if (!formData.customer_name || !formData.customer_phone) {
      toast.error("Please fill in required fields");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        ...formData,
        items: cart.items.map(item => ({
          product_id: item.id,
          quantity: item.quantity
        }))
      };

      // TODO: If paystack is selected, open Paystack popup here and get reference first
      if (formData.payment_method === 'paystack') {
        toast.info("Paystack integration coming soon... falling back to In Store");
        payload.payment_method = 'in_store';
      }

      await apiClient.post(`/storefront/${storeSlug}/checkout`, payload);

      toast.success("Order placed successfully!");
      cart.clearCart();
      router.push(`/store/${storeSlug}`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (cart.items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500">
          Your cart is empty. Return to the store to add items.
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button onClick={() => router.push(`/store/${storeSlug}`)}>Return to Store</Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
        <Card>
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle>Delivery & Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Contact Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer_name">Full Name *</Label>
                    <Input 
                      id="customer_name" 
                      name="customer_name" 
                      required 
                      value={formData.customer_name}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer_phone">Phone Number *</Label>
                    <Input 
                      id="customer_phone" 
                      name="customer_phone" 
                      required 
                      value={formData.customer_phone}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer_address">Delivery Address (Optional for Pickup)</Label>
                  <Input 
                    id="customer_address" 
                    name="customer_address" 
                    value={formData.customer_address}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold text-lg">Payment Method</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Label
                    htmlFor="in_store"
                    className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer hover:bg-accent hover:text-accent-foreground ${formData.payment_method === 'in_store' ? 'border-primary' : 'border-muted bg-popover'}`}
                    onClick={() => handleMethodChange('in_store')}
                  >
                    <input type="radio" id="in_store" name="payment_method" value="in_store" className="sr-only" checked={formData.payment_method === 'in_store'} onChange={() => handleMethodChange('in_store')} />
                    Pick up & Pay
                  </Label>
                  <Label
                    htmlFor="transfer"
                    className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer hover:bg-accent hover:text-accent-foreground ${formData.payment_method === 'transfer' ? 'border-primary' : 'border-muted bg-popover'}`}
                    onClick={() => handleMethodChange('transfer')}
                  >
                    <input type="radio" id="transfer" name="payment_method" value="transfer" className="sr-only" checked={formData.payment_method === 'transfer'} onChange={() => handleMethodChange('transfer')} />
                    Bank Transfer
                  </Label>
                  <Label
                    htmlFor="paystack"
                    className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer hover:bg-accent hover:text-accent-foreground ${formData.payment_method === 'paystack' ? 'border-primary' : 'border-muted bg-popover'}`}
                    onClick={() => handleMethodChange('paystack')}
                  >
                    <input type="radio" id="paystack" name="payment_method" value="paystack" className="sr-only" checked={formData.payment_method === 'paystack'} onChange={() => handleMethodChange('paystack')} />
                    Card (Paystack)
                  </Label>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Place Order (₦{cart.getTotal().toLocaleString()})
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      <div>
        <Card className="sticky top-24">
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cart.items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>{item.name} (x{item.quantity})</span>
                <span className="font-medium">₦{(item.price * item.quantity).toLocaleString()}</span>
              </div>
            ))}
            <div className="border-t pt-4 flex justify-between font-bold text-lg">
              <span>Total</span>
              <span className="text-emerald-600">₦{cart.getTotal().toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
