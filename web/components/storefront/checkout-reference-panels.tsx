"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface ReturnToStoreProps {
  reference: string;
  onReturnToStore: () => void;
}

export function OrphanReferencePanel({ reference, onReturnToStore }: ReturnToStoreProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>We couldn&apos;t match your payment to this cart</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-gray-600">
        <p>
          Your payment may have gone through, but this browser has no record of the order it was
          for (that happens if you came back in a new tab or window).
        </p>
        <p>
          Please contact the store with your payment reference so they can find and confirm your
          order:
        </p>
        <p className="font-mono text-base font-semibold text-gray-900">{reference}</p>
      </CardContent>
      <CardFooter className="flex justify-center">
        <Button onClick={onReturnToStore}>Return to Store</Button>
      </CardFooter>
    </Card>
  );
}

interface FailedConfirmationPanelProps extends ReturnToStoreProps {
  refunded: boolean;
  retrying: boolean;
  onRetry: () => void;
}

export function FailedConfirmationPanel({
  reference,
  refunded,
  retrying,
  onRetry,
  onReturnToStore,
}: FailedConfirmationPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {refunded ? "Your payment is being refunded" : "We couldn't confirm your payment yet"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-gray-600">
        {refunded ? (
          <p>
            Your payment went through, but this order can no longer be fulfilled, so it has been
            refunded. Do not pay again — the refund can take a few days to reach your account.
          </p>
        ) : (
          <p>
            Your payment may have gone through, but we could not finish placing the order. Do not
            pay again — try confirming once more, or contact the store with the reference below.
          </p>
        )}
        <p>Payment reference:</p>
        <p className="font-mono text-base font-semibold text-gray-900">{reference}</p>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
        {!refunded && (
          <Button onClick={onRetry} disabled={retrying}>
            {retrying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Retry confirmation
          </Button>
        )}
        <Button variant="outline" onClick={onReturnToStore}>
          Return to Store
        </Button>
      </CardFooter>
    </Card>
  );
}
