"use client";

import * as React from "react";
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
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TenantRecord } from "@/lib/repositories/tenant-repository";

export default function TenantSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [slug, setSlug] = React.useState<string>("");
  const [tenant, setTenant] = React.useState<TenantRecord | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [saving, setSaving] = React.useState<boolean>(false);
  const [approving, setApproving] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [copiedDid, setCopiedDid] = React.useState<boolean>(false);

  // Form states
  const [name, setName] = React.useState<string>("");
  const [legalEntityName, setLegalEntityName] = React.useState<string>("");
  const [websiteUrl, setWebsiteUrl] = React.useState<string>("");
  const [logoUrl, setLogoUrl] = React.useState<string>("");
  const [primaryColor, setPrimaryColor] = React.useState<string>("#1e3a8a"); // Default Navy
  const [secondaryColor, setSecondaryColor] = React.useState<string>("#d97706"); // Default Gold
  const [accentColor, setAccentColor] = React.useState<string>("#2563eb");
  const [tagline, setTagline] = React.useState<string>("");

  React.useEffect(() => {
    params.then((p) => {
      setSlug(p.slug);
      loadTenantData(p.slug);
    });
  }, [params]);

  const loadTenantData = async (tenantSlug: string) => {
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
  };

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
      setSuccessMsg("Organization verification approved successfully! Your institution is now officially verified.");
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
      setSuccessMsg("Organization profile and branding successfully updated.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organization Settings & Branding</h1>
        <p className="text-xs text-muted-foreground">
          Configure your institutional identity, verified credentials domain, and custom certificate theme.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/50 dark:text-red-300 dark:border-red-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Institutional Profile */}
        <Card className="border shadow-xs">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Building className="h-4 w-4 text-primary" />
              <span>Institutional Identity</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Official public metadata associated with this credential issuer.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium" htmlFor="name">
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
                <label className="text-xs font-medium" htmlFor="legalEntityName">
                  Legal Entity Name
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
              <label className="text-xs font-medium" htmlFor="websiteUrl">
                Official Website URL
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

            {/* Read-Only W3C DID & Verification Status */}
            <div className="border-t pt-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Cryptographic W3C DID Identifier (Immutable)
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={tenant?.didUri || ""}
                    className="font-mono text-[11px] bg-muted/50 select-all"
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
                <p className="text-[10px] text-muted-foreground">
                  Resolves via W3C <code className="font-mono">did:web</code> to your institutional public verification keys.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-muted/30 rounded-lg border gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                  <div>
                    <span className="text-xs font-medium block">Institution Verification Status</span>
                    <span className="text-[10px] text-muted-foreground block">
                      {tenant?.verificationStatus === "VERIFIED"
                        ? "Institutional identity has been approved and verified for trusted credential issuance."
                        : "Institutional identity is currently pending administrative verification approval."}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
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
                  {tenant?.verificationStatus !== "VERIFIED" && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleApproveOrganization}
                      disabled={approving}
                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      <span>{approving ? "Approving..." : "Approve & Verify"}</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Branding & Visual Identity */}
        <Card className="border shadow-xs">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <span>Certificate Branding & Customization</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Configure brand colors and visual assets rendered on issued certificates and verification pages.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium" htmlFor="primaryColor">
                  Primary Brand Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="primaryColorPicker"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-8 w-8 rounded border cursor-pointer p-0.5"
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
                <label className="text-xs font-medium" htmlFor="secondaryColor">
                  Secondary (Gold) Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="secondaryColorPicker"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="h-8 w-8 rounded border cursor-pointer p-0.5"
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
                <label className="text-xs font-medium" htmlFor="accentColor">
                  Accent Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="accentColorPicker"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-8 w-8 rounded border cursor-pointer p-0.5"
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
              <label className="text-xs font-medium" htmlFor="tagline">
                Institutional Motto / Tagline
              </label>
              <Input
                id="tagline"
                placeholder="e.g. Mens et Manus (Mind and Hand)"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium" htmlFor="logoUrl">
                Official Logo URL
              </label>
              <div className="relative">
                <ImageIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="logoUrl"
                  type="url"
                  placeholder="https://institution.edu/assets/logo.png"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="pl-9 text-xs"
                />
              </div>
            </div>

            {/* Live Certificate Preview Swatch */}
            <div className="border rounded-xl p-4 bg-muted/20 space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                Brand Palette Live Preview
              </span>
              <div
                className="p-6 rounded-lg border shadow-xs transition-colors"
                style={{
                  backgroundColor: "#ffffff",
                  borderColor: primaryColor,
                  borderWidth: "2px",
                }}
              >
                <div className="flex items-center justify-between border-b pb-3 mb-3">
                  <div className="font-bold text-sm" style={{ color: primaryColor }}>
                    {name || "Institution Name"}
                  </div>
                  <div
                    className="text-[10px] px-2 py-0.5 rounded font-mono font-bold"
                    style={{ backgroundColor: secondaryColor, color: "#ffffff" }}
                  >
                    VERIFIED ISSUER
                  </div>
                </div>
                <div className="text-center py-4 space-y-1">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">
                    Certificate of Achievement
                  </div>
                  <div className="text-lg font-bold" style={{ color: primaryColor }}>
                    Jane Doe, B.Sc.
                  </div>
                  <div className="text-xs italic text-muted-foreground">
                    {tagline || "For excellence in cryptographic engineering"}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex items-center justify-end p-5 border-t bg-muted/10">
            <Button type="submit" size="sm" className="gap-2" disabled={saving}>
              <Save className="h-4 w-4" />
              <span>{saving ? "Saving Changes..." : "Save Settings & Branding"}</span>
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
