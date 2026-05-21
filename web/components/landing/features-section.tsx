import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Zap, Shield, Smartphone, Globe, BarChart3, Database } from "lucide-react";

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-muted/50">
      <div className="container px-4 mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-base font-bold text-primary tracking-wider uppercase mb-3">
            Features
          </h2>
          <h3 className="text-4xl font-black mb-6">
            Everything you need to run a modern pharmacy
          </h3>
          <p className="text-lg text-muted-foreground leading-relaxed">
            We&apos;ve built DumosRx specifically for the Nigerian market,
            focusing on the real-world challenges you face every day.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              title: "Offline-First Sync",
              description:
                "Sell and manage inventory even without internet. Data syncs automatically to the cloud when you're back online.",
              icon: Zap,
            },
            {
              title: "Expiry Tracking",
              description:
                "Get notified months before medicines expire. Reduce losses and ensure patient safety with automated alerts.",
              icon: Shield,
            },
            {
              title: "Mobile Dashboard",
              description:
                "Monitor your store sales, staff activity, and inventory levels from your phone, anywhere in the world.",
              icon: Smartphone,
            },
            {
              title: "Multi-Store Support",
              description:
                "Manage multiple branches from a single cloud account. Aggregate reporting and central stock management.",
              icon: Globe,
            },
            {
              title: "Sales Analytics",
              description:
                "Deep insights into your most profitable products, peak sales periods, and staff performance.",
              icon: BarChart3,
            },
            {
              title: "Secure Backups",
              description:
                "Your pharmacy data is encrypted and backed up daily. Never lose a record to system failure or theft.",
              icon: Database,
            },
          ].map((feature, i) => (
            <Card
              key={i}
              className="border-none shadow-sm hover:shadow-md transition-all group"
            >
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="h-6 w-6" />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
                <CardDescription className="text-base">
                  {feature.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
