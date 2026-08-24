"use client";

import { HeaderSection } from "@/components/landing/header-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { HeroSection } from "@/components/landing/hero-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { BenefitsSection } from "@/components/landing/benefits-section";
import { CTASection } from "@/components/landing/cta-section";
import { FooterSection } from "@/components/landing/footer-section";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <HeaderSection />

      <main>
        <HeroSection />
        <FeaturesSection />
        <BenefitsSection />
        <PricingSection />
        <CTASection />
      </main>

      <FooterSection />
    </div>
  );
}
