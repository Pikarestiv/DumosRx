import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CTASection() {
  return (
    <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[50%] h-full bg-white/5 skew-x-[-20deg] translate-x-1/2" />
      <div className="container px-4 mx-auto relative text-center">
        <h2 className="text-4xl md:text-5xl font-black mb-6">
          Ready to modernize your pharmacy?
        </h2>
        <p className="text-xl text-primary-foreground/80 mb-10 max-w-2xl mx-auto">
          Join hundreds of pharmacies across Nigeria using DumosRx to
          increase profits and improve patient care.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            variant="secondary"
            className="h-14 px-10 text-lg font-bold"
            asChild
          >
            <Link href="/register">Create Your Account</Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 px-10 text-lg font-bold bg-transparent text-white border-white hover:bg-white/10"
            asChild
          >
            <Link href="/login">Sign In</Link>
          </Button>
        </div>
        <p className="mt-8 text-primary-foreground/60 text-sm font-medium italic">
          * No credit card required to start your free trial.
        </p>
      </div>
    </section>
  );
}
