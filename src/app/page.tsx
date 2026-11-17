import Link from "next/link";
import Image from "next/image";
import {
  Shield,
  CheckCircle2,
  Lock,
  Layers,
  Database,
  QrCode,
  FileSpreadsheet,
  Cpu,
  KeyRound,
  FileCheck,
  RefreshCw,
  EyeOff,
  ArrowRight,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-primary/5 via-background to-background py-20 md:py-32">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 relative z-10">
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-center">
              <div className="relative p-3 rounded-2xl bg-card border shadow-lg hover:shadow-xl transition-shadow">
                <Image
                  src="/brand/brand-symbol-128.png"
                  alt="CREDVAIL Identity Mark"
                  width={56}
                  height={56}
                  className="h-14 w-14 object-contain"
                  priority
                />
              </div>
            </div>

            <Badge variant="epoch" className="px-3.5 py-1 text-xs uppercase tracking-wider gap-1.5 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>W3C VC 2.0 & Ethereum Sepolia Testnet</span>
            </Badge>

            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15]">
              Blockchain-Verified,{" "}
              <span className="bg-brand-gradient bg-clip-text text-transparent">
                Privacy-Preserving
              </span>{" "}
              Digital Credentials
            </h1>

            <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl">
              An institutional multi-tenant SaaS infrastructure combining automated certificate generation,
              selective disclosure, and Ethereum Merkle-root integrity anchoring with freshness-aware verification.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 w-full sm:w-auto">
              <Link href="#verify" className="w-full sm:w-auto">
                <Button size="lg" variant="brand" className="w-full sm:w-auto gap-2 shadow-md">
                  <CheckCircle2 className="h-5 w-5 text-white/90" />
                  <span>Launch Public Verifier</span>
                </Button>
              </Link>
              <Link href="/register" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto gap-2">
                  <span>Institutional Dashboard</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground border-t border-border/60 w-full">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Zero On-Chain PII
              </span>
              <span className="flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-blue-500" />
                O(1) Gas Batch Merkle Tree
              </span>
              <span className="flex items-center gap-1.5">
                <EyeOff className="h-4 w-4 text-purple-500" />
                ECDSA-SD-2023 Selective Disclosure
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-4 w-4 text-amber-500" />
                W3C Bitstring Status Lists
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 5-State Verification Showcase */}
      <section className="py-16 bg-muted/30 border-b">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Freshness-Aware Verification Machine
            </h2>
            <p className="text-sm text-muted-foreground">
              CREDVAIL replaces binary validation with a formal 5-state verification engine distinguishing
              cryptographic authenticity, revocation status, key rotation, and snapshot freshness.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="border-emerald-200 dark:border-emerald-800/40 bg-card">
              <CardHeader className="p-4 pb-2">
                <Badge variant="verified" className="w-fit">VALID_CURRENT</Badge>
                <CardTitle className="text-base mt-2">Active & Valid</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-xs text-muted-foreground">
                Authentic signature, verified Merkle leaf, active key epoch, fresh bitstring bit = 0.
              </CardContent>
            </Card>

            <Card className="border-red-200 dark:border-red-800/40 bg-card">
              <CardHeader className="p-4 pb-2">
                <Badge variant="revoked" className="w-fit">REVOKED</Badge>
                <CardTitle className="text-base mt-2">Revoked Credential</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-xs text-muted-foreground">
                Authentic historical issuance, but revoked in current status list bitstring (bit = 1).
              </CardContent>
            </Card>

            <Card className="border-indigo-200 dark:border-indigo-800/40 bg-card">
              <CardHeader className="p-4 pb-2">
                <Badge variant="epoch" className="w-fit">AUTHENTICITY_ONLY</Badge>
                <CardTitle className="text-base mt-2">Rotated Key Epoch</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-xs text-muted-foreground">
                Authentic credential signed during a historical key epoch that has gracefully expired.
              </CardContent>
            </Card>

            <Card className="border-amber-200 dark:border-amber-800/40 bg-card">
              <CardHeader className="p-4 pb-2">
                <Badge variant="warning" className="w-fit">STATUS_UNKNOWN</Badge>
                <CardTitle className="text-base mt-2">Stale Snapshot</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-xs text-muted-foreground">
                Signature valid, but status snapshot is unreachable or exceeded cache freshness TTL.
              </CardContent>
            </Card>

            <Card className="border-slate-300 dark:border-slate-800 bg-card">
              <CardHeader className="p-4 pb-2">
                <Badge variant="destructive" className="w-fit">INVALID</Badge>
                <CardTitle className="text-base mt-2">Forged / Tampered</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-xs text-muted-foreground">
                Signature forgery, claim tampering, Merkle proof mismatch, or compromised issuer key.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Core Architectural Pillars */}
      <section id="architecture" className="py-20">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <h2 className="text-3xl font-bold tracking-tight">
              Two Connected Capabilities, One Unified Platform
            </h2>
            <p className="text-muted-foreground text-sm">
              Bridging institutional operations with machine-verifiable cryptographic assurance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="border shadow-sm hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 mb-3">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <CardTitle className="text-xl">A. Digital Certificate Management</CardTitle>
                <CardDescription>
                  Comprehensive institutional operations for universities, academies, and professional bodies.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>Visual certificate template designer with dynamic placeholders.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>CSV and XLSX bulk ingestion with formula injection defense.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>Collision-safe, tenant-aware certificate numbering (e.g. CREDVAIL-2026-000001).</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>Print-ready vector PDF generation with unique embedded QR verification codes.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>Batch ZIP archive streaming and institutional certificate dashboard.</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border shadow-sm hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 mb-3">
                  <Cpu className="h-5 w-5" />
                </div>
                <CardTitle className="text-xl">B. Cryptographic Trust Infrastructure</CardTitle>
                <CardDescription>
                  W3C-standardized verification anchored to the Ethereum blockchain.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>W3C Verifiable Credentials Data Model 2.0 with JSON-LD proofs.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>W3C DID:web institutional identity resolution and key epoch governance.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>ECDSA-SD-2023 zero-knowledge selective disclosure presentation suite.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Ethereum Sepolia batch Merkle root anchoring (O(1) gas cost scaling).</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>W3C Bitstring Status Lists with on-chain cryptographic digest commits.</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Interactive Verification Teaser Section */}
      <section id="verify" className="py-20 bg-muted/40 border-t">
        <div className="container mx-auto max-w-4xl px-4 sm:px-6">
          <div className="text-center space-y-3 mb-10">
            <h2 className="text-3xl font-bold tracking-tight">Public Credential Verification</h2>
            <p className="text-sm text-muted-foreground">
              Scan a certificate QR code or enter a Credential ID to independently verify authenticity,
              blockchain inclusion, and real-time status.
            </p>
          </div>

          <Card className="border shadow-md">
            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Enter Credential ID or Certificate Number (e.g. CREDVAIL-2026-000001)"
                  className="flex h-11 w-full rounded-md border border-input bg-background px-4 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  defaultValue="CREDVAIL-2026-000001"
                  readOnly
                />
                <Button size="lg" variant="brand" className="shrink-0 gap-2">
                  <CheckCircle2 className="h-4 w-4 text-white/90" />
                  <span>Verify Credential</span>
                </Button>
              </div>

              <div className="rounded-lg border bg-background p-4 space-y-3">
                <div className="flex items-center justify-between border-b pb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Sample Prototype Evaluation
                  </span>
                  <Badge variant="verified" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    VALID_CURRENT
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Issuer DID: </span>
                    <span className="font-mono font-medium">did:web:credvail.io:tenants:mit</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sepolia Merkle Root: </span>
                    <span className="font-mono font-medium">0x4a7e...91bc (Anchored)</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Key Epoch: </span>
                    <span className="font-medium">Epoch 1 (Active, Uncompromised)</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status Freshness: </span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">Digest Match (Epoch 4)</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
