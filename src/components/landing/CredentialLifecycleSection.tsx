"use client";

import { LANDING_CONTENT } from "@/config/landing-content";

export function CredentialLifecycleSection() {
  const { lifecycle } = LANDING_CONTENT;

  return (
    <section id="lifecycle" className="relative border-b border-black/8 bg-white/35 backdrop-blur-sm py-20 sm:py-28 lg:py-36">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center rounded-3xl p-6 bg-white/50 backdrop-blur-md border border-black/5">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-brand-cobalt">
            {lifecycle.eyebrow}
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.03em] text-[#0C0D12] sm:text-5xl lg:text-[3.5rem] lg:leading-[1.08]">
            {lifecycle.headlineLine1}
            <br />
            <span className="text-black/30 font-bold">
              {lifecycle.headlineLine2}
            </span>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#4B5563]">
            {lifecycle.description}
          </p>
        </div>

        {/* 6 Lifecycle Cards Grid with Translucent Glass */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {lifecycle.milestones.map((milestone) => (
            <div
              key={milestone.number}
              className="group relative flex flex-col justify-between rounded-3xl border border-black/8 bg-white/80 p-7 backdrop-blur-md transition-all duration-300 hover:border-brand-cobalt/40 hover:bg-white hover:shadow-md hover:-translate-y-1"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-brand-navy/40 group-hover:text-brand-cobalt transition-colors">
                    PHASE {milestone.number}
                  </span>
                  <span className="rounded-full bg-brand-navy/5 px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-brand-navy">
                    {milestone.phase}
                  </span>
                </div>

                <h3 className="mt-5 text-lg font-bold text-[#0F1D38]">
                  {milestone.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">
                  {milestone.description}
                </p>
              </div>

              <div className="mt-6 border-t border-black/5 pt-4">
                <span className="font-mono text-[10px] font-semibold text-indigo-600">
                  {milestone.standard}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
