"use client";

import { HeroSection } from "@/components/landing/HeroSection";
import { BrandTrustStrip } from "@/components/landing/BrandTrustStrip";
import { LessFrictionSection } from "@/components/landing/LessFrictionSection";
import { CredentialLifecycleSection } from "@/components/landing/CredentialLifecycleSection";
import { TrustNetworkSection } from "@/components/landing/TrustNetworkSection";
import { FinalDarkScene } from "@/components/landing/FinalDarkScene";

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-[#F8FAFC] selection:bg-[#0F1D38] selection:text-white">
      <main className="relative z-10">
        <HeroSection />
        <BrandTrustStrip />
        <LessFrictionSection />
        <CredentialLifecycleSection />
        <TrustNetworkSection />
        <FinalDarkScene />
      </main>
    </div>
  );
}
