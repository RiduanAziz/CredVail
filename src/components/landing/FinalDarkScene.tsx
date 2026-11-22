"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LANDING_CONTENT } from "@/config/landing-content";

export function FinalDarkScene() {
  const { finale } = LANDING_CONTENT;

  return (
    <section className="relative overflow-hidden bg-[#0A1224]/85 backdrop-blur-md py-24 sm:py-36 lg:py-44 text-white">
      {/* Background ambient lighting wisps */}
      <div className="pointer-events-none absolute left-1/4 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-cobalt/15 blur-[120px]" />
      <div className="pointer-events-none absolute right-1/4 top-1/2 h-[450px] w-[450px] -translate-y-1/2 translate-x-1/2 rounded-full bg-brand-violet/15 blur-[120px]" />

      <div className="container relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-4xl text-center">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-200 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>{finale.eyebrow}</span>
          </div>

          {/* Inverted Hero Headline */}
          <h2 className="mt-8 text-4xl font-extrabold tracking-[-0.04em] text-white sm:text-6xl lg:text-[4.75rem] lg:leading-[1.02]">
            {finale.headlineLine1}
            <br />
            <span className="text-white/35 font-bold">
              {finale.headlineLine2}
            </span>
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-blue-100/70 sm:text-lg">
            {finale.description}
          </p>

          {/* Dual Action CTAs */}
          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row sm:items-center">
            <Link href={finale.primaryCta.href}>
              <Button
                size="lg"
                className="h-13 rounded-2xl bg-white px-8 text-sm font-semibold text-brand-navy shadow-lg hover:bg-blue-50 transition-all hover:scale-[1.02]"
              >
                {finale.primaryCta.label}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href={finale.secondaryCta.href}>
              <Button
                size="lg"
                variant="outline"
                className="h-13 rounded-2xl border-white/20 bg-white/5 px-8 text-sm font-semibold text-white hover:bg-white/10 transition-all hover:scale-[1.02]"
              >
                {finale.secondaryCta.label}
              </Button>
            </Link>
          </div>

          {/* Badges Strip */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-3">
            {finale.badges.map((badge) => (
              <div
                key={badge}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-blue-100/80"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>{badge}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
