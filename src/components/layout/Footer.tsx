"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Github, FileText, CheckCircle2, ShieldCheck, LockKeyhole } from "lucide-react";

export function Footer() {
  const pathname = usePathname();
  const publicRoute = ["/", "/login", "/register", "/verify", "/wallet", "/claim"].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (!publicRoute) return null;

  return (
    <footer className="border-t border-white/10 bg-[#0A1224] text-white">
      <div className="container mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="space-y-4 md:col-span-1">
            <div className="flex items-center gap-2.5 font-bold text-lg">
              <Image
                src="/brand/brand-symbol-64.png"
                alt="CREDVAIL"
                width={30}
                height={30}
                className="h-7.5 w-7.5 rounded-lg object-contain"
              />
              <span className="text-white">
                CRED<span className="bg-brand-gradient bg-clip-text text-transparent font-black">VAIL</span>
              </span>
            </div>
            <p className="text-xs text-blue-100/65 leading-relaxed">
              Blockchain-Verified, Privacy-Preserving Digital Credential Infrastructure.
              Enterprise-grade W3C VC 2.0 issuance and Ethereum Sepolia Merkle anchoring.
            </p>
            <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Sepolia L1 Mainnet Synchronized</span>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-4 text-white">Core Pillars</h4>
            <ul className="space-y-2.5 text-xs text-blue-100/70">
              <li>W3C Verifiable Credentials 2.0</li>
              <li>W3C DID:web Institutional Identity</li>
              <li>ECDSA NIST P-256 Cryptographic Signatures</li>
              <li>Ethereum Merkle Batch Anchoring</li>
              <li>W3C Bitstring Status Lists</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-4 text-white">Verification Engine</h4>
            <ul className="space-y-2 text-xs text-blue-100/70">
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="font-mono text-[11px]">VALID_CURRENT</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="font-mono text-[11px]">REVOKED</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-400" />
                <span className="font-mono text-[11px]">AUTHENTICITY_ONLY</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="font-mono text-[11px]">STATUS_UNKNOWN</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                <span className="font-mono text-[11px]">INVALID</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-4 text-white">Standards & Security</h4>
            <ul className="space-y-2.5 text-xs text-blue-100/70">
              <li>RFC 8785 JSON Canonicalization</li>
              <li>OpenZeppelin MerkleProof v5</li>
              <li>NIST P-256 & Secp256k1</li>
              <li>Argon2id Password Security</li>
              <li>STRIDE Security Threat Model</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-blue-100/50">
          <p>© 2026 CREDVAIL Infrastructure. Licensed under Apache 2.0.</p>
          <div className="flex items-center gap-6 font-mono text-[11px]">
            <span>Ethereum Sepolia (Chain ID: 11155111)</span>
            <span>Deterministic Keccak-256</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
