"use client";

import { KeyRound, Wallet, ShieldCheck, SearchCheck } from "lucide-react";
import { LANDING_CONTENT } from "@/config/landing-content";

const iconMap = {
  KeyRound,
  Wallet,
  ShieldCheck,
  SearchCheck,
};

export function BrandTrustStrip() {
  const { trustStrip } = LANDING_CONTENT;

  return (
    <section id="brand-trust" className="relative border-y border-black/[0.08] bg-white/60 py-16">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section Header */}
        <p className="text-center text-xs font-medium uppercase tracking-[0.14em] text-[#64748B]">
          {trustStrip.header}
        </p>

        {/* 4 Pillars Grid */}
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {trustStrip.pillars.map((pillar) => {
            const IconComponent = iconMap[pillar.iconName];
            return (
              <div
                key={pillar.id}
                className="relative rounded-xl border border-black/[0.08] bg-white p-6 shadow-sm transition-colors hover:border-black/20"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0F1D38]/[0.06] text-[#0F1D38]">
                    <IconComponent className="h-4.5 w-4.5" />
                  </div>
                  <span className="font-mono text-[11px] font-medium text-[#475569] bg-slate-100 px-2 py-0.5 rounded">
                    {pillar.metric}
                  </span>
                </div>

                <h3 className="mt-4 text-base font-semibold text-[#0F172A]">
                  {pillar.title}
                </h3>
                <p className="text-xs font-medium text-[#64748B] mt-0.5">
                  {pillar.tagline}
                </p>
                <p className="mt-2.5 text-xs leading-relaxed text-[#475569]">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
