"use client";

import * as React from "react";
import Link from "next/link";
import {
  Award,
  Search,
  Download,
  QrCode as QrIcon,
  ExternalLink,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileText,
  Copy,
  Check,
  Code,
  Binary,
  ShieldCheck,
  Network,
  Ban,
  Clock,
  Activity,
  Sparkles,
  Layers,
  Eye,
  FileCode,
  X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { StoredCredentialRecord } from "@/lib/repositories/credential-repository";
import type { MerkleInclusionProof } from "@/types";

export default function CertificatesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const unwrappedParams = React.use(params);
  const slug = unwrappedParams.slug;

  const [credentials, setCredentials] = React.useState<StoredCredentialRecord[]>([]);
  const [totalCount, setTotalCount] = React.useState<number>(0);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");

  // Modals state
  const [selectedQrCred, setSelectedQrCred] = React.useState<StoredCredentialRecord | null>(null);
  const [selectedVcCred, setSelectedVcCred] = React.useState<StoredCredentialRecord | null>(null);
  const [selectedMerkleCred, setSelectedMerkleCred] = React.useState<StoredCredentialRecord | null>(null);
  const [merkleProofData, setMerkleProofData] = React.useState<MerkleInclusionProof | null>(null);
  const [merkleProofLoading, setMerkleProofLoading] = React.useState<boolean>(false);
  const [onChainVerifying, setOnChainVerifying] = React.useState<boolean>(false);
  const [onChainResult, setOnChainResult] = React.useState<{
    verified: boolean;
    contractAddress: string;
    chainId: number;
    anchoredAtDate?: string;
  } | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Phase 12: Revocation & Status Snapshot State
  const [selectedRevokeCred, setSelectedRevokeCred] = React.useState<StoredCredentialRecord | null>(null);
  const [revokeReason, setRevokeReason] = React.useState<string>("");
  const [revokeLoading, setRevokeLoading] = React.useState<boolean>(false);
  const [revokeSuccess, setRevokeSuccess] = React.useState<{
    epoch?: number;
    onChainTxHash?: string;
  } | null>(null);
  const [revokeError, setRevokeError] = React.useState<string | null>(null);

  const fetchCredentials = React.useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL(`/api/v1/tenants/${slug}/credentials`, window.location.origin);
      if (searchQuery) url.searchParams.set("search", searchQuery);
      if (statusFilter !== "ALL") url.searchParams.set("state", statusFilter);
      url.searchParams.set("limit", "100");

      const res = await fetch(url.toString());
      const json = await res.json();
      if (json.success && json.data) {
        setCredentials(json.data);
        setTotalCount(json.meta?.total || json.data.length);
      }
    } catch (err) {
      console.error("Failed to load credentials:", err);
    } finally {
      setLoading(false);
    }
  }, [slug, searchQuery, statusFilter]);

  React.useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenMerkleModal = async (cred: StoredCredentialRecord) => {
    setSelectedMerkleCred(cred);
    setMerkleProofLoading(true);
    setOnChainResult(null);
    try {
      const res = await fetch(`/api/v1/tenants/${slug}/credentials/${cred.id}/merkle-proof`);
      const json = await res.json();
      if (json.success && json.data) {
        setMerkleProofData(json.data);
      } else {
        const evidence = (cred.vcPayloadJson as any)?.evidence?.[0];
        if (evidence && evidence.proof) {
          setMerkleProofData({
            leafHash: evidence.leafHash || (cred.leafHash as any),
            root: evidence.merkleRoot,
            proof: evidence.proof,
            index: evidence.merkleIndex ?? cred.merkleIndex,
            totalLeaves: evidence.totalLeaves ?? 1,
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch Merkle proof:", err);
    } finally {
      setMerkleProofLoading(false);
    }
  };

  const handleVerifyOnChain = async (credId: string) => {
    setOnChainVerifying(true);
    try {
      const res = await fetch(`/api/v1/tenants/${slug}/credentials/${credId}/verify-onchain`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success && json.data) {
        setOnChainResult({
          verified: json.data.verified,
          contractAddress: json.data.contractAddress,
          chainId: json.data.chainId,
          anchoredAtDate: json.data.onChainBatch?.anchoredAtDate,
        });
      }
    } catch (err) {
      console.error("Failed to verify on-chain:", err);
    } finally {
      setOnChainVerifying(false);
    }
  };

  const handleExecuteRevocation = async () => {
    if (!selectedRevokeCred) return;
    setRevokeLoading(true);
    setRevokeError(null);
    setRevokeSuccess(null);
    try {
      const res = await fetch(`/api/v1/tenants/${slug}/credentials/${selectedRevokeCred.id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: revokeReason || "Administrative Revocation" }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setRevokeSuccess({
          epoch: json.data.statusEpoch || json.data.statusSnapshot?.epoch,
          onChainTxHash: json.data.statusSnapshot?.onChainTxHash,
        });
        setCredentials((prev) =>
          prev.map((c) => (c.id === selectedRevokeCred.id ? { ...c, state: "REVOKED" } : c))
        );
      } else {
        setRevokeError(json.error?.message || "Failed to revoke credential.");
      }
    } catch (err: any) {
      setRevokeError(err.message || "Network error executing revocation.");
    } finally {
      setRevokeLoading(false);
    }
  };

  const activeCount = credentials.filter((c) => c.state === "ISSUED").length;
  const revokedCount = credentials.filter((c) => c.state === "REVOKED").length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-black/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-[-0.025em] text-[#0F172A]">
              Digital Certificates
            </h1>
            <Badge variant="outline" className="border-black/[0.08] bg-white text-[#475569] font-mono text-[11px] gap-1.5">
              <Sparkles className="h-3 w-3" />
              W3C VC 2.0 & Merkle Proofs
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            W3C Verifiable Credentials 2.0 signed with ECDSA NIST P-256, verified via Keccak-256 Merkle proofs and W3C Bitstring Status Lists.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href={`/${slug}/batches`}>
            <Button variant="brand" size="sm" className="gap-2 shadow-sm text-xs">
              <Award className="h-4 w-4" />
              <span>Ingest & Generate New Batch</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Minted
            </span>
            <Award className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2">{totalCount}</p>
          <span className="text-[10px] text-muted-foreground">Lifetime credential registry</span>
        </Card>

        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-emerald-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Active & Valid
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">{activeCount}</p>
          <span className="text-[10px] text-muted-foreground">W3C Bitstring bit = 0 (Unrevoked)</span>
        </Card>

        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-rose-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Revoked Credentials
            </span>
            <Ban className="h-4 w-4 text-rose-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-2">{revokedCount}</p>
          <span className="text-[10px] text-muted-foreground">Status list updated on-chain</span>
        </Card>

        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-blue-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Print-Ready PDFs
            </span>
            <FileText className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-2">{totalCount}</p>
          <span className="text-[10px] text-muted-foreground">High-DPI vector rendering ready</span>
        </Card>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search certificate #, recipient, or course..."
            className="pl-9 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">Status:</span>
          {["ALL", "ISSUED", "REVOKED"].map((st) => (
            <Button
              key={st}
              variant={statusFilter === st ? "default" : "outline"}
              size="sm"
              className="text-xs h-8 px-2.5"
              onClick={() => setStatusFilter(st)}
            >
              {st}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchCredentials}
            className="h-8 px-2 text-muted-foreground"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Credentials Table */}
      <Card className="border shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                  <th className="p-3.5">Certificate #</th>
                  <th className="p-3.5">Recipient</th>
                  <th className="p-3.5">Email</th>
                  <th className="p-3.5">Course / Award</th>
                  <th className="p-3.5">Issue Date</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Cryptographic Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && credentials.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                      Loading credentials repository...
                    </td>
                  </tr>
                ) : credentials.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center space-y-2">
                      <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
                        <Award className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">No certificates found</p>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                        No digital certificates match your filter. Upload a recipient spreadsheet to generate verifiable credentials.
                      </p>
                      <Link href={`/${slug}/batches`}>
                        <Button variant="brand" size="sm" className="mt-2 text-xs">
                          Go to Spreadsheet Ingestion
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ) : (
                  credentials.map((cred) => (
                    <tr key={cred.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-foreground">
                        <Badge variant="outline" className="font-mono text-[11px] bg-background">
                          {cred.certificateNumber}
                        </Badge>
                      </td>
                      <td className="p-3.5 font-medium text-foreground">{cred.recipientName}</td>
                      <td className="p-3.5 font-mono text-muted-foreground">{cred.recipientEmail}</td>
                      <td className="p-3.5 text-muted-foreground font-medium">
                        {cred.claimsData["course_name"] || "General Certificate"}
                      </td>
                      <td className="p-3.5 text-muted-foreground font-mono">
                        {cred.claimsData["issue_date"] || new Date(cred.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3.5">
                        <Badge
                          variant={
                            cred.state === "ISSUED"
                              ? "verified"
                              : cred.state === "REVOKED"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {cred.state}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-right space-x-1.5 whitespace-nowrap">
                        {/* Inspect Signed W3C VC JSON */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedVcCred(cred)}
                          title="Inspect Signed W3C Verifiable Credential 2.0"
                          className="h-7 px-2 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        >
                          <Code className="h-3.5 w-3.5" />
                          <span>VC JSON</span>
                        </Button>

                        {/* View Merkle Inclusion Proof */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenMerkleModal(cred)}
                          title="Verify Keccak-256 Merkle Inclusion Proof"
                          className="h-7 px-2 text-xs gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                        >
                          <Network className="h-3.5 w-3.5" />
                          <span>Proof</span>
                        </Button>

                        {/* View QR Code */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedQrCred(cred)}
                          title="View Verification QR Code"
                          className="h-7 w-7 p-0"
                        >
                          <QrIcon className="h-3.5 w-3.5" />
                        </Button>

                        {/* Public Verification Link */}
                        <a
                          href={`/verify/${encodeURIComponent(cred.certificateNumber)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Open Public Verification Portal"
                            className="h-7 px-2 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Verify</span>
                          </Button>
                        </a>

                        {/* Download Print-ready PDF */}
                        <a
                          href={`/api/v1/tenants/${slug}/credentials/${cred.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                          >
                            <Download className="h-3 w-3" />
                            <span>PDF</span>
                          </Button>
                        </a>

                        {/* Revoke Credential */}
                        {cred.state === "ISSUED" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedRevokeCred(cred);
                              setRevokeReason("");
                              setRevokeSuccess(null);
                              setRevokeError(null);
                            }}
                            title="Revoke Credential & Update W3C Status List"
                            className="h-7 px-2 text-xs gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            <span>Revoke</span>
                          </Button>
                        ) : (
                          <span className="inline-flex items-center text-[10px] text-rose-500 font-mono px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">
                            Bit=1
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* QR Code Modal */}
      {selectedQrCred && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-sm shadow-2xl animate-in fade-in-50 zoom-in-95">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-base font-bold">Certificate Verification QR</CardTitle>
              <CardDescription className="text-xs font-mono">{selectedQrCred.certificateNumber}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-center p-6">
              <div className="border border-border p-4 bg-white rounded-2xl inline-block shadow-sm">
                <div className="h-44 w-44 mx-auto flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl">
                  <QrIcon className="h-32 w-32 text-slate-900" />
                </div>
              </div>
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-foreground">{selectedQrCred.recipientName}</p>
                <p className="text-muted-foreground font-mono text-[11px] truncate">
                  {`https://credvail.com/verify/${selectedQrCred.credentialId.replace("urn:uuid:", "")}`}
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex gap-2 border-t border-border pt-4">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setSelectedQrCred(null)}
              >
                Close
              </Button>
              <a
                href={`/verify/${encodeURIComponent(selectedQrCred.certificateNumber)}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1"
              >
                <Button variant="outline" size="sm" className="w-full text-xs gap-1 border-primary/30 text-primary">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Portal
                </Button>
              </a>
              <a
                href={`/api/v1/tenants/${slug}/credentials/${selectedQrCred.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="flex-1"
              >
                <Button size="sm" variant="brand" className="w-full text-xs gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  PDF
                </Button>
              </a>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* W3C VC 2.0 Inspector Modal */}
      {selectedVcCred && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl shadow-2xl border border-border animate-in fade-in-50 zoom-in-95">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Code className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">
                      Signed W3C Verifiable Credential 2.0
                    </CardTitle>
                    <CardDescription className="text-xs font-mono">
                      {selectedVcCred.certificateNumber} • {selectedVcCred.credentialId}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="font-mono text-xs border-emerald-500/30 text-emerald-600">
                  ECDSA P-256 Signed
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">RFC 8785 Canonical JSON Payload</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() =>
                    handleCopy(
                      JSON.stringify(selectedVcCred.vcPayloadJson, null, 2),
                      "copy-vc-json"
                    )
                  }
                >
                  {copiedId === "copy-vc-json" ? (
                    <Check className="h-3 w-3 text-emerald-600 mr-1" />
                  ) : (
                    <Copy className="h-3 w-3 mr-1" />
                  )}
                  Copy Full JSON
                </Button>
              </div>

              <pre className="p-3.5 rounded-lg bg-zinc-950 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-72 border border-zinc-800 leading-relaxed">
                {JSON.stringify(selectedVcCred.vcPayloadJson, null, 2)}
              </pre>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-muted/40 p-3 rounded-lg border border-border/50">
                <div>
                  <span className="text-muted-foreground">Digital Signature Type:</span>
                  <p className="font-mono font-semibold text-foreground">JsonWebSignature2020</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status List Spec:</span>
                  <p className="font-mono font-semibold text-foreground">BitstringStatusList 2026</p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex items-center justify-end border-t pt-3">
              <Button variant="outline" size="sm" onClick={() => setSelectedVcCred(null)}>
                Close
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Merkle Proof Visualizer Modal */}
      {selectedMerkleCred && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl shadow-2xl border border-border animate-in fade-in-50 zoom-in-95">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Network className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">
                      Keccak-256 Merkle Inclusion Proof
                    </CardTitle>
                    <CardDescription className="text-xs">
                      OpenZeppelin MerkleProof.sol & CredvailRegistry.sol EVM Verification Invariant
                    </CardDescription>
                  </div>
                </div>
                <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-mono text-xs">
                  O(log N) Proof
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-xs">
              {merkleProofLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                  Computing Merkle tree verification path...
                </div>
              ) : merkleProofData ? (
                <>
                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center gap-2.5">
                    <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="font-bold">Cryptographically Verified Leaf Inclusion</p>
                      <p className="text-[11px] opacity-90">
                        This credential&apos;s leaf hash correctly reconstructs the batch Merkle root using pairwise sorted hashing.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="font-semibold text-foreground">32-Byte Merkle Root (On-Chain Commitment)</span>
                    <div className="p-2.5 rounded bg-muted font-mono text-[11px] break-all border border-border/50 flex items-center justify-between gap-2">
                      <span>{merkleProofData.root}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 shrink-0"
                        onClick={() => handleCopy(merkleProofData.root, "copy-root")}
                      >
                        {copiedId === "copy-root" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="font-semibold text-foreground">Credential Leaf Hash (Keccak-256)</span>
                    <div className="p-2.5 rounded bg-muted font-mono text-[11px] break-all border border-border/50 flex items-center justify-between gap-2">
                      <span>{merkleProofData.leafHash}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 shrink-0"
                        onClick={() => handleCopy(merkleProofData.leafHash, "copy-leaf")}
                      >
                        {copiedId === "copy-leaf" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        Inclusion Audit Path ({merkleProofData.proof.length} Step{merkleProofData.proof.length === 1 ? "" : "s"})
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        Leaf Index: <strong className="text-foreground">{merkleProofData.index}</strong> of{" "}
                        <strong className="text-foreground">{merkleProofData.totalLeaves}</strong>
                      </span>
                    </div>
                    <div className="space-y-1 font-mono text-[11px]">
                      {merkleProofData.proof.length === 0 ? (
                        <div className="p-2.5 rounded bg-muted text-muted-foreground text-center">
                          Single-leaf batch: leaf hash is directly identical to the Merkle root.
                        </div>
                      ) : (
                        merkleProofData.proof.map((p, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded bg-muted/60 border border-border/40 flex items-center justify-between gap-2"
                          >
                            <span className="text-muted-foreground">Step {idx + 1}:</span>
                            <span className="break-all">{p}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Sepolia Verification */}
                  <div className="p-3.5 rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        <span className="font-semibold text-foreground">Ethereum Sepolia Smart Contract Verification</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-indigo-300 text-indigo-600 dark:text-indigo-400 font-mono">
                        Chain ID: 11155111
                      </Badge>
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                      Directly verify this credential&apos;s inclusion proof on-chain against <code className="font-mono text-primary">CredvailRegistry.sol</code> on Ethereum Sepolia.
                    </p>

                    {onChainResult ? (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <Check className="h-4 w-4" />
                          <span>On-Chain Status: {onChainResult.verified ? "CRYPTOGRAPHICALLY VERIFIED ON SEPOLIA" : "INVALID PROOF"}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                          <span>Contract: {onChainResult.contractAddress.slice(0, 10)}...{onChainResult.contractAddress.slice(-8)}</span>
                          <a
                            href={`https://sepolia.etherscan.io/address/${onChainResult.contractAddress}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-indigo-500 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>Etherscan</span>
                          </a>
                        </div>
                        {onChainResult.anchoredAtDate && (
                          <p className="text-[10px] text-muted-foreground">
                            Anchored At: {new Date(onChainResult.anchoredAtDate).toLocaleString()}
                          </p>
                        )}
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleVerifyOnChain(selectedMerkleCred.id)}
                        disabled={onChainVerifying}
                        className="w-full h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                      >
                        <Network className={`h-3.5 w-3.5 ${onChainVerifying ? "animate-spin" : ""}`} />
                        <span>{onChainVerifying ? "Verifying on Sepolia..." : "Verify On-Chain (CredvailRegistry.sol)"}</span>
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-6 text-center text-muted-foreground">
                  <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-amber-600" />
                  Merkle inclusion proof has not been computed for this credential.
                </div>
              )}
            </CardContent>
            <CardFooter className="flex items-center justify-end border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedMerkleCred(null);
                  setMerkleProofData(null);
                  setOnChainResult(null);
                }}
              >
                Close
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Revocation Modal */}
      {selectedRevokeCred && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-2xl border-rose-200 dark:border-rose-900 animate-in fade-in-50 zoom-in-95">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <Ban className="h-5 w-5" />
                <CardTitle className="text-base font-semibold">Revoke Verifiable Credential</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Irrevocably update W3C Bitstring Status List 2021 and anchor digest to Ethereum Sepolia.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-xs">
              <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Certificate #:</span>
                  <span className="font-bold text-foreground">{selectedRevokeCred.certificateNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recipient:</span>
                  <span className="text-foreground">{selectedRevokeCred.recipientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status List Bit:</span>
                  <span className="text-primary font-bold">Index {selectedRevokeCred.bitstringIndex}</span>
                </div>
              </div>

              {revokeSuccess ? (
                <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Revocation Anchored Successfully</span>
                  </div>
                  <p className="text-[11px]">
                    Status List 2021 bit flipped to 1. On-chain epoch #{revokeSuccess.epoch} anchored to Sepolia registry.
                  </p>
                  {revokeSuccess.onChainTxHash && (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${revokeSuccess.onChainTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-700 dark:text-emerald-300 hover:underline"
                    >
                      <span>Tx: {revokeSuccess.onChainTxHash.slice(0, 16)}...</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground" htmlFor="revoke-reason">
                      Revocation Reason (Recorded in Immutable Audit Log)
                    </label>
                    <Input
                      id="revoke-reason"
                      value={revokeReason}
                      onChange={(e) => setRevokeReason(e.target.value)}
                      placeholder="e.g. Course requirements not completed / Administrative error"
                      className="text-xs"
                    />
                  </div>

                  {revokeError && (
                    <div className="p-2.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 text-xs">
                      {revokeError}
                    </div>
                  )}
                </>
              )}
            </CardContent>
            <CardFooter className="flex items-center justify-end gap-2 border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedRevokeCred(null)}
                disabled={revokeLoading}
              >
                {revokeSuccess ? "Close" : "Cancel"}
              </Button>
              {!revokeSuccess && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleExecuteRevocation}
                  disabled={revokeLoading}
                  className="gap-1.5"
                >
                  <Ban className="h-3.5 w-3.5" />
                  <span>{revokeLoading ? "Executing Revocation..." : "Confirm Irrevocable Revocation"}</span>
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
