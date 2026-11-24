"use client";

export function CredentialStaticFallback() {
  return (
    <div
      role="img"
      aria-label="Static institutional verifiable credential artifact (Reference 01 presentation)"
      className="relative mx-auto flex w-full max-w-[340px] flex-col items-center justify-center select-none"
    >
      <div className="relative w-full rounded-xl border border-slate-300/90 bg-[#FAFBFD] p-3.5 shadow-xl ring-1 ring-indigo-500/15 sm:p-4">
        {/* Outer Double Ornamental Frame */}
        <div className="relative rounded-sm border-[1.5px] border-[#1B3A6B] p-1">
          <div className="relative border border-[#1B3A6B]/55 px-4 pb-5 pt-4 text-center">
            {/* Corner Arc Accents */}
            <span className="pointer-events-none absolute -left-px -top-px h-3 w-3 rounded-br-full border-b border-r border-[#1B3A6B] bg-[#FAFBFD]" />
            <span className="pointer-events-none absolute -right-px -top-px h-3 w-3 rounded-bl-full border-b border-l border-[#1B3A6B] bg-[#FAFBFD]" />
            <span className="pointer-events-none absolute -bottom-px -left-px h-3 w-3 rounded-tr-full border-r border-t border-[#1B3A6B] bg-[#FAFBFD]" />
            <span className="pointer-events-none absolute -bottom-px -right-px h-3 w-3 rounded-tl-full border-l border-t border-[#1B3A6B] bg-[#FAFBFD]" />

            {/* Illustrative Demonstration Label */}
            <div className="inline-block rounded-full border border-indigo-200 bg-indigo-50/90 px-2.5 py-0.5 font-mono text-[8px] font-medium uppercase tracking-[0.16em] text-indigo-900">
              Illustrative Demonstration
            </div>

            <p className="mt-3 font-mono text-[8.5px] font-medium uppercase tracking-[0.18em] text-[#1B3A6B]">
              CREDVAIL Institutional Registry
            </p>
            <h3 className="mt-2 font-serif text-lg font-semibold leading-snug text-[#0B172A] sm:text-xl">
              Certificate of Professional Distinction
            </h3>

            <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-slate-400">Awarded to</p>
            <p className="mt-0.5 font-serif text-xl font-semibold text-[#0B172A]">Eleanor M. Vance</p>
            <p className="font-mono text-[8.5px] text-slate-400">(Sample Recipient — Illustrative Entry)</p>

            <p className="mx-auto mt-2.5 max-w-[230px] text-[10px] leading-relaxed text-slate-600">
              For demonstrating mastery in Digital Trust Architecture &amp; Cryptographic Governance.
            </p>

            {/* Subtle Guilloché Wave SVG */}
            <svg
              className="pointer-events-none mx-auto mt-3 h-8 w-full opacity-25"
              viewBox="0 0 260 36"
              fill="none"
              aria-hidden="true"
            >
              <path d="M0 18 Q 65 2, 130 18 T 260 18" stroke="#1B3A6B" strokeWidth="0.7" />
              <path d="M0 22 Q 65 6, 130 22 T 260 22" stroke="#1B3A6B" strokeWidth="0.6" />
              <path d="M0 26 Q 65 10, 130 26 T 260 26" stroke="#4F46E5" strokeWidth="0.5" />
            </svg>

            {/* Lower Metadata + QR + Embossed Rosette Seal */}
            <div className="mt-2 flex items-end justify-between gap-2 text-left">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  {/* Illustrative Mini QR */}
                  <div
                    className="flex h-10 w-10 flex-col items-center justify-center rounded border border-slate-300 bg-white p-1"
                    aria-label="Illustrative QR representation"
                  >
                    <svg
                      className="h-full w-full text-[#0B172A]"
                      viewBox="0 0 21 21"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <rect x="0" y="0" width="6" height="6" />
                      <rect x="1" y="1" width="4" height="4" fill="#fff" />
                      <rect x="2" y="2" width="2" height="2" />
                      <rect x="15" y="0" width="6" height="6" />
                      <rect x="16" y="1" width="4" height="4" fill="#fff" />
                      <rect x="17" y="2" width="2" height="2" />
                      <rect x="0" y="15" width="6" height="6" />
                      <rect x="1" y="16" width="4" height="4" fill="#fff" />
                      <rect x="2" y="17" width="2" height="2" />
                      <rect x="8" y="2" width="2" height="2" />
                      <rect x="11" y="4" width="2" height="3" />
                      <rect x="8" y="8" width="5" height="2" />
                      <rect x="9" y="11" width="2" height="4" />
                      <rect x="13" y="12" width="3" height="3" />
                      <rect x="17" y="16" width="3" height="3" />
                    </svg>
                  </div>
                  <div className="font-mono text-[7.5px] leading-tight text-slate-500">
                    <div className="font-semibold text-[#0B172A]">CV-DEMO-2026-08491</div>
                    <div>Issued: Nov 2026</div>
                    <div className="text-[7px] uppercase tracking-wider text-slate-400">Scan Demo</div>
                  </div>
                </div>
              </div>

              {/* Embossed Navy Rosette SVG Seal */}
              <svg
                className="h-16 w-14 shrink-0 drop-shadow-sm"
                viewBox="0 0 64 76"
                fill="none"
                aria-label="Embossed institutional seal"
              >
                <path d="M22 44 L15 72 L24 66 L30 73 L33 46 Z" fill="#15315C" />
                <path d="M42 44 L49 72 L40 66 L34 73 L31 46 Z" fill="#1E437D" />
                <circle
                  cx="32"
                  cy="28"
                  r="20"
                  fill="#1B3B6F"
                  stroke="#10284D"
                  strokeWidth="2"
                  strokeDasharray="3.5 2.5"
                />
                <circle
                  cx="32"
                  cy="28"
                  r="15.5"
                  fill="#214682"
                  stroke="#93C5FD"
                  strokeOpacity="0.35"
                  strokeWidth="1"
                />
                <circle cx="32" cy="28" r="11.5" fill="#183564" />
                <path
                  d="M27.5 28.2 L30.6 31.2 L36.8 25"
                  stroke="#DBEAFE"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
