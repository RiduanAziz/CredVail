"use client";

import { LANDING_CONTENT } from "@/config/landing-content";

export function CredentialLifecycleSection() {
  const { lifecycle } = LANDING_CONTENT;

  return (
    <section id="lifecycle" className="relative border-b border-black/[0.08] bg-transparent py-20 sm:py-24 lg:py-28">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-[#64748B]">
            {lifecycle.eyebrow}
          </span>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.025em] text-[#0F172A] sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            {lifecycle.headlineLine1}
            <br />
            <span className="text-[#64748B] font-normal">
              {lifecycle.headlineLine2}
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[#475569]">
            {lifecycle.description}
          </p>
        </div>

        {/* 6 Lifecycle Cards Grid */}
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {lifecycle.milestones.map((milestone) => (
            <div
              key={milestone.number}
              className="relative flex flex-col justify-between rounded-xl border border-black/[0.08] bg-white p-6 shadow-sm transition-colors hover:border-black/20"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium text-[#64748B]">
                    Phase {milestone.number}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-medium text-[#475569]">
                    {milestone.phase}
                  </span>
                </div>

                <h3 className="mt-4 text-base font-semibold text-[#0F172A]">
                  {milestone.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-[#475569]">
                  {milestone.description}
                </p>
              </div>

              <div className="mt-5 border-t border-black/[0.06] pt-3.5">
                <span className="font-mono text-[11px] font-medium text-[#64748B]">
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
