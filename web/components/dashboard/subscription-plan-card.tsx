"use client";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, CreditCard, Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export function SubscriptionPlanCard({
  plan,
  isDiscounted,
  formatPrice,
  getDiscountedPrice,
  appliedCoupon,
  billingPeriod,
  config,
  subStatus,
  getPlanWeight,
  handleSubscribe,
  setDowngradePlan,
  loading,
  cardVariants,
}: any) {
  return (
    <motion.div variants={cardVariants} className="h-full">
      <Card
        className={`relative h-full flex flex-col transition-all duration-300 bg-background/60 backdrop-blur-xl border ${plan.popular ? "border-primary border-2 shadow-2xl shadow-primary/20 scale-105 z-10" : "border-border/50 hover:shadow-xl hover:border-primary/30 hover:-translate-y-1"}`}
      >
        <div className="absolute top-0 right-0 transform translate-x-3 -translate-y-3 z-20">
          {plan.popular && (
            <motion.div
              initial={{ y: 0 }}
              animate={{ y: [-3, 3, -3] }}
              transition={{
                repeat: Infinity,
                duration: 4,
                ease: "easeInOut",
              }}
              className="bg-primary text-primary-foreground text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg flex items-center gap-1.5"
            >
              <Sparkles className="w-3 h-3" />
              Recommended
            </motion.div>
          )}
        </div>

        <CardHeader className="pt-8 pb-4">
          <CardTitle className="text-3xl font-black">{plan.name}</CardTitle>
          <CardDescription className="text-base mt-2">
            {plan.description}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col items-start">
          <div className="flex items-baseline justify-start gap-1 mb-8">
            {isDiscounted ? (
              <div className="flex flex-col items-start">
                <span className="text-xl font-bold line-through text-muted-foreground opacity-70 mb-1">
                  {plan.price}
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-black text-green-500 tracking-tight">
                    {formatPrice(getDiscountedPrice)}
                  </span>
                  <span className="text-muted-foreground font-semibold">
                    {plan.period}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black tracking-tight">
                  {plan.price}
                </span>
                <span className="text-muted-foreground font-semibold">
                  {plan.period}
                </span>
              </div>
            )}
          </div>

          {appliedCoupon?.type === "trial_extension" &&
            (!appliedCoupon.target_plan ||
              appliedCoupon.target_plan.toLowerCase() ===
                plan.name.toLowerCase()) &&
            (!appliedCoupon.target_interval ||
              appliedCoupon.target_interval === billingPeriod) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm font-bold text-green-600 bg-green-500/10 px-4 py-2 rounded-lg mb-6 w-full"
              >
                +{appliedCoupon.value} Days Free Trial
              </motion.div>
            )}

          <ul className="space-y-4 text-sm w-full">
            {plan.features.map((f: string, i: number) => (
              <li
                key={i}
                className="flex items-start gap-3 text-foreground/80 font-medium text-base"
              >
                <Check className="h-5 w-5 text-primary shrink-0 bg-primary/10 rounded-full p-0.5" />
                <span>{f}</span>
              </li>
            ))}
            {plan.missing?.map((m: string, i: number) => (
              <li
                key={`m-${i}`}
                className="flex items-start gap-3 text-muted-foreground/50 text-base"
              >
                <div className="h-5 w-5 border border-muted-foreground/30 rounded-full shrink-0 flex items-center justify-center">
                  <div className="w-2.5 h-px bg-muted-foreground/30" />
                </div>
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </CardContent>

        {config?.enable_paystack !== false && (
          <CardFooter className="pb-8 pt-4">
            {(() => {
              let buttonText =
                plan.period === "One-Time" ? "Buy Now" : "Subscribe";
              let buttonAction = "subscribe";

              if (subStatus?.status === "active") {
                const currentWeight = getPlanWeight(subStatus.plan || "");
                const targetWeight = getPlanWeight(plan.name);

                if (currentWeight === targetWeight && !subStatus.is_trial) {
                  buttonText = "Current Plan";
                  buttonAction = "current";
                } else if (currentWeight < targetWeight) {
                  buttonText = "Upgrade";
                  buttonAction = "upgrade";
                } else if (currentWeight > targetWeight) {
                  buttonText = "Downgrade";
                  buttonAction = "downgrade";
                } else if (
                  subStatus.is_trial &&
                  currentWeight === targetWeight
                ) {
                  buttonText = "Subscribe";
                  buttonAction = "subscribe";
                }
              }

              return (
                <Button
                  className={`w-full py-6 text-lg font-bold rounded-xl transition-all ${buttonAction === "current" ? "opacity-50" : ""}`}
                  variant={plan.popular ? "default" : "outline"}
                  onClick={() => {
                    if (buttonAction === "downgrade") {
                      setDowngradePlan({
                        id: plan.id,
                        amount: plan.numericPrice,
                        name: plan.name,
                      });
                    } else {
                      handleSubscribe(plan.id, plan.numericPrice, plan.name);
                    }
                  }}
                  disabled={loading !== null || buttonAction === "current"}
                >
                  {loading === plan.id ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      {buttonAction !== "current" && (
                        <CreditCard className="w-5 h-5 mr-2" />
                      )}
                      {buttonText}
                    </>
                  )}
                </Button>
              );
            })()}
          </CardFooter>
        )}
      </Card>
    </motion.div>
  );
}
