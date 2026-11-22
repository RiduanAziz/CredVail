"use client";

import * as React from "react";
import Link from "next/link";
import {
  KeyRound,
  Shield,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Lock,
  Calendar,
  Code,
  FileCode,
  CheckCircle2,
  XCircle,
  Hash,
  Sparkles,
  ArrowRight,
  Activity,
  Layers,
  Fingerprint,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { PublicIssuerKeyInfo } from "@/lib/services/key-management-service";

interface KeysResponse {
  activeKey: PublicIssuerKeyInfo | null;
  allEpochs: PublicIssuerKeyInfo[];
  didUri: string;
}

export default function KeysPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const unwrappedParams = React.use(params);
  const slug = unwrappedParams.slug;

  const [data, setData] = React.useState<KeysResponse | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [rotating, setRotating] = React.useState<boolean>(false);
  const [compromiseLoading, setCompromiseLoading] = React.useState<boolean>(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [notification, setNotification] = React.useState<{ type: "success" | "error"; message: string } | null>(null);

  // Modals state
  const [showRotateModal, setShowRotateModal] = React.useState<boolean>(false);
  const [compromiseTarget, setCompromiseTarget] = React.useState<PublicIssuerKeyInfo | null>(null);
  const [compromiseConfirmText, setCompromiseConfirmText] = React.useState<string>("");
  const [inspectKey, setInspectKey] = React.useState<PublicIssuerKeyInfo | null>(null);

  const fetchKeys = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/tenants/${slug}/keys`);
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }

      if (res.ok && json?.success && json?.data) {
        setData(json.data);
      } else {
        setNotification({
          type: "error",
          message: json?.error?.message || `Failed to load institutional keys (${res.status}).`,
        });
      }
    } catch (err: any) {
      setNotification({
        type: "error",
        message: err.message || "Network error loading institutional keys.",
      });
    } finally {
      setLoading(false);
    }
  }, [slug]);

  React.useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRotateKey = async () => {
    setRotating(true);
    setNotification(null);
    try {
      const res = await fetch(`/api/v1/tenants/${slug}/keys/rotate`, {
        method: "POST",
      });
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }

      if (res.ok && json?.success) {
        setNotification({
          type: "success",
          message: `Successfully advanced institutional signing authority to Key Epoch ${json.data.keyEpoch}.`,
        });
        setShowRotateModal(false);
        await fetchKeys();
      } else {
        setNotification({
          type: "error",
          message: json?.error?.message || `Failed to rotate key (${res.status}).`,
        });
      }
    } catch (err: any) {
      setNotification({
        type: "error",
        message: err.message || "Network error during key rotation.",
      });
    } finally {
      setRotating(false);
    }
  };

  const handleCompromiseKey = async () => {
    if (!compromiseTarget) return;
    setCompromiseLoading(true);
    setNotification(null);
    try {
      const res = await fetch(`/api/v1/tenants/${slug}/keys/compromise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epoch: compromiseTarget.keyEpoch }),
      });
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }

      if (res.ok && json?.success) {
        setNotification({
          type: "success",
          message: `Key Epoch ${compromiseTarget.keyEpoch} flagged as COMPROMISED and immediately revoked.`,
        });
        setCompromiseTarget(null);
        setCompromiseConfirmText("");
        await fetchKeys();
      } else {
        setNotification({
          type: "error",
          message: json?.error?.message || `Failed to flag key compromise (${res.status}).`,
        });
      }
    } catch (err: any) {
      setNotification({
        type: "error",
        message: err.message || "Network error reporting key compromise.",
      });
    } finally {
      setCompromiseLoading(false);
    }
  };

  const didDocUrl = `/tenants/${slug}/.well-known/did.json`;

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-serif">
              Signing Keys & Institutional Trust
            </h1>
            <Badge variant="outline" className="border-primary/30 text-primary font-mono text-xs gap-1">
              <Sparkles className="h-3 w-3" />
              Cryptographic Governance
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage ECDSA NIST P-256 signing keys, key epochs, W3C <code className="font-mono text-xs">did:web</code> identity, and emergency compromise revocation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchKeys}
            disabled={loading}
            className="gap-2 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh Keys</span>
          </Button>
          <Button
            size="sm"
            variant="brand"
            onClick={() => setShowRotateModal(true)}
            className="gap-2 text-xs shadow-sm font-medium"
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>Rotate Key Epoch</span>
          </Button>
        </div>
      </div>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Active Key Epoch
            </span>
            <KeyRound className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2">
            Epoch #{data?.activeKey?.keyEpoch ?? 1}
          </p>
          <span className="text-[10px] text-muted-foreground">Active signing authority</span>
        </Card>

        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-indigo-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Curve & Algorithm
            </span>
            <ShieldCheck className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-2">
            P-256
          </p>
          <span className="text-[10px] text-muted-foreground">secp256r1 • RFC 8785 Canonical</span>
        </Card>

        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-emerald-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Key Epochs
            </span>
            <Layers className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">
            {data?.allEpochs.length || 1}
          </p>
          <span className="text-[10px] text-muted-foreground">Historical verification intact</span>
        </Card>

        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-amber-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Identity Standard
            </span>
            <Shield className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-2">
            did:web
          </p>
          <span className="text-[10px] text-muted-foreground">W3C DID v1.0 standard compliant</span>
        </Card>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-xs border ${
            notification.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
              : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-xs font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Institutional Identity (did:web) Card */}
      <Card className="border shadow-xs bg-linear-to-r from-card via-card to-muted/20">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Institutional DID Identity</CardTitle>
                <CardDescription className="text-xs">
                  Decentralized Identifier resolved deterministically via W3C <code className="font-mono text-xs">did:web</code> specification.
                </CardDescription>
              </div>
            </div>
            <Link
              href={didDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <span>View did.json</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 border border-border/50 font-mono text-xs">
            <div className="flex items-center gap-2 overflow-x-auto w-full">
              <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-semibold text-foreground select-all">
                {data?.didUri || `did:web:credvail.com:tenants:${slug}`}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs shrink-0"
              onClick={() => handleCopy(data?.didUri || `did:web:credvail.com:tenants:${slug}`, "did-uri")}
            >
              {copiedId === "did-uri" ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  <span>Copy DID</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Key Hero Card */}
      {data?.activeKey ? (
        <Card className="border-2 border-emerald-500/30 dark:border-emerald-500/20 shadow-md bg-gradient-to-br from-card to-emerald-50/20 dark:to-emerald-950/10">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg font-bold">
                      Active Signing Key • Epoch {data.activeKey.keyEpoch}
                    </CardTitle>
                    <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-[10px] uppercase">
                      Active & Ready
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Cryptographic key pair used to sign and anchor newly issued verifiable credentials.
                  </CardDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setInspectKey(data.activeKey)}
                >
                  <Code className="h-3.5 w-3.5" />
                  <span>Inspect Public JWK</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 border-rose-200 dark:border-rose-800"
                  onClick={() => setCompromiseTarget(data.activeKey)}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Report Compromise</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-lg border border-border/60 bg-background/50 space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" />
                  Cryptographic Fingerprint (SHA-256)
                </div>
                <div className="flex items-center justify-between gap-2 font-mono text-xs font-semibold text-foreground break-all">
                  <span>{data.activeKey.fingerprint}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 shrink-0"
                    onClick={() => handleCopy(data.activeKey!.fingerprint, "fp-active")}
                  >
                    {copiedId === "fp-active" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="p-3.5 rounded-lg border border-border/60 bg-background/50 space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileCode className="h-3.5 w-3.5" />
                  Multibase Base58-BTC Key
                </div>
                <div className="flex items-center justify-between gap-2 font-mono text-xs font-semibold text-foreground break-all">
                  <span className="truncate max-w-[280px]">{data.activeKey.publicKeyMultibase}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 shrink-0"
                    onClick={() => handleCopy(data.activeKey!.publicKeyMultibase, "mb-active")}
                  >
                    {copiedId === "mb-active" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
              <div className="flex items-center gap-4">
                <span>Algorithm: <strong className="text-foreground font-mono">{data.activeKey.algorithm} (NIST P-256)</strong></span>
                <span>Curve: <strong className="text-foreground font-mono">secp256r1</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>Active Since: {new Date(data.activeKey.validFrom).toLocaleDateString()} {new Date(data.activeKey.validFrom).toLocaleTimeString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-dashed p-8 text-center">
          <div className="max-w-md mx-auto space-y-3">
            <div className="h-12 w-12 rounded-full bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold">No Active Signing Key Found</h3>
            <p className="text-xs text-muted-foreground">
              Every institution must possess an active signing key epoch to issue verifiable certificates.
            </p>
            <Button onClick={fetchKeys} size="sm">
              Initialize Key Epoch 1
            </Button>
          </div>
        </Card>
      )}

      {/* Key Epochs History Table */}
      <Card className="border shadow-xs overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold">Key Epoch History & Lifecycle</CardTitle>
              <CardDescription className="text-xs">
                Audit trail of all signing key epochs. Historical keys verify credentials issued in past epochs.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {data?.allEpochs.length || 0} Epoch{data?.allEpochs.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Epoch</th>
                  <th className="py-3 px-4">Algorithm</th>
                  <th className="py-3 px-4">Fingerprint</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Valid Range</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && (!data?.allEpochs || data.allEpochs.length === 0) ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                      Loading key epochs...
                    </td>
                  </tr>
                ) : data?.allEpochs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No key epochs found.
                    </td>
                  </tr>
                ) : (
                  data?.allEpochs.map((key) => {
                    const isKeyCompromised = key.isCompromised;
                    const isKeyActive = key.isActive && !isKeyCompromised;
                    const isKeyRotated = !key.isActive && !isKeyCompromised;

                    return (
                      <tr key={key.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-foreground">
                          Epoch {key.keyEpoch}
                        </td>
                        <td className="py-3 px-4 font-mono text-muted-foreground">
                          {key.algorithm}
                        </td>
                        <td className="py-3 px-4 font-mono text-foreground font-semibold">
                          <span className="truncate max-w-[140px] inline-block align-middle" title={key.fingerprint}>
                            {key.fingerprint.slice(0, 16)}...
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {isKeyActive && (
                            <Badge variant="verified" className="font-mono text-[10px]">
                              ACTIVE
                            </Badge>
                          )}
                          {isKeyRotated && (
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              ROTATED (Archived)
                            </Badge>
                          )}
                          {isKeyCompromised && (
                            <Badge variant="destructive" className="font-mono text-[10px] flex items-center gap-1 w-fit">
                              <AlertTriangle className="h-3 w-3" />
                              COMPROMISED
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
                          <div>From: {new Date(key.validFrom).toLocaleDateString()}</div>
                          {key.validTo && <div>To: {new Date(key.validTo).toLocaleDateString()}</div>}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setInspectKey(key)}
                            >
                              <Code className="h-3.5 w-3.5 mr-1" />
                              <span>JWK</span>
                            </Button>
                            {!key.isCompromised && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                                onClick={() => setCompromiseTarget(key)}
                              >
                                <span>Revoke</span>
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Rotate Key Modal */}
      {showRotateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-lg shadow-2xl border border-border animate-in fade-in-50 zoom-in-95">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Rotate Signing Key Epoch</CardTitle>
                  <CardDescription className="text-xs">
                    Generate a new ECDSA NIST P-256 key pair and advance institutional epoch (SEC-10).
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-4 text-xs text-muted-foreground leading-relaxed">
              <p className="font-semibold text-foreground">
                Rotating your institutional key epoch will:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  Generate a cryptographically isolated <strong>ECDSA P-256</strong> key pair in your hardware/software vault.
                </li>
                <li>
                  Advance the active signing epoch from <strong className="text-foreground">Epoch {data?.activeKey?.keyEpoch ?? 1}</strong> to <strong className="text-foreground">Epoch {(data?.activeKey?.keyEpoch ?? 1) + 1}</strong>.
                </li>
                <li>
                  Transition the previous key to <strong className="text-foreground">ROTATED</strong> status. All certificates issued previously remain 100% authentic and verifiable.
                </li>
                <li>
                  Update the institutional W3C <code className="font-mono">did:web</code> document assertion methods.
                </li>
              </ul>
            </CardContent>
            <CardFooter className="flex items-center justify-end gap-2 border-t pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRotateModal(false)}
                disabled={rotating}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="brand"
                onClick={handleRotateKey}
                disabled={rotating}
                className="gap-2"
              >
                {rotating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Generating Key...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" />
                    <span>Confirm Epoch Rotation</span>
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Emergency Compromise Revocation Modal */}
      {compromiseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-lg shadow-2xl border-rose-500/50 animate-in fade-in-50 zoom-in-95">
            <CardHeader className="pb-3 border-b border-rose-100 dark:border-rose-950 bg-rose-50/50 dark:bg-rose-950/20">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-lg text-rose-700 dark:text-rose-400">
                    Emergency Key Compromise Revocation
                  </CardTitle>
                  <CardDescription className="text-xs text-rose-600/80 dark:text-rose-400/80">
                    Target: Key Epoch {compromiseTarget.keyEpoch} (SEC-09)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-xs text-foreground leading-relaxed">
              <div className="p-3 rounded-lg bg-rose-100/50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 space-y-1.5 font-medium">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  Irreversible Security Action:
                </p>
                <p>
                  Flagging this key as COMPROMISED will immediately revoke its verification authority.
                  <strong> All certificates signed under Epoch {compromiseTarget.keyEpoch} will evaluate as INVALID upon verification.</strong>
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">
                  Type <span className="font-mono text-rose-600 font-bold">REVOKE</span> to confirm emergency revocation:
                </label>
                <Input
                  value={compromiseConfirmText}
                  onChange={(e) => setCompromiseConfirmText(e.target.value)}
                  placeholder="REVOKE"
                  className="font-mono text-xs border-rose-300 focus-visible:ring-rose-500"
                />
              </div>
            </CardContent>
            <CardFooter className="flex items-center justify-end gap-2 border-t pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCompromiseTarget(null);
                  setCompromiseConfirmText("");
                }}
                disabled={compromiseLoading}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleCompromiseKey}
                disabled={compromiseLoading || compromiseConfirmText !== "REVOKE"}
                className="gap-2 bg-rose-600 hover:bg-rose-700"
              >
                {compromiseLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Revoking...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    <span>Confirm Emergency Compromise</span>
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Inspect Public JWK Modal */}
      {inspectKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-2xl shadow-2xl border border-border animate-in fade-in-50 zoom-in-95">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Code className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">
                      Public Key Specification • Epoch {inspectKey.keyEpoch}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      RFC 7517 JsonWebKey2020 and W3C Multibase representation.
                    </CardDescription>
                  </div>
                </div>
                <Badge variant={inspectKey.isActive ? "verified" : inspectKey.isCompromised ? "destructive" : "secondary"}>
                  {inspectKey.isActive ? "ACTIVE" : inspectKey.isCompromised ? "COMPROMISED" : "ROTATED"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-xs">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">W3C Verification Method ID</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => handleCopy(inspectKey.keyIdentifier, "inspect-kid")}
                  >
                    {copiedId === "inspect-kid" ? <Check className="h-3 w-3 text-emerald-600 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    <span>Copy</span>
                  </Button>
                </div>
                <div className="p-2.5 rounded bg-muted font-mono text-[11px] break-all border border-border/50">
                  {inspectKey.keyIdentifier}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">JsonWebKey (publicKeyJwk)</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => handleCopy(JSON.stringify(inspectKey.publicKeyJwk, null, 2), "inspect-jwk")}
                  >
                    {copiedId === "inspect-jwk" ? <Check className="h-3 w-3 text-emerald-600 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    <span>Copy JSON</span>
                  </Button>
                </div>
                <pre className="p-3 rounded-lg bg-zinc-950 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-48 border border-zinc-800">
                  {JSON.stringify(inspectKey.publicKeyJwk, null, 2)}
                </pre>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Multibase Base58-BTC (publicKeyMultibase)</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => handleCopy(inspectKey.publicKeyMultibase, "inspect-mb")}
                  >
                    {copiedId === "inspect-mb" ? <Check className="h-3 w-3 text-emerald-600 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    <span>Copy</span>
                  </Button>
                </div>
                <div className="p-2.5 rounded bg-muted font-mono text-[11px] break-all border border-border/50">
                  {inspectKey.publicKeyMultibase}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex items-center justify-end border-t pt-3">
              <Button variant="outline" size="sm" onClick={() => setInspectKey(null)}>
                Close
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
