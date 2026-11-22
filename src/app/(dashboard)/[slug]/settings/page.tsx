"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building,
  Globe,
  Palette,
  Check,
  Copy,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Save,
  Image as ImageIcon,
  KeyRound,
  Lock,
  Sparkles,
  Shield,
  Layers,
  Award,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TenantRecord } from "@/lib/repositories/tenant-repository";

const BRAND_PRESETS = [
  {
    name: "Oxford Navy & Gold",
    primary: "#0f1d38",
    secondary: "#d97706",
    accent: "#2563eb",
  },
  {
    name: "MIT Cyber & Indigo",
    primary: "#182f63",
    secondary: "#818cf8",
    accent: "#5a5cf2",
  },
  {
    name: "Stanford Cardinal & Gold",
    primary: "#8c1515",
    secondary: "#c99700",
    accent: "#b1040e",
  },
  {
    name: "Emerald Academy",
    primary: "#064e3b",
    secondary: "#10b981",
    accent: "#047857",
  },
  {
    name: "Obsidian Trust",
    primary: "#09090b",
    secondary: "#71717a",
    accent: "#27272a",
  },
];

export default function TenantSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const unwrappedParams = React.use(params);
  const slug = unwrappedParams.slug;

  const [tenant, setTenant] = React.useState<TenantRecord | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [approving, setApproving] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [copiedDid, setCopiedDid] = React.useState<boolean>(false);

  // Active Tab
  const [activeTab, setActiveTab] = React.useState<"identity" | "branding" | "trust">("identity");

  // Form states
  const [name, setName] = React.useState<string>("");
  const [legalEntityName, setLegalEntityName] = React.useState<string>("");
  const [websiteUrl, setWebsiteUrl] = React.useState<string>("");
  const [logoUrl, setLogoUrl] = React.useState<string>("");
  const [primaryColor, setPrimaryColor] = React.useState<string>("#0f1d38");
  const [secondaryColor, setSecondaryColor] = React.useState<string>("#d97706");
  const [accentColor, setAccentColor] = React.useState<string>("#2563eb");
  const [tagline, setTagline] = React.useState<string>("");

  const loadTenantData = React.useCallback(async (tenantSlug: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/tenants/${tenantSlug}`);
      if (!res.ok) throw new Error("Failed to load tenant metadata");
      const data = await res.json();
      const t: TenantRecord = data.data;

      setTenant(t);
      setName(t.name);
      setLegalEntityName(t.legalEntityName);
      setWebsiteUrl(t.websiteUrl);
      setLogoUrl(t.logoUrl || "");

      const branding = (t.brandingConfig as any) || {};
      if (branding.primaryColor) setPrimaryColor(branding.primaryColor);
      if (branding.secondaryColor) setSecondaryColor(branding.secondaryColor);
      if (branding.accentColor) setAccentColor(branding.accentColor);
      if (branding.tagline) setTagline(branding.tagline);
    } catch (err: any) {
      setError(err.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadTenantData(slug);
  }, [slug, loadTenantData]);

  const handleCopyDid = () => {
    if (tenant?.didUri) {
      navigator.clipboard.writeText(tenant.didUri);
      setCopiedDid(true);
      setTimeout(() => setCopiedDid(false), 2000);
    }
  };

  const handleApproveOrganization = async () => {
    try {
      setApproving(true);
      setError(null);
      setSuccessMsg(null);
      const res = await fetch(`/api/v1/tenants/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationStatus: "VERIFIED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to approve organization");
      setTenant(data.data);
      setSuccessMsg("Organization verification approved successfully! Your institution is officially verified.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/v1/tenants/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          legalEntityName,
          websiteUrl,
          logoUrl: logoUrl || null,
          brandingConfig: {
            primaryColor,
            secondaryColor,
            accentColor,
            tagline,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to save configuration");
      }

      setTenant(data.data);
      setSuccessMsg("Organization profile, cryptographic identity, and branding updated successfully.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (preset: (typeof BRAND_PRESETS)[0]) => {
    setPrimaryColor(preset.primary);
    setSecondaryColor(preset.secondary);
    setAccentColor(preset.accent);
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-muted-foreground animate-pulse">
        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
        Loading institutional settings & branding profile...
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-serif">
              Organization Settings & Branding
            </h1>
            <Badge variant="outline" className="border-primary/30 text-primary font-mono text-xs gap-1">
              <Sparkles className="h-3 w-3" />
              Tenant Governance
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Configure institutional profile details, visual certificate themes, decentralized identity (W3C DID), and verification policies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/${slug}`}>
            <Button variant="outline" size="sm" className="text-xs">
              Back to Overview
            </Button>
          </Link>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-3.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl dark:bg-red-950/50 dark:text-red-300 dark:border-red-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 p-3.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-1">
        <Button
          variant={activeTab === "identity" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("identity")}
          className="gap-2 text-xs"
        >
          <Building className="h-3.5 w-3.5" />
          <span>Institutional Identity</span>
        </Button>
        <Button
          variant={activeTab === "branding" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("branding")}
          className="gap-2 text-xs"
        >
          <Palette className="h-3.5 w-3.5" />
          <span>Certificate Branding</span>
        </Button>
        <Button
          variant={activeTab === "trust" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("trust")}
          className="gap-2 text-xs"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>DID & Verification Authority</span>
        </Button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* TAB 1: Institutional Profile */}
        {activeTab === "identity" && (
          <div className="space-y-6">
            <Card className="border shadow-xs">
              <CardHeader className="p-5 pb-3 border-b border-border/60">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Building className="h-4 w-4 text-primary" />
                  <span>Legal & Operational Profile</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Official institutional records presented on publicly verified credentials.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground" htmlFor="name">
                      Institution Display Name
                    </label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="text-xs"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground" htmlFor="legalEntityName">
                      Registered Legal Entity Name
                    </label>
                    <Input
                      id="legalEntityName"
                      value={legalEntityName}
                      onChange={(e) => setLegalEntityName(e.target.value)}
                      className="text-xs"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground" htmlFor="websiteUrl">
                    Official Institutional Domain / Website URL
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="websiteUrl"
                      type="url"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      className="pl-9 text-xs"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground" htmlFor="logoUrl">
                    Official High-Resolution Vector / PNG Logo URL
                  </label>
                  <div className="relative">
                    <ImageIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="logoUrl"
                      type="url"
                      placeholder="https://university.edu/assets/seal.png"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      className="pl-9 text-xs"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Rendered dynamically on certificate headers and public verification landing pages.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex items-center justify-between p-4 border-t bg-muted/10">
                <span className="text-[11px] text-muted-foreground font-mono">Tenant Slug: /{slug}</span>
                <Button type="submit" size="sm" disabled={saving} className="gap-2 bg-primary text-primary-foreground">
                  <Save className="h-4 w-4" />
                  <span>{saving ? "Saving Changes..." : "Save Profile"}</span>
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {/* TAB 2: Certificate Branding */}
        {activeTab === "branding" && (
          <div className="space-y-6">
            <Card className="border shadow-xs">
              <CardHeader className="p-5 pb-3 border-b border-border/60">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Palette className="h-4 w-4 text-primary" />
                  <span>Brand Palette & Themes</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Choose an institutional palette or customize your primary, accent, and seal colors.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-5">
                {/* Preset Themes Selector */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-foreground block">
                    Curated Institutional Presets
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
                    {BRAND_PRESETS.map((preset) => (
                      <div
                        key={preset.name}
                        onClick={() => applyPreset(preset)}
                        className="p-3 border rounded-xl cursor-pointer hover:border-primary transition-all text-xs bg-card hover:shadow-xs space-y-2"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-4 w-4 rounded-full border shadow-2xs"
                            style={{ backgroundColor: preset.primary }}
                          />
                          <span
                            className="h-4 w-4 rounded-full border shadow-2xs"
                            style={{ backgroundColor: preset.secondary }}
                          />
                          <span
                            className="h-4 w-4 rounded-full border shadow-2xs"
                            style={{ backgroundColor: preset.accent }}
                          />
                        </div>
                        <span className="font-semibold block text-[11px] text-foreground truncate">
                          {preset.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom Color Pickers */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground" htmlFor="primaryColor">
                      Primary Brand Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="primaryColorPicker"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-9 w-9 rounded border cursor-pointer p-0.5"
                      />
                      <Input
                        id="primaryColor"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground" htmlFor="secondaryColor">
                      Secondary (Gold) Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="secondaryColorPicker"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="h-9 w-9 rounded border cursor-pointer p-0.5"
                      />
                      <Input
                        id="secondaryColor"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground" htmlFor="accentColor">
                      Accent Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="accentColorPicker"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="h-9 w-9 rounded border cursor-pointer p-0.5"
                      />
                      <Input
                        id="accentColor"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground" htmlFor="tagline">
                    Institutional Motto / Tagline
                  </label>
                  <Input
                    id="tagline"
                    placeholder="e.g. Veritas et Virtus (Truth and Virtue)"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    className="text-xs"
                  />
                </div>

                {/* Live Certificate Preview Swatch */}
                <div className="space-y-2 pt-2 border-t">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Brand Palette Live Preview
                  </span>
                  <div
                    className="p-6 sm:p-8 rounded-xl border shadow-sm transition-all"
                    style={{
                      backgroundColor: "#ffffff",
                      borderColor: primaryColor,
                      borderWidth: "3px",
                    }}
                  >
                    <div className="flex items-center justify-between border-b pb-4 mb-4">
                      <div className="font-serif font-bold text-base" style={{ color: primaryColor }}>
                        {name || "University / Academy Name"}
                      </div>
                      <div
                        className="text-[10px] px-2.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider shadow-2xs"
                        style={{ backgroundColor: secondaryColor, color: "#ffffff" }}
                      >
                        OFFICIAL CREDENTIAL
                      </div>
                    </div>
                    <div className="text-center py-6 space-y-2">
                      <div className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">
                        Certificate of Excellence & Completion
                      </div>
                      <div className="text-2xl font-serif font-bold" style={{ color: primaryColor }}>
                        Eleanor Vance, Ph.D.
                      </div>
                      <div className="text-xs italic text-slate-600 max-w-md mx-auto">
                        {tagline || "For extraordinary contributions to cryptographic verification & distributed consensus."}
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t pt-3 text-[10px] text-slate-500 font-mono">
                      <span>W3C VC 2.0 • ECDSA NIST P-256</span>
                      <span>Ethereum Sepolia Anchored</span>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex items-center justify-end p-4 border-t bg-muted/10">
                <Button type="submit" size="sm" disabled={saving} className="gap-2 bg-primary text-primary-foreground">
                  <Save className="h-4 w-4" />
                  <span>{saving ? "Saving Changes..." : "Save Brand Palette"}</span>
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {/* TAB 3: Cryptographic DID & Governance */}
        {activeTab === "trust" && (
          <div className="space-y-6">
            <Card className="border shadow-xs">
              <CardHeader className="p-5 pb-3 border-b border-border/60">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span>W3C DID Identity & Verification Trust</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Decentralized Identifier resolved deterministically via the W3C <code className="font-mono text-xs">did:web</code> specification.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-5">
                {/* W3C DID URI */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">
                      W3C DID Identifier (Immutable)
                    </label>
                    <Link
                      href={`/tenants/${slug}/.well-known/did.json`}
                      target="_blank"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <span>Inspect did.json</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={tenant?.didUri || `did:web:credvail.com:tenants:${slug}`}
                      className="font-mono text-xs bg-muted/40 select-all"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyDid}
                      className="shrink-0 gap-1 text-xs"
                    >
                      {copiedDid ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Verification Status Banner */}
                <div className="p-4 rounded-xl bg-muted/30 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">Institutional Accreditation Status</span>
                        <Badge
                          variant={
                            tenant?.verificationStatus === "VERIFIED"
                              ? "verified"
                              : tenant?.verificationStatus === "PENDING"
                              ? "warning"
                              : "outline"
                          }
                        >
                          {tenant?.verificationStatus}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {tenant?.verificationStatus === "VERIFIED"
                          ? "Accreditation active. Credentials issued by this tenant evaluate with full cryptographic trust."
                          : "Accreditation pending. Complete institution approval to unlock production verification badges."}
                      </p>
                    </div>
                  </div>

                  {tenant?.verificationStatus !== "VERIFIED" && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleApproveOrganization}
                      disabled={approving}
                      className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shrink-0"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>{approving ? "Approving..." : "Approve & Verify Tenant"}</span>
                    </Button>
                  )}
                </div>

                {/* Quick Link to Signing Keys */}
                <div className="p-4 rounded-xl border border-border bg-card flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-xs text-foreground block">
                      ECDSA NIST P-256 Signing Key Management
                    </span>
                    <span className="text-[11px] text-muted-foreground block">
                      Manage cryptographic signing epochs, key rotation, and emergency revocation.
                    </span>
                  </div>
                  <Link href={`/${slug}/keys`}>
                    <Button variant="outline" size="sm" className="text-xs gap-1.5">
                      <KeyRound className="h-3.5 w-3.5" />
                      <span>Manage Keys</span>
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </form>
    </div>
  );
}
