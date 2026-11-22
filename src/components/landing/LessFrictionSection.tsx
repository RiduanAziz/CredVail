"use client";

import { Check, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LANDING_CONTENT } from "@/config/landing-content";

export function LessFrictionSection() {
  const { lessFriction } = LANDING_CONTENT;

  return (
    <section id="platform" className="relative border-b border-black/8 bg-transparent py-20 sm:py-28 lg:py-36">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-start">
          {/* Left Column: Pinned Story Headline with glass treatment */}
          <div className="lg:sticky lg:top-28 rounded-3xl p-4 lg:p-6 bg-white/40 backdrop-blur-sm border border-black/5">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-brand-cobalt">
              {lessFriction.eyebrow}
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.03em] text-[#0C0D12] sm:text-5xl lg:text-[3.5rem] lg:leading-[1.08]">
              {lessFriction.headlineLine1}
              <br />
              <span className="text-black/30 font-bold">
                {lessFriction.headlineLine2}
              </span>
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-[#4B5563]">
              {lessFriction.description}
            </p>

            <div className="mt-8 flex items-center gap-4">
              <Link href="/register">
                <Button className="h-11 rounded-xl bg-brand-navy px-6 text-sm font-semibold text-white hover:bg-[#152445] shadow-md">
                  <span>Get Started</span>
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/verify">
                <Button variant="outline" className="h-11 rounded-xl border-black/15 bg-white/80 px-6 text-sm font-semibold text-brand-navy hover:bg-white backdrop-blur">
                  Inspect Verification
                </Button>
              </Link>
            </div>
          </div>

          {/* Right Column: Scrolling Capability Cards (Glass treatment for 3D background visibility) */}
          <div className="space-y-6">
            {lessFriction.cards.map((card) => (
              <div
                key={card.step}
                className="relative rounded-3xl border border-black/8 bg-white/85 p-8 shadow-sm backdrop-blur-md transition-all duration-300 hover:shadow-md hover:bg-white/95 hover:border-black/15"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-brand-cobalt">
                    {card.step}
                  </span>
                  <span className="rounded-full bg-brand-navy/5 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-brand-navy">
                    {card.badge}
                  </span>
                </div>

                <h3 className="mt-4 text-xl font-bold text-[#0C0D12] sm:text-2xl">
                  {card.title}
                </h3>
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 mt-1">
                  {card.subtitle}
                </p>

                <p className="mt-3 text-sm leading-relaxed text-[#6B7280]">
                  {card.description}
                </p>

                <div className="mt-6 space-y-2 border-t border-black/5 pt-4">
                  {card.details.map((detail, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs font-medium text-[#374151]">
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <Check className="h-2.5 w-2.5" />
                      </div>
                      <span>{detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
