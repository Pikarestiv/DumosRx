import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CheckoutPaymentMethodProps {
  paymentMethod: string;
  customerEmail: string;
  onlinePaymentAvailable: boolean;
  onMethodChange: (value: string) => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function CheckoutPaymentMethod({
  paymentMethod,
  customerEmail,
  onlinePaymentAvailable,
  onMethodChange,
  onInputChange,
}: CheckoutPaymentMethodProps) {
  return (
    <div className="space-y-4 pt-4 border-t">
      <h3 className="font-semibold text-lg">Payment Method</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Label
          htmlFor="in_store"
          className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer hover:bg-accent hover:text-accent-foreground ${paymentMethod === 'in_store' ? 'border-primary' : 'border-muted bg-popover'}`}
          onClick={() => onMethodChange('in_store')}
        >
          <input type="radio" id="in_store" name="payment_method" value="in_store" className="sr-only" checked={paymentMethod === 'in_store'} onChange={() => onMethodChange('in_store')} />
          Pick up & Pay
        </Label>
        <Label
          htmlFor="transfer"
          className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer hover:bg-accent hover:text-accent-foreground ${paymentMethod === 'transfer' ? 'border-primary' : 'border-muted bg-popover'}`}
          onClick={() => onMethodChange('transfer')}
        >
          <input type="radio" id="transfer" name="payment_method" value="transfer" className="sr-only" checked={paymentMethod === 'transfer'} onChange={() => onMethodChange('transfer')} />
          Bank Transfer
        </Label>
        {onlinePaymentAvailable && (
          <Label
            htmlFor="paystack"
            className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer hover:bg-accent hover:text-accent-foreground ${paymentMethod === 'paystack' ? 'border-primary' : 'border-muted bg-popover'}`}
            onClick={() => onMethodChange('paystack')}
          >
            <input type="radio" id="paystack" name="payment_method" value="paystack" className="sr-only" checked={paymentMethod === 'paystack'} onChange={() => onMethodChange('paystack')} />
            Pay Online
          </Label>
        )}
      </div>
      {paymentMethod === 'paystack' && (
        <div className="space-y-2">
          <Label htmlFor="customer_email">Email *</Label>
          <Input
            id="customer_email"
            name="customer_email"
            type="email"
            required
            value={customerEmail}
            onChange={onInputChange}
          />
        </div>
      )}
    </div>
  );
}
