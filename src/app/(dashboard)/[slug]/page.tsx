"use client";

import * as React from "react";
import Link from "next/link";
import {
  Award,
  FileSpreadsheet,
  Users,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Plus,
  KeyRound,
  ExternalLink,
  CheckCircle2,
  Activity,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TenantAnalyticsOverview } from "@/types";
import { TenantRecord } from "@/lib/repositories/tenant-repository";

export default function TenantOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [slug, setSlug] = React.useState<string>("");
  const [tenant, setTenant] = React.useState<TenantRecord | null>(null);
  const [analytics, setAnalytics] = React.useState<TenantAnalyticsOverview | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    params.then((p) => {
      setSlug(p.slug);
      loadDashboardData(p.slug);
    });
  }, [params]);

  const loadDashboardData = async (tenantSlug: string) => {
    try {
      setLoading(true);
      setError(null);

      const [tenantRes, analyticsRes] = await Promise.all([
        fetch(`/api/v1/tenants/${tenantSlug}`),
        fetch(`/api/v1/tenants/${tenantSlug}/analytics/overview`),
      ]);

      if (!tenantRes.ok) throw new Error("Failed to load organization metadata");
      const tenantData = await tenantRes.json();
      setTenant(tenantData.data);

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData.data);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 bg-muted/50 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-muted/40 rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-muted/30 rounded-xl" />
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="p-8 text-center bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl">
        <AlertTriangle className="h-10 w-10 text-red-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-red-900 dark:text-red-200 mb-1">
          Dashboard Unavailable
        </h2>
        <p className="text-xs text-red-700 dark:text-red-400 mb-4">{error}</p>
        <Button size="sm" variant="outline" onClick={() => loadDashboardData(slug)}>
          Retry
        </Button>
      </div>
    );
  }

  const activePercent =
    analytics && analytics.totalCredentials > 0
      ? Math.round((analytics.activeCredentials / analytics.totalCredentials) * 100)
      : 100;

  return (
    <div className="space-y-8">
      {/* Institution Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-card to-muted/30 border rounded-2xl shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {tenant.name}
            </h1>
            <Badge
              variant={
                tenant.verificationStatus === "VERIFIED"
                  ? "verified"
                  : tenant.verificationStatus === "PENDING"
                  ? "warning"
                  : "outline"
              }
            >
              {tenant.verificationStatus}
            </Badge>
            {tenant.verificationStatus !== "VERIFIED" && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-500/20 gap-1 px-2"
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/v1/tenants/${slug}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ verificationStatus: "VERIFIED" }),
                    });
                    const d = await res.json();
                    if (res.ok) setTenant(d.data);
                  } catch {}
                }}
              >
                <CheckCircle2 className="h-3 w-3" />
                <span>Approve Organization</span>
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Legal Entity: <span className="text-foreground font-medium">{tenant.legalEntityName}</span>
            {" • "}
            Website:{" "}
            <a
              href={tenant.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-0.5"
            >
              {tenant.websiteUrl}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/${slug}/members`}>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              <span>Team ({analytics?.totalMembers || 1})</span>
            </Button>
          </Link>
          <Link href={`/${slug}/settings`}>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <span>Edit Branding</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* 6 Key Analytics Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="border shadow-xs hover:border-primary/50 transition-colors">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-[11px] font-medium flex items-center justify-between">
              <span>Total Issued</span>
              <Award className="h-3.5 w-3.5 text-primary" />
            </CardDescription>
            <CardTitle className="text-2xl font-black font-mono">
              {analytics?.totalCredentials || 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-[10px] text-muted-foreground">Lifetime credentials</p>
          </CardContent>
        </Card>

        <Card className="border shadow-xs hover:border-emerald-500/50 transition-colors">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-[11px] font-medium flex items-center justify-between">
              <span>Active Current</span>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
              {analytics?.activeCredentials || 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-[10px] text-muted-foreground">{activePercent}% active rate</p>
          </CardContent>
        </Card>

        <Card className="border shadow-xs hover:border-red-500/50 transition-colors">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-[11px] font-medium flex items-center justify-between">
              <span>Revoked</span>
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-black font-mono text-red-600 dark:text-red-400">
              {analytics?.revokedCredentials || 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-[10px] text-muted-foreground">W3C Bitstring flipped</p>
          </CardContent>
        </Card>

        <Card className="border shadow-xs hover:border-primary/50 transition-colors">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-[11px] font-medium flex items-center justify-between">
              <span>Total Batches</span>
              <Layers className="h-3.5 w-3.5 text-primary" />
            </CardDescription>
            <CardTitle className="text-2xl font-black font-mono">
              {analytics?.totalBatches || 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-[10px] text-muted-foreground">
              {analytics?.anchoredBatches || 0} anchored on-chain
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-xs hover:border-primary/50 transition-colors">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-[11px] font-medium flex items-center justify-between">
              <span>Templates</span>
              <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
            </CardDescription>
            <CardTitle className="text-2xl font-black font-mono">
              {analytics?.totalTemplates || 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-[10px] text-muted-foreground">Ready for issuance</p>
          </CardContent>
        </Card>

        <Card className="border shadow-xs hover:border-primary/50 transition-colors">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-[11px] font-medium flex items-center justify-between">
              <span>Team Staff</span>
              <Users className="h-3.5 w-3.5 text-primary" />
            </CardDescription>
            <CardTitle className="text-2xl font-black font-mono">
              {analytics?.totalMembers || 1}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-[10px] text-muted-foreground">RBAC authorized</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Action Cards */}
      <div>
        <h2 className="text-base font-bold tracking-tight mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span>Institutional Workflow Actions</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href={`/${slug}/templates`} className="group">
            <Card className="border h-full hover:border-primary hover:shadow-md transition-all">
              <CardHeader className="p-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span>Design Template</span>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </CardTitle>
                <CardDescription className="text-xs">
                  Create vector templates with placeholders and dynamic QR codes.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href={`/${slug}/certificates`} className="group">
            <Card className="border h-full hover:border-primary hover:shadow-md transition-all">
              <CardHeader className="p-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Award className="h-5 w-5" />
                </div>
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span>Bulk Certificate Issuance</span>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </CardTitle>
                <CardDescription className="text-xs">
                  Upload CSV/XLSX recipient lists to generate PDFs and anchor Merkle roots.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href={`/${slug}/members`} className="group">
            <Card className="border h-full hover:border-primary hover:shadow-md transition-all">
              <CardHeader className="p-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Users className="h-5 w-5" />
                </div>
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span>Manage Team</span>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </CardTitle>
                <CardDescription className="text-xs">
                  Invite registrars, certificate issuers, and designers with RBAC roles.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href={`/${slug}/keys`} className="group">
            <Card className="border h-full hover:border-primary hover:shadow-md transition-all">
              <CardHeader className="p-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <KeyRound className="h-5 w-5" />
                </div>
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span>Cryptographic Keys</span>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </CardTitle>
                <CardDescription className="text-xs">
                  Manage ECDSA signing epochs and on-chain Sepolia registry status.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>

      {/* Recent Activity / Audit Log Table */}
      <Card className="border shadow-xs">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold">Recent Institutional Activity</CardTitle>
              <CardDescription className="text-xs">
                Cryptographically tracked operational and governance events.
              </CardDescription>
            </div>
            <Link href={`/${slug}/audit-logs`}>
              <Button variant="ghost" size="sm" className="text-xs text-primary">
                View Full Audit Trail
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {analytics?.recentActivity && analytics.recentActivity.length > 0 ? (
            <div className="divide-y text-xs">
              {analytics.recentActivity.map((act) => (
                <div key={act.id} className="py-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {act.action}
                      </Badge>
                      <span className="font-medium text-foreground">{act.description}</span>
                    </div>
                    {act.userEmail && (
                      <p className="text-[10px] text-muted-foreground">Initiated by {act.userEmail}</p>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {new Date(act.timestamp).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No recorded activity yet. Actions such as inviting members, creating templates, or issuing certificates will appear here.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
