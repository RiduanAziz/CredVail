"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { CheckCircle2, Fingerprint, KeyRound, ShieldCheck } from "lucide-react";

export function CredentialCore() {
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      setPointer({
        x: (event.clientX / window.innerWidth - 0.5) * 2,
        y: (event.clientY / window.innerHeight - 0.5) * 2,
      });
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  return (
    <div
      aria-label="Illustration of a digitally verified credential and its trust network"
      className="credential-core"
      style={{ "--pointer-x": pointer.x, "--pointer-y": pointer.y } as CSSProperties}
    >
      <div className="credential-core__halo" />
      <div className="credential-core__orbit credential-core__orbit--one">
        <span><Fingerprint /></span>
      </div>
      <div className="credential-core__orbit credential-core__orbit--two">
        <span><KeyRound /></span>
      </div>
      <div className="credential-core__card">
        <div className="credential-core__card-top">
          <div className="flex items-center gap-2">
            <div className="credential-core__mark">C</div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/60">CREDVAIL</span>
          </div>
          <ShieldCheck className="h-5 w-5 text-indigo-200" />
        </div>
        <div className="credential-core__lines" />
        <div className="mt-auto">
          <p className="text-[9px] uppercase tracking-[0.2em] text-white/45">Verifiable credential</p>
          <p className="mt-1 text-lg font-semibold tracking-tight text-white">Trust, verified.</p>
        </div>
        <div className="credential-core__seal">
          <CheckCircle2 className="h-5 w-5" />
        </div>
      </div>
      <div className="credential-core__node credential-core__node--top" />
      <div className="credential-core__node credential-core__node--right" />
      <div className="credential-core__node credential-core__node--bottom" />
      <p className="credential-core__caption">Cryptographic trust layer</p>
    </div>
  );
}
