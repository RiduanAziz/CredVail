"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  Search,
  UploadCloud,
  FileCode,
  ArrowRight,
  Sparkles,
  Award,
  Layers,
  Lock,
  Cpu,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { VerificationResult } from "@/lib/services/verification-service";

export default function UniversalVerifyPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"search" | "upload" | "json">("search");
  const [dragOver, setDragOver] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    router.push(`/verify/${encodeURIComponent(query)}`);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      processJsonFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processJsonFile(file);
    }
  };

  const processJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        setJsonInput(text);
        setActiveTab("json");
        handleDirectVerify(text);
      } catch (err: any) {
        setVerifyError("Failed to read JSON file: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleDirectVerify = async (textToVerify?: string) => {
    const raw = textToVerify || jsonInput;
    if (!raw.trim()) {
      setVerifyError("Please paste or upload a valid JSON Verifiable Credential.");
      return;
    }

    try {
      setVerifying(true);
      setVerifyError(null);
      setVerifyResult(null);

      const parsed = JSON.parse(raw);
      const isPresentation = parsed.type?.includes("VerifiablePresentation") || !!parsed.verifiableCredential;

      const res = await fetch("/api/v1/verify/presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isPresentation ? { presentation: parsed } : { credential: parsed }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setVerifyResult(json.data);
      } else {
        setVerifyError(json.message || "Verification request failed.");
      }
    } catch (err: any) {
      setVerifyError("Invalid JSON format: " + err.message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 text-foreground py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-10">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            Decentralized Credential Verification Protocol
          </div>
          <h1 className="text-4xl sm:text-5xl font-serif font-bold tracking-tight text-foreground">
            Verify Any Credential Instantly
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            Mathematical proof of authenticity powered by W3C Verifiable Credentials 2.0, ECDSA NIST P-256 signatures, and Ethereum Sepolia smart contracts.
          </p>
        </div>

        {/* Input Switcher Tabs */}
        <Card className="shadow-xl border border-border">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button
                  variant={activeTab === "search" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("search")}
                  className="gap-2 text-xs"
                >
                  <Search className="w-3.5 h-3.5" />
                  Search by ID
                </Button>
                <Button
                  variant={activeTab === "upload" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("upload")}
                  className="gap-2 text-xs"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  Upload VC File
                </Button>
                <Button
                  variant={activeTab === "json" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("json")}
                  className="gap-2 text-xs"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  Paste Raw JSON
                </Button>
              </div>
              <Badge variant="outline" className="font-mono text-xs hidden sm:inline-flex">
                EVM Parity
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            {/* Tab 1: Search by Certificate Number or UUID */}
            {activeTab === "search" && (
              <form onSubmit={handleSearchSubmit} className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Enter Certificate Number (e.g. HARV-2026-000001) or UUID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 h-11 text-sm font-mono"
                    />
                  </div>
                  <Button type="submit" variant="brand" className="h-11 px-6 gap-2 shadow-sm">
                    <span>Verify</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Supported formats:</span>
                  <Badge variant="secondary" className="font-mono text-[10px]">HARV-2026-000001</Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">urn:uuid:6ba7b810...</Badge>
                  <Badge variant="secondary" className="font-mono text-[10px]">cred_173167...</Badge>
                </div>
              </form>
            )}

            {/* Tab 2: File Upload */}
            {activeTab === "upload" && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center space-y-4 transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Drag and drop your W3C Verifiable Credential JSON file here
                  </p>
                  <p className="text-xs text-muted-foreground">Supports .json files containing Verifiable Credentials or Presentations</p>
                </div>
                <div>
                  <label htmlFor="vc-file-upload">
                    <Button variant="outline" size="sm" className="cursor-pointer" asChild>
                      <span>Browse Files</span>
                    </Button>
                    <input
                      id="vc-file-upload"
                      type="file"
                      accept=".json,application/json"
                      onChange={handleFileInput}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Tab 3: Paste Raw JSON */}
            {activeTab === "json" && (
              <div className="space-y-4">
                <textarea
                  rows={8}
                  placeholder='Paste W3C Verifiable Credential JSON here (e.g. { "@context": [...], "type": ["VerifiableCredential"], ... })'
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  className="w-full p-3.5 rounded-lg bg-zinc-950 text-emerald-400 font-mono text-xs border border-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-primary leading-relaxed"
                />
                <div className="flex justify-end gap-3">
                  <Button
                    onClick={() => handleDirectVerify()}
                    disabled={verifying || !jsonInput.trim()}
                    className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {verifying ? "Verifying Cryptography..." : "Execute Verification"}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Verification Error Output */}
        {verifyError && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Verification Error</p>
              <p className="text-xs opacity-90 mt-0.5">{verifyError}</p>
            </div>
          </div>
        )}

        {/* Verification Result Preview (for Direct Upload/JSON) */}
        {verifyResult && (
          <Card className="shadow-lg border border-border animate-in fade-in-50">
            <CardHeader className="pb-3 border-b border-border/60 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-xl text-white ${
                    verifyResult.status === "VALID"
                      ? "bg-emerald-600"
                      : verifyResult.status === "REVOKED"
                      ? "bg-amber-600"
                      : "bg-red-600"
                  }`}
                >
                  {verifyResult.status === "VALID" ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <CardTitle className="text-base font-bold">
                    Verification Result: {verifyResult.status}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Evaluated in {verifyResult.verificationLatencyMs}ms across 5 cryptographic layers
                  </CardDescription>
                </div>
              </div>
              <Link href={`/verify/${encodeURIComponent(verifyResult.credential.certificateNumber)}`}>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                  <span>Full Report</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3 bg-muted/40 rounded-lg">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Recipient:</span>
                  <span className="font-bold text-foreground">{verifyResult.credential.recipientName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Course / Program:</span>
                  <span className="font-bold text-foreground">{verifyResult.credential.courseName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Certificate #:</span>
                  <span className="font-mono font-bold text-primary">{verifyResult.credential.certificateNumber}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Signature:</span>
                  <span className={`font-bold ${verifyResult.cryptography.signatureValid ? "text-emerald-600" : "text-destructive"}`}>
                    {verifyResult.cryptography.signatureValid ? "Valid (P-256)" : "Invalid"}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="font-semibold text-foreground text-xs">Checks Summary:</span>
                <div className="space-y-1">
                  {verifyResult.checks.map((chk) => (
                    <div key={chk.code} className="flex items-center justify-between text-xs p-2 rounded-md bg-muted/20">
                      <span className="text-muted-foreground">{chk.title}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-mono ${
                          chk.passed
                            ? "border-emerald-500/30 text-emerald-600"
                            : "border-destructive/30 text-destructive"
                        }`}
                      >
                        {chk.passed ? "PASSED" : "FAILED"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
          <div className="p-5 rounded-xl border border-border/60 bg-card text-card-foreground shadow-xs space-y-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm">W3C VC 2.0 & ECDSA P-256</h3>
            <p className="text-xs text-muted-foreground">
              Deterministic RFC 8785 canonical serialization with NIST P-256 digital signatures that prevent any unauthorized tampering.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-border/60 bg-card text-card-foreground shadow-xs space-y-2">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm">O(log N) Merkle Proofs</h3>
            <p className="text-xs text-muted-foreground">
              Mathematical cryptographic inclusion verified off-chain in &lt; 2ms without incurring per-credential transaction fees.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-border/60 bg-card text-card-foreground shadow-xs space-y-2">
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm">Ethereum Sepolia Consensus</h3>
            <p className="text-xs text-muted-foreground">
              Anchored directly onto the CredvailRegistry smart contract with permanent block timestamps and public auditability.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
