"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Shield,
  LayoutDashboard,
  Users,
  Settings,
  Award,
  FileSpreadsheet,
  Upload,
  KeyRound,
  History,
  CreditCard,
  LogOut,
  ChevronRight,
  Building,
  ExternalLink,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const [slug, setSlug] = React.useState<string>("");
  const [tenantName, setTenantName] = React.useState<string>("Institutional Dashboard");
  const [didUri, setDidUri] = React.useState<string>("");
  const [userRole, setUserRole] = React.useState<string>("STAFF");
  const [userEmail, setUserEmail] = React.useState<string>("");
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const pathname = usePathname();
  const router = useRouter();

  React.useEffect(() => {
    params.then((p) => {
      setSlug(p.slug);
      fetchTenantDetails(p.slug);
    });
  }, [params]);

  const fetchTenantDetails = async (tenantSlug: string) => {
    try {
      const res = await fetch(`/api/v1/tenants/${tenantSlug}`);
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          setTenantName(data.data.name);
          setDidUri(data.data.didUri);
        }
      }

      const meRes = await fetch("/api/v1/auth/me");
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.data) {
          setUserEmail(meData.data.email);
          const membership = meData.data.memberships?.find(
            (m: any) => m.tenant.slug === tenantSlug
          );
          if (membership) {
            setUserRole(membership.role);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load tenant context:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
      router.push("/login");
    } catch {
      router.push("/login");
    }
  };

  const navItems = [
    {
      title: "Overview",
      href: `/${slug}`,
      icon: LayoutDashboard,
      exact: true,
    },
    {
      title: "Team Members",
      href: `/${slug}/members`,
      icon: Users,
    },
    {
      title: "Settings & Branding",
      href: `/${slug}/settings`,
      icon: Settings,
    },
    {
      title: "Templates",
      href: `/${slug}/templates`,
      icon: FileSpreadsheet,
    },
    {
      title: "Batches & Ingestion",
      href: `/${slug}/batches`,
      icon: Upload,
    },
    {
      title: "Certificates",
      href: `/${slug}/certificates`,
      icon: Award,
      badge: "Phase 6",
    },
    {
      title: "Signing Keys & Trust",
      href: `/${slug}/keys`,
      icon: KeyRound,
      badge: "Phase 7",
    },
    {
      title: "Audit Trail",
      href: `/${slug}/audit-logs`,
      icon: History,
    },
    {
      title: "Billing & Quotas",
      href: `/${slug}/billing`,
      icon: CreditCard,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between border-b border-white/10 bg-[#0A1224] px-4 py-3 text-white">
        <Link href={`/${slug}`} className="flex items-center gap-2 font-bold">
          <Image
            src="/brand/brand-symbol-64.png"
            alt="CREDVAIL"
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg object-contain"
          />
          <span className="text-sm font-bold tracking-tight">CREDVAIL</span>
        </Link>
        <Button
          variant="outline"
          size="sm"
          className="border-white/20 bg-white/5 text-white hover:bg-white/10"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`w-full md:w-72 border-r border-white/10 bg-[#0A1224] shrink-0 flex flex-col justify-between text-white ${
          mobileMenuOpen ? "block" : "hidden md:flex"
        }`}
      >
        <div className="flex flex-col">
          {/* Institution Header */}
          <div className="p-5 border-b border-white/10">
            <Link href="/" className="flex items-center gap-2.5 font-bold mb-4 group">
              <Image
                src="/brand/brand-symbol-64.png"
                alt="CREDVAIL"
                width={36}
                height={36}
                className="h-9 w-9 rounded-lg object-contain transition-transform group-hover:scale-105"
              />
              <div className="flex flex-col leading-none">
                <span className="font-sans font-bold tracking-tight text-base text-white">
                  CREDVAIL
                </span>
                <span className="text-[10px] text-slate-400 uppercase tracking-[0.14em] font-mono mt-0.5">
                  Trust Network
                </span>
              </div>
            </Link>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center gap-2 mb-1">
                <Building className="h-4 w-4 text-slate-300 shrink-0" />
                <span className="text-xs font-semibold truncate text-white">
                  {tenantName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-mono">
                  /{slug}
                </span>
                <Badge variant="outline" className="text-[9px] py-0 px-1.5 font-mono border-white/20 bg-white/[0.06] text-slate-200">
                  {userRole}
                </Badge>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1 p-4">
            {navItems.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-white/[0.12] text-white border border-white/15 font-semibold"
                      : "text-slate-400 hover:bg-white/[0.06] hover:text-white border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </div>
                  {item.badge && !isActive && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1">
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Footer Profile & Logout */}
        <div className="space-y-2 border-t border-white/10 bg-black/10 p-4">
          {didUri && (
            <div className="truncate rounded border border-white/10 bg-white/5 p-2 font-mono text-[10px] text-blue-100/50" title={didUri}>
              <span className="font-semibold text-indigo-300">DID: </span>
              {didUri}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <div className="flex flex-col min-w-0 pr-2">
              <span className="text-xs font-medium truncate text-white">
                {userEmail || "Signed In User"}
              </span>
              <span className="text-[10px] text-blue-100/45">Active Session</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="relative flex-1 flex flex-col min-w-0 overflow-y-auto bg-[#F8FAFC]">
        <div className="surface-grid pointer-events-none absolute inset-0" />
        <header className="relative z-10 flex h-16 shrink-0 items-center justify-between border-b border-black/[0.08] bg-white/90 px-5 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-2 text-xs text-[#64748B]">
            <span>Institutions</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-[#0F172A] font-medium">{tenantName}</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/verify"
              target="_blank"
              className="text-xs text-[#475569] hover:text-[#0F1D38] font-medium flex items-center gap-1 transition-colors"
            >
              <span>Public Verification</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </header>

        <div className="relative z-10 flex-1 p-5 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
