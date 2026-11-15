"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Wallet,
  ShieldCheck,
  Shield,
  Eye,
  EyeOff,
  Plus,
  Download,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  FileCode,
  Lock,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Award,
  Building2,
  Calendar,
  Layers,
  ChevronRight,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import type { StoredWalletCredential } from "@/lib/wallet/wallet-service";
import type { W3CVerifiablePresentation } from "@/lib/crypto/selective-disclosure";
import type { VerificationResult } from "@/lib/services/verification-service";

export default function WalletPage() {
  const [loading, setLoading] = useState(true);
  const [holderInfo, setHolderInfo] = useState<{ holderId: string; did: string } | null>(null);
  const [credentials, setCredentials] = useState<StoredWalletCredential[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Selective Disclosure Presentation State
  const [selectedCred, setSelectedCred] = useState<StoredWalletCredential | null>(null);
  const [disclosedKeys, setDisclosedKeys] = useState<Set<string>>(new Set());
  const [challengeNonce, setChallengeNonce] = useState("");
  const [generatingVp, setGeneratingVp] = useState(false);
  const [generatedVp, setGeneratedVp] = useState<W3CVerifiablePresentation | null>(null);
  const [reductionPercent, setReductionPercent] = useState<number>(0);
  const [vpVerifyResult, setVpVerifyResult] = useState<VerificationResult | null>(null);
  const [verifyingVp, setVerifyingVp] = useState(false);

  useEffect(() => {
    fetchWalletCredentials();
  }, []);

  const fetchWalletCredentials = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/wallet/credentials");
      const json = await res.json();
      if (json.success && json.data) {
        setHolderInfo(json.data.holder);
        setCredentials(json.data.credentials);
      }
    } catch (err) {
      console.error("Failed to load wallet:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleOpenSdModal = async (cred: StoredWalletCredential) => {
    setSelectedCred(cred);
    setGeneratedVp(null);
    setVpVerifyResult(null);

    // Default: Disclose name and course, blind sensitive attributes (email, grade)
    const initialDisclosed = new Set<string>();
    const claimKeys = Object.keys(cred.claims);
    if (claimKeys.includes("recipient_name")) initialDisclosed.add("recipient_name");
    if (claimKeys.includes("course_name")) initialDisclosed.add("course_name");
    if (claimKeys.includes("certificate_number")) initialDisclosed.add("certificate_number");
    setDisclosedKeys(initialDisclosed);

    // Fetch fresh challenge nonce
    await handleFetchChallengeNonce();
  };

  const handleFetchChallengeNonce = async () => {
    try {
      const res = await fetch("/api/v1/verify/challenge", { method: "POST" });
      const json = await res.json();
      if (json.success && json.data?.nonce) {
        setChallengeNonce(json.data.nonce);
      }
    } catch (err) {
      console.error("Failed to fetch challenge nonce:", err);
    }
  };

  const toggleClaimDisclosure = (key: string) => {
    setDisclosedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleGeneratePresentation = async () => {
    if (!selectedCred || !challengeNonce) return;

    try {
      setGeneratingVp(true);
      setVpVerifyResult(null);

      const res = await fetch("/api/v1/wallet/present", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId: selectedCred.credentialId,
          disclosedKeys: Array.from(disclosedKeys),
          challengeNonce,
          verifierDomain: "credvail.com",
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setGeneratedVp(json.data.presentation);
        setReductionPercent(json.data.wireSizeReductionPercent);
      }
    } catch (err) {
      console.error("Failed to generate presentation:", err);
    } finally {
      setGeneratingVp(false);
    }
  };

  const handleVerifyGeneratedVp = async () => {
    if (!generatedVp) return;

    try {
      setVerifyingVp(true);
      const res = await fetch("/api/v1/verify/presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presentation: generatedVp,
          nonce: challengeNonce,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setVpVerifyResult(json.data);
      }
    } catch (err) {
      console.error("Failed to verify presentation:", err);
    } finally {
      setVerifyingVp(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center text-primary animate-pulse">
            <Wallet className="w-7 h-7" />
          </div>
          <p className="text-sm font-semibold text-foreground">Loading Encrypted Browser Vault...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 text-foreground py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border/60">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-serif font-bold tracking-tight text-foreground">
                Holder Browser Wallet
              </h1>
              <Badge variant="outline" className="border-primary/30 text-primary font-mono text-xs gap-1">
                <Sparkles className="w-3 h-3" />
                Phase 11: Privacy & Selective Disclosure
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Self-sovereign cryptographic credential vault with ECDSA-SD-2023 selective disclosure and zero-knowledge attribute blinding.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/claim">
              <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-4 h-4" />
                <span>Claim Credential</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Holder Identity Banner */}
        {holderInfo && (
          <div className="p-4 rounded-xl bg-card border border-border shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <KeyRound className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Holder Decentralized Identifier (DID)
                </span>
                <p className="text-xs font-mono font-bold text-foreground break-all select-all">
                  {holderInfo.did}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <Badge variant="outline" className="font-mono text-[10px] border-emerald-500/30 text-emerald-600 bg-emerald-500/5">
                ECDSA NIST P-256
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px] border-blue-500/30 text-blue-600 bg-blue-500/5">
                Client Vault Encrypted
              </Badge>
            </div>
          </div>
        )}

        {/* Credentials Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold font-serif">Stored Verifiable Credentials</h2>
            <span className="text-xs text-muted-foreground font-mono">
              {credentials.length} {credentials.length === 1 ? "Credential" : "Credentials"} in Vault
            </span>
          </div>

          {credentials.length === 0 ? (
            <Card className="text-center p-12 border-dashed border-2 border-border/80">
              <div className="max-w-md mx-auto space-y-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Award className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-lg font-serif">No Credentials in Wallet</CardTitle>
                  <CardDescription className="text-xs">
                    You haven&apos;t claimed any digital certificates yet. Enter your certificate number and email to import your first verifiable credential.
                  </CardDescription>
                </div>
                <Link href="/claim">
                  <Button size="sm" className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 mt-2">
                    <Plus className="w-4 h-4" />
                    <span>Claim Credential</span>
                  </Button>
                </Link>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {credentials.map((cred) => (
                <Card key={cred.credentialId} className="shadow-md border border-border flex flex-col justify-between">
                  <CardHeader className="pb-3 border-b border-border/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <Badge variant="outline" className="text-[10px] font-mono text-primary border-primary/30">
                          {cred.certificateNumber}
                        </Badge>
                        <CardTitle className="text-base font-bold font-serif line-clamp-1">
                          {cred.courseName}
                        </CardTitle>
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-4 space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Issuer:</span>
                        <span className="font-semibold text-foreground">{cred.issuerName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Recipient:</span>
                        <span className="font-semibold text-foreground">{cred.recipientName}</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-muted/30 border border-border/60 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                        <span>Protected Claims:</span>
                        <span className="font-mono text-primary">{Object.keys(cred.disclosures).length} Blinded Salts</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.keys(cred.claims).map((k) => (
                          <Badge key={k} variant="secondary" className="text-[10px] font-mono">
                            {k}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`/verify/${encodeURIComponent(cred.certificateNumber)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground">
                          <ExternalLink className="w-3.5 h-3.5" />
                          Verify
                        </Button>
                      </a>
                      <a
                        href={`/api/v1/verify/${encodeURIComponent(cred.certificateNumber)}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground">
                          <Download className="w-3.5 h-3.5" />
                          PDF
                        </Button>
                      </a>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleOpenSdModal(cred)}
                      className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>Present with Privacy</span>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Selective Disclosure Presentation Modal */}
        {selectedCred && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-border animate-in fade-in-50 zoom-in-95">
              <CardHeader className="pb-3 border-b border-border/60 sticky top-0 bg-card z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold font-serif">
                        Selective Disclosure Consent
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Select which attributes to disclose. Unchecked claims will be cryptographically blinded.
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary">
                    ECDSA-SD-2023
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-5 pt-4 text-xs">
                {/* Attribute Toggles */}
                <div className="space-y-2">
                  <span className="font-semibold text-foreground block">
                    Credential Attributes (Disclose / Redact)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(selectedCred.claims).map(([key, value]) => {
                      const isDisclosed = disclosedKeys.has(key);
                      return (
                        <div
                          key={key}
                          onClick={() => toggleClaimDisclosure(key)}
                          className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between transition-all ${
                            isDisclosed
                              ? "bg-primary/5 border-primary/40 text-foreground"
                              : "bg-muted/30 border-border/60 opacity-60 hover:opacity-100"
                          }`}
                        >
                          <div className="space-y-0.5 truncate pr-2">
                            <span className="font-mono font-semibold block text-[11px] truncate">
                              {key}
                            </span>
                            <span className="text-muted-foreground block text-[10px] truncate">
                              {isDisclosed ? String(value) : "•••••••• (Blinded)"}
                            </span>
                          </div>
                          <div className={`p-1.5 rounded-full ${isDisclosed ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                            {isDisclosed ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Privacy & Metric M2 Benchmark Meter */}
                <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      PII Protection & Wire Reduction
                    </span>
                    <span className="font-mono font-bold text-primary">
                      {disclosedKeys.size} Disclosed / {Object.keys(selectedCred.claims).length - disclosedKeys.size} Blinded
                    </span>
                  </div>
                  <div className="h-2 w-full bg-border rounded-full overflow-hidden flex">
                    <div
                      className="bg-primary h-full transition-all"
                      style={{
                        width: `${Math.round((disclosedKeys.size / Math.max(Object.keys(selectedCred.claims).length, 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Blinded attributes are mathematically unrecoverable by the verifier while the issuer signature remains 100% valid.
                  </p>
                </div>

                {/* Verifier Challenge Nonce */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="nonce-input" className="font-semibold text-foreground text-[11px]">
                      Verifier Challenge Nonce (Replay Protection)
                    </label>
                    <button
                      type="button"
                      onClick={handleFetchChallengeNonce}
                      className="text-primary hover:underline text-[10px] flex items-center gap-1 font-mono"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Fresh Nonce
                    </button>
                  </div>
                  <Input
                    id="nonce-input"
                    type="text"
                    value={challengeNonce}
                    onChange={(e) => setChallengeNonce(e.target.value)}
                    placeholder="Enter challenge nonce..."
                    className="font-mono text-xs h-9"
                  />
                </div>

                {/* Generate Button */}
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleGeneratePresentation}
                    disabled={generatingVp || disclosedKeys.size === 0 || !challengeNonce}
                    className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-9"
                  >
                    {generatingVp ? "Signing Holder Presentation..." : "Generate Cryptographic Presentation"}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Output Presentation Result */}
                {generatedVp && (
                  <div className="space-y-3 pt-3 border-t border-border animate-in fade-in-50">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">Generated W3C Verifiable Presentation</span>
                      <div className="flex items-center gap-2">
                        {reductionPercent > 0 && (
                          <Badge variant="outline" className="font-mono text-[10px] border-emerald-500/40 text-emerald-600 bg-emerald-500/5">
                            Metric M2: {reductionPercent}% Wire Reduction
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => handleCopy(JSON.stringify(generatedVp, null, 2), "copy-vp")}
                        >
                          {copiedKey === "copy-vp" ? (
                            <Check className="w-3 h-3 text-emerald-600 mr-1" />
                          ) : (
                            <Copy className="w-3 h-3 mr-1" />
                          )}
                          Copy VP JSON
                        </Button>
                      </div>
                    </div>

                    <pre className="p-3 rounded-xl bg-zinc-950 text-emerald-400 font-mono text-[10px] overflow-x-auto max-h-48 border border-zinc-800 leading-relaxed">
                      {JSON.stringify(generatedVp, null, 2)}
                    </pre>

                    <div className="flex items-center justify-between pt-1">
                      <Button
                        size="sm"
                        onClick={handleVerifyGeneratedVp}
                        disabled={verifyingVp}
                        className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
                      >
                        {verifyingVp ? "Verifying..." : "Verify Presentation Against Verifier Engine"}
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {/* Verifier Result Preview */}
                    {vpVerifyResult && (
                      <div className={`p-3.5 rounded-xl border text-xs space-y-2 animate-in fade-in-50 ${
                        vpVerifyResult.isValid
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-100"
                          : "bg-destructive/10 border-destructive/30 text-destructive"
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold flex items-center gap-1.5">
                            {vpVerifyResult.isValid ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-destructive" />}
                            Verifier Result: {vpVerifyResult.status}
                          </span>
                          <span className="font-mono text-[10px]">
                            Latency: {vpVerifyResult.verificationLatencyMs}ms
                          </span>
                        </div>
                        <p className="text-[11px] opacity-90">
                          {vpVerifyResult.isValid
                            ? "Verifier accepted presentation! Disclosed attributes mathematically verified; blinded PII was never revealed."
                            : "Presentation rejected by verifier engine."}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>

              <CardFooter className="border-t border-border/60 pt-3 flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setSelectedCred(null)} className="text-xs">
                  Close
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
