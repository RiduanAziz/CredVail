"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Wallet,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  Sparkles,
  ArrowLeft,
  Lock,
  Key,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { StoredWalletCredential } from "@/lib/wallet/wallet-service";
import { BrowserWalletEngine } from "@/lib/wallet/browser-wallet";

function ClaimCredentialContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [certNumber, setCertNumber] = useState("");
  const [claimToken, setClaimToken] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimedCred, setClaimedCred] = useState<StoredWalletCredential | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const certParam = searchParams.get("cert") || searchParams.get("certificateNumber");
    if (certParam) setCertNumber(certParam);

    // Secure URL fragment handling: token is placed in URL hash (#token=...) to prevent
    // server-side access logs, referrers, and HTTP request leakage.
    let tokenFromHash = "";
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.substring(1)
        : window.location.hash;
      const hashParams = new URLSearchParams(hash);
      tokenFromHash = hashParams.get("token") || hashParams.get("claimToken") || "";

      if (tokenFromHash) {
        setClaimToken(tokenFromHash);

        // Immediately scrub the secret token from browser address bar & history
        if (window.history && window.history.replaceState) {
          const cleanUrl =
            window.location.pathname +
            (window.location.search ? window.location.search : "");
          window.history.replaceState(null, "", cleanUrl);
        }
      }
    }

    if (!tokenFromHash) {
      const tokenParam = searchParams.get("token") || searchParams.get("claimToken");
      if (tokenParam) setClaimToken(tokenParam);
    }
  }, [searchParams]);

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certNumber.trim() || !claimToken.trim()) {
      setError("Please provide both certificate number and your single-use claim token.");
      return;
    }

    try {
      setClaiming(true);
      setError(null);

      // Get or create client-side browser identity
      let holderDid: string | undefined;
      try {
        const clientIdentity = await BrowserWalletEngine.getOrCreateBrowserIdentity();
        holderDid = clientIdentity.did;
      } catch {
        // Fallback if indexedDB unavailable in restricted sandbox
      }

      const res = await fetch("/api/v1/wallet/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          certificateNumber: certNumber.trim(),
          claimToken: claimToken.trim(),
          holderDid,
        }),
      });

      const json = await res.json();
      if (res.status === 401) {
        setError("You must be signed in to your CREDVAIL account to claim this credential.");
        return;
      }

      if (json.success && json.data) {
        setClaimedCred(json.data);

        // Save credential into client-side browser IndexedDB vault
        try {
          await BrowserWalletEngine.saveCredential({
            credentialId: json.data.credentialId,
            certificateNumber: json.data.certificateNumber,
            recipientName: json.data.recipientName,
            recipientEmail: json.data.recipientEmail,
            courseName: json.data.courseName,
            issuerName: json.data.issuerName,
            issuerDid: json.data.issuerDid,
            claims: json.data.claims,
            rawVc: json.data.rawVc,
            claimedAt: json.data.claimedAt,
          });
        } catch {
          // In-memory/SSR fallback
        }
      } else {
        setError(json.message || "Failed to claim credential.");
      }
    } catch (err: any) {
      setError(err.message || "Network error while claiming credential.");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 text-foreground py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Navigation */}
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <Link href="/wallet" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Holder Wallet</span>
          </Link>
          <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary gap-1">
            <Sparkles className="w-3 h-3" />
            H1: Cryptographic Ownership
          </Badge>
        </div>

        {/* Hero Header */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
            <Wallet className="w-7 h-7" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight text-foreground">
            Claim Your Digital Credential
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto">
            Import your verifiable credential into your private browser wallet using your single-use institutional claim token.
          </p>
        </div>

        {/* Claim Card */}
        {!claimedCred ? (
          <Card className="shadow-xl border border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold">Ownership Verification</CardTitle>
              <CardDescription className="text-xs">
                Enter your unique certificate number and the high-entropy claim invitation token issued to you by the organization.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleClaimSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="cert-number" className="text-xs font-semibold text-foreground">
                    Certificate Number
                  </label>
                  <Input
                    id="cert-number"
                    type="text"
                    placeholder="e.g. STAN-2026-000001 or HARV-2026-000101"
                    value={certNumber}
                    onChange={(e) => setCertNumber(e.target.value)}
                    className="font-mono text-sm"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="claim-token" className="text-xs font-semibold text-foreground">
                      Single-Use Claim Invitation Token
                    </label>
                    <span className="text-[10px] text-muted-foreground">High-entropy cryptographic token</span>
                  </div>
                  <div className="relative">
                    <Key className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="claim-token"
                      type="password"
                      placeholder="Enter 64-character token from your invitation"
                      value={claimToken}
                      onChange={(e) => setClaimToken(e.target.value)}
                      className="pl-9 font-mono text-sm"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="brand"
                  disabled={claiming}
                  className="w-full gap-2 mt-2 shadow-md"
                >
                  {claiming ? (
                    <span>Verifying Ownership...</span>
                  ) : (
                    <>
                      <span>Claim Credential to Vault</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-xl border-emerald-500/40 bg-emerald-500/5 animate-in fade-in-50">
            <CardHeader className="text-center pb-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-600 text-white flex items-center justify-center mb-2 shadow-sm">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <CardTitle className="text-xl font-bold font-serif text-emerald-950 dark:text-emerald-100">
                Credential Successfully Claimed!
              </CardTitle>
              <CardDescription className="text-xs text-emerald-800 dark:text-emerald-200">
                Ownership verified and secured in your private browser wallet vault.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-xl bg-background border border-emerald-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="font-mono text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                    {claimedCred.certificateNumber}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Claimed {new Date(claimedCred.claimedAt).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-base font-serif">{claimedCred.courseName}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>{claimedCred.issuerName}</span>
                  </p>
                </div>
                <div className="text-xs pt-2 border-t border-border flex items-center justify-between text-muted-foreground">
                  <span>Recipient: <strong className="text-foreground">{claimedCred.recipientName}</strong></span>
                  <span className="font-mono text-[10px]">{claimedCred.recipientEmail}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <Link href="/wallet" className="flex-1">
                  <Button variant="brand" className="w-full gap-2">
                    <span>Open Holder Wallet</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  onClick={() => {
                    setClaimedCred(null);
                    setCertNumber("");
                    setClaimToken("");
                  }}
                  className="gap-2"
                >
                  Claim Another
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function ClaimCredentialPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          Loading claim portal...
        </div>
      }
    >
      <ClaimCredentialContent />
    </Suspense>
  );
}
