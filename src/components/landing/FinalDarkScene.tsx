"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LANDING_CONTENT } from "@/config/landing-content";

export function FinalDarkScene() {
  const { finale } = LANDING_CONTENT;

  return (
    <section id="finale" className="relative overflow-hidden bg-[#0A1224] py-20 sm:py-28 lg:py-32 text-white">
      <div className="container relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span>{finale.eyebrow}</span>
          </div>

          {/* Headline */}
          <h2 className="mt-6 text-3xl font-semibold tracking-[-0.025em] text-white sm:text-5xl lg:text-[3.5rem] lg:leading-[1.08]">
            {finale.headlineLine1}
            <br />
            <span className="text-slate-400 font-normal">
              {finale.headlineLine2}
            </span>
          </h2>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
            {finale.description}
          </p>

          {/* Dual Action CTAs */}
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:items-center">
            <Link href={finale.primaryCta.href}>
              <Button
                size="lg"
                className="h-11 rounded-lg bg-white px-6 text-sm font-medium text-[#0A1224] shadow-none hover:bg-slate-100 transition-colors"
              >
                {finale.primaryCta.label}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href={finale.secondaryCta.href}>
              <Button
                size="lg"
                variant="outline"
                className="h-11 rounded-lg border-white/20 bg-transparent px-6 text-sm font-medium text-white hover:bg-white/[0.08] transition-colors shadow-none"
              >
                {finale.secondaryCta.label}
              </Button>
            </Link>
          </div>

          {/* Badges Strip */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-2">
            {finale.badges.map((badge) => (
              <span
                key={badge}
                className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-slate-300"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
