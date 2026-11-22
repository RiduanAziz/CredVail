"use client";

import { CheckCircle2, ShieldCheck, KeyRound, LockKeyhole } from "lucide-react";

export function CredentialStaticFallback() {
  return (
    <div
      role="img"
      aria-label="3D-styled physical digital verifiable credential artifact with cryptographic seal"
      className="relative mx-auto flex w-full max-w-[500px] flex-col items-center justify-center p-4"
    >
      {/* Outer ambient glow */}
      <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-tr from-brand-cobalt/20 via-brand-indigo/15 to-amber-500/10 blur-3xl" />

      {/* Orbital decorative rings */}
      <div className="pointer-events-none absolute inset-[-10%] rounded-full border border-indigo-500/20 [transform:rotateX(66deg)_rotateZ(-20deg)]" />
      <div className="pointer-events-none absolute inset-[-4%] rounded-full border border-brand-cobalt/15 [transform:rotateX(66deg)_rotateZ(25deg)]" />

      {/* Floating Trust Nodes */}
      <div className="absolute -left-2 top-10 flex items-center gap-1.5 rounded-full border border-white/20 bg-brand-navy/90 px-3 py-1 text-[11px] font-medium text-blue-100 shadow-lg backdrop-blur">
        <KeyRound className="h-3 w-3 text-brand-cobalt" />
        <span>Issuer Key Epoch 01</span>
      </div>

      <div className="absolute -right-2 bottom-12 flex items-center gap-1.5 rounded-full border border-white/20 bg-brand-navy/90 px-3 py-1 text-[11px] font-medium text-emerald-100 shadow-lg backdrop-blur">
        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
        <span>VALID_CURRENT</span>
      </div>

      {/* Main Credential Artifact */}
      <div className="relative w-full aspect-[1.58/1] rounded-2xl border border-white/40 bg-gradient-to-br from-[#ffffff] via-[#f8f9fc] to-[#e8ecf6] p-6 shadow-2xl ring-1 ring-black/5 [transform:perspective(1000px)_rotateX(6deg)_rotateY(-8deg)] transition-transform duration-500 hover:[transform:perspective(1000px)_rotateX(0deg)_rotateY(0deg)]">
        {/* Subtle guilloche background pattern */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.04] [background-image:radial-gradient(circle_at_center,#000_1px,transparent_1px)] [background-size:12px_12px]" />

        {/* Top Header */}
        <div className="flex items-start justify-between border-b border-black/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-navy font-black text-xs text-white shadow-sm">
              C
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-brand-navy">CREDVAIL</p>
              <p className="text-[8px] font-medium text-muted-foreground">W3C Verifiable Credential 2.0</p>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">
            <ShieldCheck className="h-3 w-3 text-emerald-600" />
            <span>ECDSA NIST P-256</span>
          </div>
        </div>

        {/* Credential Body */}
        <div className="mt-4 space-y-1">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-indigo-600">Accredited Achievement</p>
          <h3 className="text-base font-bold text-brand-navy sm:text-lg">
            Master of Digital Trust & Applied Cryptography
          </h3>
          <p className="text-[11px] text-muted-foreground">Conferred to: <span className="font-semibold text-foreground">Verified Recipient</span></p>
        </div>

        {/* Bottom Details & Gold Seal */}
        <div className="mt-6 flex items-end justify-between border-t border-black/5 pt-3">
          <div className="space-y-0.5 text-[9px] font-mono text-muted-foreground">
            <p>ROOT: 0x7a8f...92d1 (Sepolia L1)</p>
            <p>ISSUER: did:web:credvail.org</p>
          </div>

          {/* Embossed Golden Seal */}
          <div className="relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-amber-400 bg-gradient-to-tr from-amber-600 via-amber-400 to-amber-200 shadow-md">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-300/80 bg-amber-500/20">
              <ShieldCheck className="h-5 w-5 text-amber-900 drop-shadow-sm" />
            </div>
            <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
              <CheckCircle2 className="h-3 w-3" />
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Deterministic Cryptographic Credential
      </p>
    </div>
  );
}
