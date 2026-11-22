"use client";

import { ShieldCheck, Check, Search } from "lucide-react";

export function CredentialStaticFallback() {
  return (
    <div
      role="img"
      aria-label="3D-styled physical digital verifiable credential artifact with circular plinth, shield, ribbon seal, and magnifying glass (Reference 01)"
      className="relative mx-auto flex w-full max-w-[520px] flex-col items-center justify-center p-6 select-none"
    >
      {/* Background Soft Studio Halo Glow */}
      <div className="absolute inset-0 -z-10 flex items-center justify-center">
        <div className="h-80 w-80 rounded-full bg-gradient-to-tr from-brand-cobalt/15 via-indigo-100/40 to-transparent blur-2xl" />
      </div>

      {/* Flanking Trust Elements (CSS-Rendered Metaphors for Reference 01) */}
      <div className="relative flex w-full items-center justify-center">
        {/* Left: Shield with Checkmark */}
        <div className="absolute -left-3 bottom-12 z-20 hidden sm:flex h-20 w-16 flex-col items-center justify-center rounded-2xl border border-white/60 bg-gradient-to-br from-slate-100 to-slate-200 p-2 shadow-xl ring-1 ring-black/5 [transform:rotate(-8deg)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600/10 text-brand-cobalt">
            <Check className="h-6 w-6 stroke-[3]" />
          </div>
          <span className="mt-1 font-mono text-[8px] font-bold uppercase tracking-wider text-slate-600">Trust</span>
        </div>

        {/* Center: Main Reference 01 Certificate Plaque */}
        <div className="relative z-10 w-full max-w-[340px] aspect-[1/1.36] rounded-2xl border-2 border-[#0F1D38]/20 bg-gradient-to-b from-[#FFFFFF] via-[#FAFBFD] to-[#F1F5F9] p-5 shadow-2xl ring-1 ring-black/5 [transform:perspective(1000px)_rotateX(4deg)]">
          {/* Decorative Corner Insets & Inner Border */}
          <div className="relative flex h-full w-full flex-col justify-between rounded-xl border border-[#0F1D38]/30 p-4">
            {/* Header */}
            <div className="text-center">
              <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F1D38] font-black text-xs text-white shadow-sm">
                C
              </div>
              <p className="mt-2 font-mono text-[9px] font-extrabold uppercase tracking-[0.2em] text-[#0F1D38]">
                CREDVAIL NETWORK
              </p>
              <p className="text-[7px] font-semibold uppercase tracking-wider text-blue-600">
                W3C Verifiable Credential 2.0
              </p>
            </div>

            {/* Title & Recipient */}
            <div className="my-2 text-center space-y-1">
              <p className="font-mono text-[8px] font-bold uppercase tracking-widest text-[#64748B]">
                Accreditation Standard
              </p>
              <h4 className="text-xs font-black text-[#0F1D38] sm:text-sm">
                CERTIFICATE OF ACCREDITATION
              </h4>
              <p className="text-[9px] italic text-[#475569]">Conferred unto Verified Institution</p>
            </div>

            {/* Claims Mini-table */}
            <div className="rounded-lg bg-black/[0.02] p-2 text-[8px] font-mono text-slate-600 space-y-0.5 border border-black/5">
              <p>URN: urn:credvail:vc:institution:2026</p>
              <p>STATUS: CRYPTOGRAPHICALLY SECURED</p>
            </div>

            {/* Bottom Footer & Pinned Ribbon Seal */}
            <div className="flex items-end justify-between pt-2 border-t border-black/5">
              <div className="space-y-0.5 text-[8px] font-mono text-slate-500">
                <p>DID: did:web:credvail.org</p>
                <p>ROOT: 0x89e2...6701</p>
              </div>

              {/* Ribbon Seal Medallion (Lower Right) */}
              <div className="relative flex h-11 w-11 items-center justify-center rounded-full border-2 border-amber-400 bg-gradient-to-tr from-blue-900 via-blue-700 to-indigo-800 shadow-md">
                <ShieldCheck className="h-5 w-5 text-amber-300 drop-shadow-sm" />
                {/* Ribbon tails hanging down */}
                <div className="absolute -bottom-2 -left-0.5 h-3 w-1.5 rounded-sm bg-blue-900 [transform:rotate(18deg)]" />
                <div className="absolute -bottom-2 -right-0.5 h-3 w-1.5 rounded-sm bg-blue-900 [transform:rotate(-18deg)]" />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Magnifying Glass */}
        <div className="absolute -right-3 bottom-12 z-20 hidden sm:flex h-20 w-16 flex-col items-center justify-center rounded-2xl border border-white/60 bg-gradient-to-br from-slate-100 to-slate-200 p-2 shadow-xl ring-1 ring-black/5 [transform:rotate(8deg)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600/10 text-brand-cobalt">
            <Search className="h-6 w-6 stroke-[2.5]" />
          </div>
          <span className="mt-1 font-mono text-[8px] font-bold uppercase tracking-wider text-slate-600">Verify</span>
        </div>
      </div>

      {/* Studio Plinth Base Underneath */}
      <div className="relative -mt-3 h-5 w-72 rounded-full border border-black/10 bg-gradient-to-r from-slate-200 via-white to-slate-200 shadow-md">
        <div className="absolute inset-x-2 bottom-0.5 h-0.5 rounded-full bg-slate-400/40" />
      </div>

      <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-widest text-[#64748B]">
        Authenticated Institutional Digital Document
      </p>
    </div>
  );
}
