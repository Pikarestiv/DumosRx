import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle2, XCircle } from "lucide-react";

export type PlanConfig = {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  description: string;
  features: string[];
  exclusions: string[];
  badge?: string;
  buttonText: string;
  buttonHref: string;
  buttonVariant:
    | "default"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "destructive";
  popular: boolean;
};

interface PricingCardProps {
  plan: PlanConfig;
  isYearly: boolean;
}

export function PricingCard({ plan, isYearly }: PricingCardProps) {
  const price = isYearly ? plan.priceYearly : plan.priceMonthly;
  const savings = plan.priceMonthly * 12 - plan.priceYearly;

  const formatPrice = (p: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(p);
  };

  return (
    <Card
      className={`gap-4 py-8 flex flex-col relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
        plan.popular
          ? "border-primary ring-2 ring-primary/20 shadow-lg"
          : "border-muted"
      }`}
    >
      {plan.badge && (
        <div
          className={`absolute top-0 right-0 transform translate-x-1 translate-y-2 mr-3`}
        >
          <span
            className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
              plan.popular
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {plan.badge}
          </span>
        </div>
      )}

      <CardHeader className="">
        <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
        <CardDescription className="line-clamp-2 min-h-[40px] text-sm mt-1">
          {plan.description}
        </CardDescription>
        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-4xl font-extrabold tracking-tight">
            {price === 0 ? "₦0" : formatPrice(price)}
          </span>
          <span className="text-muted-foreground text-sm font-medium">
            {price === 0 ? "" : isYearly ? "/year" : "/month"}
          </span>
        </div>
        <div className="h-5">
          {price > 0 && isYearly && (
            <p className="text-xs text-emerald-600 font-semibold">
              Save {formatPrice(savings)} / year
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent className="grow space-y-5 pt-0">
        <div className="border-t border-muted my-2" />
        <ul className="space-y-3 text-xs md:text-sm">
          {plan.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <span className="text-foreground/90 font-medium">{feature}</span>
            </li>
          ))}
          {plan.exclusions.map((exclusion, i) => (
            <li
              key={`ex-${i}`}
              className="flex items-start gap-2 opacity-60 text-muted-foreground"
            >
              <XCircle className="h-4 w-4 text-muted-foreground/60 shrink-0 mt-0.5" />
              <span className="line-through">{exclusion}</span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="pt-2">
        <Button
          className="w-full font-bold py-5 rounded-xl shadow-md"
          variant={plan.buttonVariant}
          asChild
        >
          <Link href={plan.buttonHref}>{plan.buttonText}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
