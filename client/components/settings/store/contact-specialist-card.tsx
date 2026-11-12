"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Mail } from "lucide-react";
import { useAccountManager } from "@/lib/hooks/use-account-manager";
import { getUserInitials, cn } from "@/lib/utils";

// WhatsApp deep link needs digits only (no +, spaces, dashes); Nigerian numbers are commonly entered as 0803...
// Rationale: docs/CLIENT_COMMENTS.md#block-components-settings-store-contact-specialist-card-tsx-L11
function toWhatsAppLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountryCode = digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${withCountryCode}`;
}

export function ContactSpecialistCard() {
  const { data, isLoading } = useAccountManager();
  const manager = data?.data;
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#contact-specialist") {
      setHighlighted(true);
      const el = document.getElementById("contact-specialist");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      const timer = setTimeout(() => setHighlighted(false), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!isLoading && !manager) return null;

  const [firstName, ...rest] = manager ? manager.name.split(" ") : ["", ""];

  return (
    <Card
      id="contact-specialist"
      className={cn(
        "transition-all duration-700",
        highlighted && "ring-2 ring-primary shadow-lg bg-primary/5",
      )}
    >
      <CardHeader>
        <CardTitle>Your Contact Specialist</CardTitle>
        <CardDescription>
          Reach out directly if you run into any issues with your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="space-y-1.5 min-w-0">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
        ) : (
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {getUserInitials(firstName, rest.join(" "))}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{manager?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{manager?.email}</p>
            </div>
          </div>
          {manager?.phone ? (
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" asChild>
                <a href={`tel:${manager.phone}`}>
                  <Phone className="h-4 w-4 mr-2" />
                  Call
                </a>
              </Button>
              <Button variant="default" size="sm" asChild>
                <a href={toWhatsAppLink(manager.phone)} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" asChild className="shrink-0">
              <a href={`mailto:${manager?.email}`}>
                <Mail className="h-4 w-4 mr-2" />
                Email
              </a>
            </Button>
          )}
        </div>
        )}
      </CardContent>
    </Card>
  );
}
