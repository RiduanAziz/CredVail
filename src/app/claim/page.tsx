"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { StoredWalletCredential } from "@/lib/wallet/wallet-service";

export default function ClaimCredentialPage() {
  const router = useRouter();
  const [certNumber, setCertNumber] = useState("");
  const [email, setEmail] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimedCred, setClaimedCred] = useState<StoredWalletCredential | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certNumber.trim() || !email.trim()) {
      setError("Please provide both certificate number and recipient email.");
      return;
    }

    try {
      setClaiming(true);
      setError(null);

      const res = await fetch("/api/v1/wallet/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          certificateNumber: certNumber.trim(),
          recipientEmail: email.trim(),
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setClaimedCred(json.data);
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
            Phase 11: Self-Sovereign Identity
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
            Import your verifiable credential into your private browser wallet with cryptographic selective disclosure keys.
          </p>
        </div>

        {/* Claim Card */}
        {!claimedCred ? (
          <Card className="shadow-xl border border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold">Ownership Verification</CardTitle>
              <CardDescription className="text-xs">
                Enter your unique certificate number and the recipient email address on file with the issuing institution.
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
                  <label htmlFor="email" className="text-xs font-semibold text-foreground">
                    Recipient Email Address
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="e.g. evelyn.reed@stanford.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="text-sm"
                    required
                  />
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
                Cryptographic selective disclosure tokens have been generated and secured in your wallet vault.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="p-4 rounded-xl bg-background border border-border space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Achievement:</span>
                  <span className="font-bold text-foreground">{claimedCred.courseName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Issuing University:</span>
                  <span className="font-semibold text-foreground">{claimedCred.issuerName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Recipient Name:</span>
                  <span className="font-semibold text-foreground">{claimedCred.recipientName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Certificate Number:</span>
                  <span className="font-mono font-bold text-primary">{claimedCred.certificateNumber}</span>
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-muted-foreground">Blinded Attribute Salts:</span>
                  <Badge variant="outline" className="font-mono text-[10px] border-emerald-500/40 text-emerald-600">
                    {Object.keys(claimedCred.disclosures).length} Salts Ready
                  </Badge>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Link href="/wallet" className="flex-1">
                  <Button className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                    <Wallet className="w-4 h-4" />
                    <span>Open in Wallet</span>
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  onClick={() => {
                    setClaimedCred(null);
                    setCertNumber("");
                    setEmail("");
                  }}
                  className="text-xs"
                >
                  Claim Another
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Privacy Callout */}
        <div className="p-4 rounded-xl border border-border bg-card/60 flex items-start gap-3 text-xs text-muted-foreground">
          <Lock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p>
            Your browser wallet uses client-side encryption. Private keys and selective disclosure blinding salts never leave your device without explicit cryptographic consent.
          </p>
        </div>
      </div>
    </div>
  );
}
