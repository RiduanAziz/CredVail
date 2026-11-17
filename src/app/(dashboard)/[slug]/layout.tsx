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
  ];

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between border-b bg-background px-4 py-3">
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
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`w-full md:w-64 border-r bg-background shrink-0 flex flex-col justify-between ${
          mobileMenuOpen ? "block" : "hidden md:flex"
        }`}
      >
        <div className="flex flex-col">
          {/* Institution Header */}
          <div className="p-4 border-b">
            <Link href="/" className="flex items-center gap-2.5 font-bold mb-4 group">
              <Image
                src="/brand/brand-symbol-64.png"
                alt="CREDVAIL"
                width={36}
                height={36}
                className="h-9 w-9 rounded-xl shadow-sm object-contain transition-transform group-hover:scale-105"
              />
              <div className="flex flex-col leading-none">
                <span className="font-extrabold tracking-tight text-base">
                  CRED<span className="bg-brand-gradient bg-clip-text text-transparent font-black">VAIL</span>
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">
                  Trust Network
                </span>
              </div>
            </Link>

            <div className="bg-muted/40 rounded-lg p-2.5 border">
              <div className="flex items-center gap-2 mb-1">
                <Building className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-semibold truncate text-foreground">
                  {tenantName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-mono">
                  /{slug}
                </span>
                <Badge variant="outline" className="text-[9px] py-0 px-1.5 font-mono">
                  {userRole}
                </Badge>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
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
                  className={`flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-brand-gradient text-white shadow-sm font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
        <div className="p-3 border-t bg-muted/10 space-y-2">
          {didUri && (
            <div className="p-2 bg-muted/40 rounded border text-[10px] font-mono text-muted-foreground truncate" title={didUri}>
              <span className="text-primary font-semibold">DID: </span>
              {didUri}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <div className="flex flex-col min-w-0 pr-2">
              <span className="text-xs font-medium truncate text-foreground">
                {userEmail || "Signed In User"}
              </span>
              <span className="text-[10px] text-muted-foreground">Active Session</span>
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
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="h-14 border-b bg-background flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Institutions</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">{tenantName}</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              target="_blank"
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
            >
              <span>Public Verification</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </header>

        <div className="p-6 md:p-8 flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
