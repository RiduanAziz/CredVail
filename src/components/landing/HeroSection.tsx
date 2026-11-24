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
    <section id="hero" className="relative overflow-hidden bg-transparent pb-16 pt-12 sm:pb-24 sm:pt-16 lg:pb-28 lg:pt-20">
      {/* Subtle Archival Grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:linear-gradient(#0F172A_1px,transparent_1px),linear-gradient(90deg,#0F172A_1px,transparent_1px)] [background-size:40px_40px]" />

      <div className="container relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
          {/* Left Column: Editorial Typography & Actions */}
          <div className="relative z-10 flex flex-col items-start text-left">
            {/* Eyebrow Label */}
            <div className="inline-flex items-center gap-2 rounded-md border border-black/[0.08] bg-white px-3 py-1 text-xs font-medium text-[#475569]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0F1D38]" />
              <span>{hero.eyebrow}</span>
            </div>

            {/* Headline */}
            <h1 className="mt-6 text-3xl font-semibold tracking-[-0.025em] text-[#0F172A] sm:text-5xl lg:text-[3.75rem] lg:leading-[1.08]">
              {hero.headlineLine1}
              <br />
              <span className="text-[#64748B] font-normal">
                {hero.headlineLine2}
              </span>
            </h1>

            {/* Compact Narrative Body */}
            <p className="mt-6 max-w-xl text-base leading-relaxed text-[#475569] sm:text-lg">
              {hero.description}
            </p>

            {/* Dual Actions */}
            <div className="mt-8 flex flex-col w-full gap-3 sm:w-auto sm:flex-row sm:items-center">
              <Link href={hero.primaryCta.href}>
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-11 rounded-lg bg-[#0F1D38] px-6 text-sm font-medium text-white shadow-none hover:bg-[#152445] transition-colors"
                >
                  {hero.primaryCta.label}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href={hero.secondaryCta.href}>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto h-11 rounded-lg border-black/[0.12] bg-white px-6 text-sm font-medium text-[#0F1D38] hover:bg-slate-50 transition-colors shadow-none"
                >
                  {hero.secondaryCta.label}
                </Button>
              </Link>
            </div>

            {/* Quick Verification Search Box */}
            <form
              onSubmit={handleQuickVerify}
              className="mt-6 flex w-full max-w-md items-center rounded-lg border border-black/[0.10] bg-white p-1 transition-colors focus-within:border-[#0F1D38]"
            >
              <div className="flex h-9 w-9 items-center justify-center text-slate-400 pl-1">
                <Search className="h-4 w-4" />
              </div>
              <input
                type="text"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                placeholder={hero.verifyAction.placeholder}
                className="w-full bg-transparent px-2 text-xs sm:text-sm text-[#0F172A] placeholder:text-slate-400 focus:outline-none"
              />
              <Button
                type="submit"
                size="sm"
                className="h-8 shrink-0 rounded-md bg-[#0F1D38] px-3.5 text-xs font-medium text-white hover:bg-[#152445] transition-colors shadow-none"
              >
                Verify
              </Button>
            </form>

            {/* Metrics Ribbon */}
            <div className="mt-8 grid w-full max-w-lg grid-cols-3 gap-6 border-t border-black/[0.08] pt-6">
              {hero.metrics.map((metric) => (
                <div key={metric.label}>
                  <p className="font-mono text-lg font-medium tabular-nums text-[#0F172A] sm:text-xl">
                    {metric.value}
                  </p>
                  <p className="text-xs font-medium text-[#475569] mt-0.5">
                    {metric.label}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">
                    {metric.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: 3D Credential Stage */}
          <div className="relative flex items-center justify-center w-full min-h-[440px] lg:min-h-[560px]">
            <CredentialCore />
          </div>
        </div>
      </div>
    </section>
  );
}
