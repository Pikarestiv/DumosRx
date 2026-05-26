"use client";

import { useEffect, useState } from "react";
import { HeaderSection } from "@/components/landing/header-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { HeroSection } from "@/components/landing/hero-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { BenefitsSection } from "@/components/landing/benefits-section";
import { CTASection } from "@/components/landing/cta-section";
import { FooterSection } from "@/components/landing/footer-section";

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("drx_token") : null;
    setIsLoggedIn(!!token);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <HeaderSection />

      <main>
        <HeroSection isLoggedIn={isLoggedIn} />
        <FeaturesSection />
        <BenefitsSection />
        <PricingSection />
        <CTASection />
      </main>

      <FooterSection />
    </div>
  );
}
