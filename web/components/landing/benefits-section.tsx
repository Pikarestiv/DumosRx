import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export function BenefitsSection() {
  return (
    <section id="benefits" className="py-24 overflow-hidden">
      <div className="container px-4 mx-auto">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 space-y-8">
            <h2 className="text-4xl font-black leading-tight">
              Why Nigerian Pharmacists choose{" "}
              <span className="text-primary">DumosRx</span>
            </h2>
            <div className="space-y-6">
              {[
                {
                  title: "No Internet? No Problem.",
                  desc: "Our local client app works 100% offline. No more waiting for pages to load during a sale.",
                },
                {
                  title: "NAFDAC & Expiry Alerts",
                  desc: "Automated tracking for regulatory compliance and proactive inventory management.",
                },
                {
                  title: "Transparent Pricing",
                  desc: "Pay in Naira, no hidden fees. Choose a plan that fits your pharmacy size.",
                },
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="mt-1">
                    <div className="bg-emerald-500/10 p-1 rounded-full">
                      <Check className="h-5 w-5 text-emerald-500" />
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-xl mb-1">{item.title}</h4>
                    <p className="text-muted-foreground leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Button
              size="lg"
              className="rounded-full px-8 h-12 font-bold shadow-lg shadow-primary/20"
              asChild
            >
              <Link href="/register">Join the Community</Link>
            </Button>
          </div>
          <div className="flex-1 relative">
            <div className="absolute -inset-4 bg-primary/5 rounded-[40px] rotate-3" />
            <div className="relative aspect-square rounded-[32px] overflow-hidden shadow-2xl border-8 border-background">
              <Image
                src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?q=80&w=2070&auto=format&fit=crop"
                alt="Pharmacist working"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
