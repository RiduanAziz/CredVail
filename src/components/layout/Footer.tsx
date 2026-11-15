import Link from "next/link";
import { Shield, Github, FileText, CheckCircle2 } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="container mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-2 font-bold text-lg">
              <Shield className="h-5 w-5 text-primary" />
              <span>CRED<span className="text-primary font-black">VAIL</span></span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Blockchain-Verified, Privacy-Preserving Digital Credential Infrastructure.
              Undergraduate thesis research prototype built with W3C VC 2.0 and Ethereum Sepolia.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Core Pillars</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>W3C Verifiable Credentials 2.0</li>
              <li>W3C DID:web Institutional Identity</li>
              <li>ECDSA-SD-2023 Selective Disclosure</li>
              <li>Ethereum Merkle Batch Anchoring</li>
              <li>W3C Bitstring Status Lists</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Verification States</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                <span>VALID_CURRENT</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500"></span>
                <span>REVOKED</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                <span>AUTHENTICITY_ONLY</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                <span>STATUS_UNKNOWN</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-500"></span>
                <span>INVALID</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Standards & Governance</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>RFC 8785 JSON Canonicalization</li>
              <li>OpenZeppelin MerkleProof v5</li>
              <li>NIST P-256 & Secp256k1</li>
              <li>Argon2id Password Security</li>
              <li>STRIDE Security Threat Model</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© 2026 CREDVAIL Infrastructure. Licensed under Apache 2.0.</p>
          <div className="flex items-center gap-6">
            <span>Ethereum Sepolia (Chain ID: 11155111)</span>
            <span>Deterministic Keccak-256 Merkle Roots</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
