"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldAlert,
  CheckCircle2,
  Ban,
  RefreshCw,
  LogOut,
  LogIn,
  Activity,
  Building2,
  ExternalLink,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface AdminTenantItem {
  id: string;
  slug: string;
  name: string;
  legalEntityName: string;
  verificationStatus: string;
  planTier: string;
  monthlyIssuedCount: number;
  monthlyCredentialLimit: number;
}

export default function PlatformAdminPage() {
  const router = useRouter();
  const [tenants, setTenants] = React.useState<AdminTenantItem[]>([]);
  const [health, setHealth] = React.useState<any>(null);
  const [me, setMe] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [orgName, setOrgName] = React.useState("");
  const [legalName, setLegalName] = React.useState("");
  const [websiteUrl, setWebsiteUrl] = React.useState("https://example.edu");
  const [creating, setCreating] = React.useState(false);

  const loadConsoleData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meRes, tenantsRes, healthRes] = await Promise.all([
        fetch("/api/v1/auth/me"),
        fetch("/api/v1/admin/tenants"),
        fetch("/api/v1/health"),
      ]);

      if (meRes.ok) {
        const meJson = await meRes.json();
        setMe(meJson.data || null);
      } else {
        setMe(null);
      }

      if (healthRes.ok) {
        setHealth(await healthRes.json());
      }

      const tenantsJson = await tenantsRes.json();
      if (!tenantsRes.ok) {
        throw new Error(tenantsJson.error?.message || "SUPER_ADMIN authentication required");
      }
      setTenants(tenantsJson.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadConsoleData();
  }, [loadConsoleData]);

  const updateStatus = async (tenantId: string, verificationStatus: string) => {
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, verificationStatus }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Status update failed");
      }
      setNotice(`Updated institution status to ${verificationStatus}.`);
      await loadConsoleData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: orgName,
          legalEntityName: legalName || orgName,
          websiteUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to register institution");
      }
      setOrgName("");
      setLegalName("");
      setNotice(`Registered institution '${json.data?.name}'.`);
      await loadConsoleData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <div className="page-shell relative overflow-hidden">
      <div className="surface-grid pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-6xl space-y-6 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-4 border-b border-black/[0.08] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-md border border-black/[0.08] bg-white px-3 py-1 text-xs font-medium text-[#475569]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0F1D38]" />
              <span>Platform Governance</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.025em] text-[#0F172A]">
              Super Admin Console{" "}
              <span className="text-[#64748B] font-normal">across tenants</span>
            </h1>
            <p className="text-sm text-[#475569]">
              Oversee institutional verification status, SaaS quota tiers, and cryptographic readiness.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {me && (
              <Badge variant="outline" className="px-3 py-1 font-mono text-xs">
                {me.email} ({me.platformRole})
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={loadConsoleData} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            {me ? (
              <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1.5">
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </Button>
            ) : (
              <Link href="/login">
                <Button size="sm" className="gap-1.5">
                  <LogIn className="h-3.5 w-3.5" />
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>

      {error && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Link href="/login" className="text-xs font-medium underline">
            Go to Sign In
          </Link>
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {health && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              System Readiness Overview
              <Badge variant={health.status === "ok" ? "default" : "destructive"}>
                {String(health.status).toUpperCase()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-xs sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">KMS & Session Config</div>
              <div className="mt-1 font-medium">
                KMS: {health.checks?.kmsMasterKeyConfigured ? "Valid" : "Missing"} • Session:{" "}
                {health.checks?.sessionSecretValid ? "Valid" : "Invalid"}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">Persistence Mode</div>
              <div className="mt-1 font-medium">
                DB Reachable: {health.checks?.databaseReachable ? "PostgreSQL Connected" : "Local Dev Fallback"}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">Blockchain & Privacy Gate</div>
              <div className="mt-1 font-medium">
                Sepolia: {health.checks?.blockchainSimulationMode ? "Simulation" : "Live RPC"} • SD Gate: Fail-Closed
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {me?.platformRole === "SUPER_ADMIN" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" />
              Register Institution
            </CardTitle>
            <CardDescription>Create a multi-tenant institutional issuer workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTenant} className="grid gap-3 sm:grid-cols-4">
              <Input
                placeholder="Institution Name (e.g. Oxford Demo)"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />
              <Input
                placeholder="Legal Entity Name"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
              />
              <Input
                type="url"
                placeholder="https://institution.edu"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                required
              />
              <Button type="submit" variant="brand" disabled={creating} className="gap-1.5">
                <Plus className="h-4 w-4" />
                {creating ? "Creating..." : "Create Tenant"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Registered Institutions</CardTitle>
          <CardDescription>Approve, suspend, or open tenant workspaces and SaaS quota controls.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading platform tenants...</p>
          ) : tenants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No registered institutions returned yet.</p>
          ) : (
            tenants.map((t) => (
              <div
                key={t.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{t.name}</span>
                    <Badge variant="outline">{t.verificationStatus}</Badge>
                    <Badge variant="secondary">{t.planTier}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    slug: {t.slug} • usage: {t.monthlyIssuedCount}/{t.monthlyCredentialLimit}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/${t.slug}`}>
                    <Button size="sm" variant="ghost" className="gap-1">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Dashboard
                    </Button>
                  </Link>
                  <Link href={`/${t.slug}/billing`}>
                    <Button size="sm" variant="ghost">
                      Billing
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus(t.id, "VERIFIED")}
                    className="gap-1"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus(t.id, "SUSPENDED")}
                    className="gap-1"
                  >
                    <Ban className="h-3.5 w-3.5 text-red-600" />
                    Suspend
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
