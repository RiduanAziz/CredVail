"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Download,
  ExternalLink,
  Copy,
  Check,
  Network,
  Award,
  Calendar,
  Building2,
  QrCode,
  Share2,
  Printer,
  FileCode,
  ChevronDown,
  ChevronUp,
  Cpu,
  Clock,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { VerificationResult } from "@/lib/services/verification-service";

export default function PublicVerifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const identifier = resolvedParams.id;

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [expandedChecks, setExpandedChecks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function fetchVerification() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/v1/verify/lookup/${encodeURIComponent(identifier)}`);
        const json = await res.json();

        if (json.success && json.data) {
          setResult(json.data);
        } else {
          setError(json.message || "Failed to resolve credential.");
        }
      } catch (err: any) {
        setError(err.message || "Network error while verifying credential.");
      } finally {
        setLoading(false);
      }
    }

    if (identifier) {
      fetchVerification();
    }
  }, [identifier]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleCheck = (code: string) => {
    setExpandedChecks((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/30">
              <ShieldCheck className="w-10 h-10 text-primary animate-pulse" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold font-serif text-foreground">
              Executing 5-Layer Cryptographic Verification...
            </h2>
            <p className="text-sm text-muted-foreground">
              Verifying W3C schema, RFC 8785 canonical hash, ECDSA NIST P-256 signature, Keccak-256 Merkle inclusion proof, and Ethereum Sepolia consensus.
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <Badge variant="outline" className="font-mono text-xs animate-pulse">
              Identifier: {identifier}
            </Badge>
          </div>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <Card className="max-w-lg w-full border-destructive/40 shadow-xl">
          <CardHeader className="text-center pb-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-3">
              <XCircle className="w-8 h-8" />
            </div>
            <CardTitle className="text-xl font-serif">Verification Failed</CardTitle>
            <CardDescription className="text-sm">{error || "Credential could not be located."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-xs text-muted-foreground">
              Queried Identifier: <span className="font-mono font-semibold text-foreground">{identifier}</span>
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <Link href="/verify">
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Try Another Identifier
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { status, isValid, credential, issuer, cryptography, blockchain, checks, verificationLatencyMs } = result;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 text-foreground py-10 px-4 sm:px-6 lg:px-8 print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Top Header / Navigation */}
        <div className="flex items-center justify-between pb-4 border-b border-border/60 print:hidden">
          <Link href="/verify" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Public Verification Engine</span>
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary gap-1">
              <Sparkles className="w-3 h-3" />
              CREDVAIL Trust Layer
            </Badge>
          </div>
        </div>

        {/* Status Hero Card */}
        <div
          className={`rounded-2xl p-6 sm:p-8 border shadow-lg transition-all ${
            status === "VALID"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-100 dark:bg-emerald-950/20"
              : status === "REVOKED"
              ? "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-100 dark:bg-amber-950/20"
              : status === "COMPROMISED"
              ? "bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-100 dark:bg-rose-950/20"
              : "bg-red-500/10 border-red-500/30 text-red-950 dark:text-red-100 dark:bg-red-950/20"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div
                className={`p-3.5 rounded-2xl shadow-sm ${
                  status === "VALID"
                    ? "bg-emerald-600 text-white"
                    : status === "REVOKED"
                    ? "bg-amber-600 text-white"
                    : "bg-red-600 text-white"
                }`}
              >
                {status === "VALID" ? (
                  <ShieldCheck className="w-8 h-8" />
                ) : status === "REVOKED" ? (
                  <AlertTriangle className="w-8 h-8" />
                ) : (
                  <ShieldAlert className="w-8 h-8" />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold font-serif tracking-tight">
                    {status === "VALID" && "Cryptographically Verified"}
                    {status === "REVOKED" && "Credential Revoked"}
                    {status === "COMPROMISED" && "Issuer Key Compromised"}
                    {status === "INVALID" && "Verification Failed / Tampered"}
                    {status === "EXPIRED" && "Credential Expired"}
                  </h1>
                  <Badge
                    className={`font-mono text-xs ${
                      status === "VALID"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : status === "REVOKED"
                        ? "bg-amber-600 hover:bg-amber-700 text-white"
                        : "bg-red-600 hover:bg-red-700 text-white"
                    }`}
                  >
                    {status}
                  </Badge>
                  {result.freshnessOutcome && (
                    <Badge variant="outline" className="font-mono text-xs border-current/40 bg-background/50">
                      {result.freshnessOutcome}
                    </Badge>
                  )}
                </div>
                <p className="text-sm opacity-90 max-w-xl">
                  {status === "VALID" &&
                    "This credential is mathematically valid, signed with ECDSA NIST P-256, verified against an OpenZeppelin-compatible Merkle tree, and anchored on the Ethereum Sepolia blockchain registry."}
                  {status === "REVOKED" &&
                    "This credential was formally revoked by the issuing institution. It is no longer valid for official qualification."}
                  {status === "COMPROMISED" &&
                    "Security Alert: The institutional signing key epoch was flagged as compromised (SEC-09). Cryptographic validity is permanently rescinded."}
                  {status === "INVALID" &&
                    "The credential payload has been modified or fails cryptographic signature checks. Do not trust this document."}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:items-end justify-center text-xs opacity-80 font-mono space-y-1 border-t sm:border-t-0 sm:border-l border-current/20 pt-3 sm:pt-0 sm:pl-6">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Latency: {verificationLatencyMs}ms (Metric M1)</span>
              </div>
              <div>Chain: Sepolia (11155111)</div>
              <div>Standard: W3C VC 2.0</div>
            </div>
          </div>
        </div>

        {/* Certificate Details Card */}
        <Card className="shadow-md border border-border">
          <CardHeader className="border-b border-border/60 pb-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <CardDescription className="text-xs uppercase tracking-wider font-semibold text-primary">
                  Official Educational Credential
                </CardDescription>
                <CardTitle className="text-2xl font-serif font-bold text-foreground">
                  {credential.courseName}
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/v1/verify/${credential.certificateNumber}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="print:hidden"
                >
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                    <Download className="w-3.5 h-3.5" />
                    Download PDF
                  </Button>
                </a>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs print:hidden" onClick={handlePrint}>
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs print:hidden"
                  onClick={() => handleCopy(window.location.href, "copy-link")}
                >
                  {copiedKey === "copy-link" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Share2 className="w-3.5 h-3.5" />
                  )}
                  Share
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" />
                  Recipient
                </span>
                <p className="text-base font-bold text-foreground mt-1">{credential.recipientName}</p>
                {credential.recipientEmail && (
                  <p className="text-xs text-muted-foreground truncate">{credential.recipientEmail}</p>
                )}
              </div>

              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  Issuing Institution
                </span>
                <p className="text-base font-bold text-foreground mt-1">{issuer.name}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">{issuer.slug}</p>
              </div>

              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Issue Date
                </span>
                <p className="text-sm font-semibold text-foreground mt-1">
                  {new Date(credential.issueDate).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>

              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <QrCode className="w-3.5 h-3.5" />
                  Certificate Number
                </span>
                <p className="text-sm font-mono font-bold text-primary mt-1">
                  {credential.certificateNumber}
                </p>
              </div>
            </div>

            {/* Issuer Trust Profile */}
            <div className="rounded-xl p-4 bg-muted/40 border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {issuer.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{issuer.name}</span>
                    <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 bg-emerald-500/5">
                      Verified Issuer
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{issuer.did}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Key Epoch:</span>
                  <span className="font-semibold text-foreground">Epoch #{issuer.keyEpoch}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Status:</span>
                  <span className={`font-semibold ${issuer.keyStatus === "ACTIVE" ? "text-emerald-600" : "text-amber-600"}`}>
                    {issuer.keyStatus}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 5-Point Verification Diagnostic Checklist */}
        <Card className="shadow-md border border-border">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  5-Layer Verification Diagnostic Engine
                </CardTitle>
                <CardDescription className="text-xs">
                  Cryptographic pipeline evaluating schema, canonical hashing, signatures, Merkle inclusion, and Ethereum consensus.
                </CardDescription>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {checks.filter((c) => c.passed).length}/{checks.length} Checks Passed
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-border/60 p-0">
            {checks.map((check) => {
              const isOpen = expandedChecks[check.code];
              return (
                <div key={check.code} className="p-4 transition-colors hover:bg-muted/20">
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleCheck(check.code)}>
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-full ${check.passed ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
                        {check.passed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-foreground">{check.title}</span>
                        <p className="text-xs text-muted-foreground">{check.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {check.latencyMs !== undefined && (
                        <span className="text-[11px] font-mono text-muted-foreground hidden sm:inline">
                          {check.latencyMs}ms
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-mono ${
                          check.passed
                            ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/5"
                            : "border-destructive/30 text-destructive bg-destructive/5"
                        }`}
                      >
                        {check.passed ? "PASSED" : "FAILED"}
                      </Badge>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-3 pl-9 space-y-2 text-xs">
                      {check.error && (
                        <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                          {check.error}
                        </div>
                      )}
                      {check.details && (
                        <pre className="p-3 rounded-lg bg-zinc-950 text-emerald-400 font-mono text-[11px] overflow-x-auto border border-zinc-800">
                          {JSON.stringify(check.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Cryptographic & Blockchain Consensus Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Merkle Proof Inspector */}
          <Card className="shadow-md border border-border">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Network className="w-4 h-4 text-blue-600" />
                  Keccak-256 Merkle Inclusion
                </CardTitle>
                <Badge variant="outline" className="font-mono text-[10px] border-blue-500/30 text-blue-600">
                  O(log N) Proof
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">Calculated Leaf Hash:</span>
                <span className="font-mono text-[11px] text-foreground break-all select-all">
                  {cryptography.leafHash}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Anchored Merkle Root:</span>
                <span className="font-mono text-[11px] text-primary break-all select-all font-semibold">
                  {cryptography.merkleRoot}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-muted-foreground font-mono">
                <div>Leaf Index: <span className="font-bold text-foreground">#{cryptography.merkleIndex}</span></div>
                <div>Tree Depth: <span className="font-bold text-foreground">{cryptography.treeDepth} levels</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Sepolia Blockchain Panel */}
          <Card className="shadow-md border border-border">
            <CardHeader className="pb-3 border-b border-border/60">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-600" />
                  Ethereum Sepolia Consensus
                </CardTitle>
                <Badge
                  variant="outline"
                  className={`font-mono text-[10px] ${
                    blockchain.anchored
                      ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/5"
                      : "border-amber-500/30 text-amber-600 bg-amber-500/5"
                  }`}
                >
                  {blockchain.anchored ? "ANCHORED" : "PENDING BLOCK"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs">
              <div>
                <span className="text-muted-foreground block text-[11px]">Contract Address:</span>
                <span className="font-mono text-[11px] text-foreground break-all select-all">
                  {blockchain.contractAddress}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Block Number:</span>
                <span className="font-mono text-[11px] text-foreground font-bold">
                  {blockchain.blockNumber ? `#${blockchain.blockNumber}` : "Pending confirmation"}
                </span>
              </div>
              {blockchain.etherscanUrl && (
                <div className="pt-1">
                  <a
                    href={blockchain.etherscanUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-mono"
                  >
                    <span>View on Sepolia Etherscan</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border/60 text-xs text-muted-foreground print:hidden">
          <div className="flex items-center gap-2 font-mono">
            <span>Verified at: {new Date(result.verifiedAt).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowJsonModal(!showJsonModal)}
              className="gap-1.5 text-xs"
            >
              <FileCode className="w-3.5 h-3.5" />
              {showJsonModal ? "Hide Raw VC JSON" : "Inspect Raw VC JSON"}
            </Button>
          </div>
        </div>

        {/* Raw VC JSON Viewer */}
        {showJsonModal && (
          <Card className="shadow-lg border border-border animate-in fade-in-50">
            <CardHeader className="pb-3 border-b border-border/60 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold">W3C Verifiable Credential 2.0 Payload</CardTitle>
                <CardDescription className="text-xs">
                  Canonical JSON payload with ECDSA P-256 digital signature and Merkle inclusion proof evidence
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(JSON.stringify(result, null, 2), "copy-full-json")}
                className="gap-1.5 text-xs"
              >
                {copiedKey === "copy-full-json" ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                Copy JSON
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <pre className="p-4 rounded-xl bg-zinc-950 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-96 border border-zinc-800 leading-relaxed">
                {JSON.stringify(result, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
