"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Phone, Mail } from "lucide-react";
import { useAccountManager } from "@/lib/hooks/use-account-manager";
import { getUserInitials } from "@/lib/utils";

/** WhatsApp deep link needs digits only (no +, spaces, dashes); Nigerian
 * numbers are commonly entered as 0803... locally, which isn't a valid
 * international number - swap the leading 0 for the country code so the
 * link actually opens a chat instead of an invalid-number error. */
function toWhatsAppLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountryCode = digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${withCountryCode}`;
}

export function ContactSpecialistCard() {
  const { data, isLoading } = useAccountManager();
  const manager = data?.data;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!manager) return null;

  const [firstName, ...rest] = manager.name.split(" ");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Contact Specialist</CardTitle>
        <CardDescription>
          Reach out directly if you run into any issues with your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {getUserInitials(firstName, rest.join(" "))}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{manager.name}</p>
              <p className="text-xs text-muted-foreground truncate">{manager.email}</p>
            </div>
          </div>
          {manager.phone ? (
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
              <a href={`mailto:${manager.email}`}>
                <Mail className="h-4 w-4 mr-2" />
                Email
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
