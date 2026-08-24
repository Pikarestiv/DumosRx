import Image from "next/image";
import Link from "next/link";
import { WEB_APP_DASHBOARD_URL, APP_URL } from "@/lib/constants";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="relative pt-20 pb-32 overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 opacity-10 dark:opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary rounded-full blur-[120px]" />
        <div className="absolute bottom-[10%] right-[-10%] w-[30%] h-[30%] bg-blue-400 rounded-full blur-[100px]" />
      </div>

      <div className="container px-4 mx-auto text-center">
        {/* <div className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium leading-5 text-primary ring-1 ring-inset ring-primary/20 bg-primary/5 mb-8">
          <span>Trusted by 500+ Nigerian Stores</span>
          <ArrowRight className="ml-1 h-4 w-4" />
        </div> */}
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-linear-to-b from-foreground to-foreground/70">
          The Intelligent Way to <br className="hidden md:block" />
          <span className="leading-[84px]">Manage</span> Your{" "}
          <span className="text-primary">Store</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed">
          DumosRx is a leading offline-first store management system built for
          Nigerian businesses. Reliable even during power outages and poor
          internet connectivity
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
          <Button
            size="lg"
            className="h-14 px-8 text-lg font-bold shadow-xl shadow-primary/20"
            asChild
          >
            <Link href={APP_URL}>Get Started</Link>
          </Button>
        </div>

        {/* App Mockup */}
        <div className="relative mx-auto max-w-5xl">
          <div className="absolute -inset-1 bg-linear-to-r from-primary to-blue-600 rounded-2xl blur-sm opacity-25" />
          <div className="relative bg-background border rounded-xl overflow-hidden shadow-2xl">
            <div className="h-12 bg-muted/50 border-b flex items-center px-4 gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/20" />
                <div className="w-3 h-3 rounded-full bg-amber-500/20" />
                <div className="w-3 h-3 rounded-full bg-green-500/20" />
              </div>
              <div className="mx-auto w-full max-w-sm h-6 bg-background rounded-md border text-[10px] flex items-center px-3 text-muted-foreground">
                {WEB_APP_DASHBOARD_URL.replace(/^https?:\/\//, "")}
              </div>
            </div>
            <div className="aspect-video bg-muted/20 relative">
              <Image
                src="/images/dashboard-preview.png"
                alt="DumosRx Dashboard"
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-linear-to-t from-background/40 to-transparent" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
