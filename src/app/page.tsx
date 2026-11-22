"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { HeroSection } from "@/components/landing/HeroSection";
import { BrandTrustStrip } from "@/components/landing/BrandTrustStrip";
import { LessFrictionSection } from "@/components/landing/LessFrictionSection";
import { CredentialLifecycleSection } from "@/components/landing/CredentialLifecycleSection";
import { TrustNetworkSection } from "@/components/landing/TrustNetworkSection";
import { FinalDarkScene } from "@/components/landing/FinalDarkScene";

// Dynamically import Three.js scene with SSR disabled for optimal loading
const CredentialCoreScene = dynamic(
  () =>
    import("@/components/visual/three/CredentialCoreScene").then(
      (mod) => mod.CredentialCoreScene
    ),
  { ssr: false }
);

export default function HomePage() {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const totalHeight =
            document.documentElement.scrollHeight - window.innerHeight;
          const currentScroll = window.scrollY;
          const progress = totalHeight > 0 ? Math.min(1, Math.max(0, currentScroll / totalHeight)) : 0;
          setScrollProgress(progress);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#F4F4F6] selection:bg-brand-cobalt selection:text-white">
      {/*
        Background 3D Canvas Layer:
        Positioned fixed in the background (z-0), slowly moving and
        ambiently floating across the entire site's scroll depth.
      */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <CredentialCoreScene scrollProgress={scrollProgress} />
      </div>

      {/* Foreground Narrative Editorial Sections (z-10) */}
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
