"use client";

import { LANDING_CONTENT } from "@/config/landing-content";

export function TrustNetworkSection() {
  const { trustNetwork } = LANDING_CONTENT;

  return (
    <section id="trust-network" className="relative border-b border-black/8 bg-transparent py-20 sm:py-28 lg:py-36">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="max-w-2xl rounded-3xl p-6 bg-white/50 backdrop-blur-md border border-black/5">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-brand-cobalt">
            {trustNetwork.eyebrow}
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.03em] text-[#0C0D12] sm:text-5xl lg:text-[3.5rem] lg:leading-[1.08]">
            {trustNetwork.headlineLine1}
            <br />
            <span className="text-black/30 font-bold">
              {trustNetwork.headlineLine2}
            </span>
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[#4B5563]">
            {trustNetwork.description}
          </p>
        </div>

        {/* 3 Architecture Nodes with Translucent Glass */}
        <div className="mt-14 grid gap-8 lg:grid-cols-3">
          {trustNetwork.nodes.map((node, index) => (
            <div
              key={node.id}
              className="relative rounded-3xl border border-black/8 bg-white/85 p-8 shadow-sm backdrop-blur-md transition-all duration-300 hover:shadow-md hover:bg-white hover:border-black/15"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-brand-cobalt">
                  NODE 0{index + 1}
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700">
                  {node.metrics}
                </span>
              </div>

              <h3 className="mt-4 text-xl font-bold text-[#0F1D38]">
                {node.name}
              </h3>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 mt-1">
                {node.role}
              </p>

              <p className="mt-3 text-sm leading-relaxed text-[#6B7280]">
                {node.description}
              </p>

              <div className="mt-6 border-t border-black/5 pt-4">
                <p className="text-[10px] font-mono font-bold uppercase text-muted-foreground mb-2">
                  Standard Protocols
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {node.technologies.map((tech) => (
                    <span
                      key={tech}
                      className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
