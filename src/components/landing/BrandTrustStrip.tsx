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
    <section className="relative border-y border-black/8 bg-white/45 backdrop-blur-md py-14 sm:py-16">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6">
        {/* Subtle Section Eyebrow Header */}
        <p className="text-center font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-[#6B7280]">
          {trustStrip.header}
        </p>

        {/* 4 Pillars Grid */}
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {trustStrip.pillars.map((pillar) => {
            const IconComponent = iconMap[pillar.iconName];
            return (
              <div
                key={pillar.id}
                className="group relative rounded-2xl border border-black/8 bg-white/80 p-6 backdrop-blur-md transition-all duration-300 hover:border-brand-cobalt/40 hover:bg-white hover:shadow-lg hover:-translate-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-navy/5 text-brand-navy transition-colors group-hover:bg-brand-cobalt group-hover:text-white">
                    <IconComponent className="h-5 w-5" />
                  </div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-brand-cobalt bg-blue-50 px-2 py-0.5 rounded">
                    {pillar.metric}
                  </span>
                </div>

                <h3 className="mt-5 text-base font-bold text-[#0F1D38]">
                  {pillar.title}
                </h3>
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 mt-0.5">
                  {pillar.tagline}
                </p>
                <p className="mt-2.5 text-xs leading-relaxed text-[#6B7280]">
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
