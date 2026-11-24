"use client";

import { Check, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LANDING_CONTENT } from "@/config/landing-content";

export function LessFrictionSection() {
  const { lessFriction } = LANDING_CONTENT;

  return (
    <section id="platform" className="relative border-b border-black/[0.08] bg-transparent py-20 sm:py-24 lg:py-28">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-start">
          {/* Left Column: Pinned Story Headline */}
          <div className="lg:sticky lg:top-28">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-[#64748B]">
              {lessFriction.eyebrow}
            </span>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.025em] text-[#0F172A] sm:text-4xl lg:text-5xl lg:leading-[1.1]">
              {lessFriction.headlineLine1}
              <br />
              <span className="text-[#64748B] font-normal">
                {lessFriction.headlineLine2}
              </span>
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-[#475569]">
              {lessFriction.description}
            </p>

            <div className="mt-8 flex items-center gap-3">
              <Link href="/register">
                <Button className="h-10 rounded-lg bg-[#0F1D38] px-5 text-xs font-medium text-white hover:bg-[#152445] shadow-none transition-colors">
                  <span>Get started</span>
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </Link>
              <Link href="/verify">
                <Button variant="outline" className="h-10 rounded-lg border-black/[0.12] bg-white px-5 text-xs font-medium text-[#0F1D38] hover:bg-slate-50 shadow-none transition-colors">
                  Inspect verification
                </Button>
              </Link>
            </div>
          </div>

          {/* Right Column: Scrolling Capability Cards */}
          <div className="space-y-6">
            {lessFriction.cards.map((card) => (
              <div
                key={card.step}
                className="relative rounded-xl border border-black/[0.08] bg-white p-7 shadow-sm transition-colors hover:border-black/20"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-[#0F1D38]">
                    {card.step}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-medium text-[#475569]">
                    {card.badge}
                  </span>
                </div>

                <h3 className="mt-4 text-lg font-semibold text-[#0F172A]">
                  {card.title}
                </h3>
                <p className="text-xs font-medium text-[#64748B] mt-0.5">
                  {card.subtitle}
                </p>

                <p className="mt-2.5 text-xs leading-relaxed text-[#475569]">
                  {card.description}
                </p>

                <div className="mt-5 space-y-2 border-t border-black/[0.06] pt-4">
                  {card.details.map((detail, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-[#334155]">
                      <Check className="h-3.5 w-3.5 text-[#0F1D38] shrink-0" />
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
