"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useStorefrontI18n } from "@/components/storefront/storefront-i18n-provider";

interface ReturnToStoreProps {
  reference: string;
  onReturnToStore: () => void;
}

export function OrphanReferencePanel({ reference, onReturnToStore }: ReturnToStoreProps) {
  const { t } = useStorefrontI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("checkout.orphan.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>{t("checkout.orphan.body1")}</p>
        <p>{t("checkout.orphan.body2")}</p>
        <p className="font-mono text-base font-semibold text-foreground">{reference}</p>
      </CardContent>
      <CardFooter className="flex justify-center">
        <Button onClick={onReturnToStore}>{t("checkout.returnToStore")}</Button>
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
  const { t } = useStorefrontI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {refunded ? t("checkout.failed.refundedTitle") : t("checkout.failed.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>{refunded ? t("checkout.failed.refundedBody") : t("checkout.failed.body")}</p>
        <p>{t("checkout.reference")}</p>
        <p className="font-mono text-base font-semibold text-foreground">{reference}</p>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
        {!refunded && (
          <Button onClick={onRetry} disabled={retrying}>
            {retrying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("checkout.retry")}
          </Button>
        )}
        <Button variant="outline" onClick={onReturnToStore}>
          {t("checkout.returnToStore")}
        </Button>
      </CardFooter>
    </Card>
  );
}
