"use client";

import { LANDING_CONTENT } from "@/config/landing-content";

export function TrustNetworkSection() {
  const { trustNetwork } = LANDING_CONTENT;

  return (
    <section id="trust-network" className="relative border-b border-black/[0.08] bg-transparent py-20 sm:py-24 lg:py-28">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="max-w-2xl">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-[#64748B]">
            {trustNetwork.eyebrow}
          </span>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.025em] text-[#0F172A] sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            {trustNetwork.headlineLine1}
            <br />
            <span className="text-[#64748B] font-normal">
              {trustNetwork.headlineLine2}
            </span>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[#475569]">
            {trustNetwork.description}
          </p>
        </div>

        {/* 3 Architecture Nodes */}
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {trustNetwork.nodes.map((node, index) => (
            <div
              key={node.id}
              className="relative rounded-xl border border-black/[0.08] bg-white p-7 shadow-sm transition-colors hover:border-black/20"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-[#0F1D38]">
                  Node 0{index + 1}
                </span>
                <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-medium text-[#475569]">
                  {node.metrics}
                </span>
              </div>

              <h3 className="mt-4 text-lg font-semibold text-[#0F172A]">
                {node.name}
              </h3>
              <p className="text-xs font-medium text-[#64748B] mt-0.5">
                {node.role}
              </p>

              <p className="mt-2.5 text-xs leading-relaxed text-[#475569]">
                {node.description}
              </p>

              <div className="mt-5 border-t border-black/[0.06] pt-4">
                <p className="text-[10px] font-mono font-medium uppercase tracking-wider text-[#64748B] mb-2">
                  Protocols & standards
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {node.technologies.map((tech) => (
                    <span
                      key={tech}
                      className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-[#475569]"
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
