"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LANDING_CONTENT } from "@/config/landing-content";
import { CredentialCore } from "@/components/visual/CredentialCore";

export function HeroSection() {
  const router = useRouter();
  const [quickSearch, setQuickSearch] = useState("");
  const { hero } = LANDING_CONTENT;

  const handleQuickVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickSearch.trim()) {
      router.push(`/verify?id=${encodeURIComponent(quickSearch.trim())}`);
    } else {
      router.push("/verify");
    }
  };

  return (
    <section id="hero" className="relative overflow-hidden bg-transparent pb-16 pt-12 sm:pb-24 sm:pt-20 lg:pb-32 lg:pt-28">
      {/* Editorial Canvas Subtle Grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03] [background-image:linear-gradient(#0C0D12_1px,transparent_1px),linear-gradient(90deg,#0C0D12_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="container relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
          {/* Left Column: Editorial Typography & Actions */}
          <div className="relative z-10 flex flex-col items-start text-left">
            {/* Pill Eyebrow */}
            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-brand-navy shadow-sm backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{hero.eyebrow}</span>
            </div>

            {/* Oversized Contrasting Headline (Orbit-Style) */}
            <h1 className="mt-6 text-4xl font-extrabold tracking-[-0.04em] text-[#0C0D12] sm:text-6xl lg:text-[4.75rem] lg:leading-[1.02]">
              {hero.headlineLine1}
              <br />
              <span className="text-black/35 font-bold">
                {hero.headlineLine2}
              </span>
            </h1>

            {/* Compact Narrative Body */}
            <p className="mt-6 max-w-xl text-base leading-relaxed text-[#4B5563] sm:text-lg">
              {hero.description}
            </p>

            {/* Dual Action Rectangular Pills */}
            <div className="mt-8 flex flex-col w-full gap-3.5 sm:w-auto sm:flex-row sm:items-center">
              <Link href={hero.primaryCta.href}>
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-12 rounded-xl bg-[#0F1D38] px-7 text-sm font-semibold text-white shadow-md hover:bg-[#152445] transition-all hover:scale-[1.02]"
                >
                  {hero.primaryCta.label}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href={hero.secondaryCta.href}>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto h-12 rounded-xl border-black/15 bg-white/70 px-7 text-sm font-semibold text-[#0F1D38] hover:bg-white transition-all hover:scale-[1.02] backdrop-blur"
                >
                  {hero.secondaryCta.label}
                </Button>
              </Link>
            </div>

            {/* Quick Verification Search Box */}
            <form
              onSubmit={handleQuickVerify}
              className="mt-8 flex w-full max-w-lg items-center rounded-2xl border border-black/10 bg-white/90 p-1.5 shadow-sm backdrop-blur-sm transition-all focus-within:border-brand-cobalt focus-within:ring-2 focus-within:ring-brand-cobalt/20"
            >
              <div className="flex h-10 w-10 items-center justify-center text-muted-foreground pl-1">
                <Search className="h-4 w-4" />
              </div>
              <input
                type="text"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                placeholder={hero.verifyAction.placeholder}
                className="w-full bg-transparent px-2 text-xs sm:text-sm text-[#0C0D12] placeholder:text-muted-foreground focus:outline-none"
              />
              <Button
                type="submit"
                size="sm"
                className="h-9 shrink-0 rounded-xl bg-brand-cobalt px-4 text-xs font-semibold text-white hover:bg-blue-600 shadow-sm"
              >
                Verify
              </Button>
            </form>

            {/* Metrics Ribbon */}
            <div className="mt-10 grid w-full max-w-lg grid-cols-3 gap-4 border-t border-black/10 pt-6">
              {hero.metrics.map((metric) => (
                <div key={metric.label}>
                  <p className="font-mono text-lg font-bold text-[#0F1D38] sm:text-xl">
                    {metric.value}
                  </p>
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    {metric.label}
                  </p>
                  <p className="text-[10px] text-black/40">
                    {metric.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Interactive 3D Credential (Reference 01 + Reference 03) */}
          <div className="relative flex items-center justify-center w-full min-h-[440px] lg:min-h-[580px]">
            <CredentialCore />
          </div>
        </div>
      </div>
    </section>
  );
}
