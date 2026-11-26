"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { CheckCircle2, ArrowRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";
  const publicRoute = [
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/verify",
    "/wallet",
    "/claim",
    "/admin",
  ].some((route) => pathname === route || pathname.startsWith(`${route}/`));

  const closeMenu = () => setMenuOpen(false);

  if (!publicRoute) return null;

  return (
    <header
      className="sticky top-0 z-50 w-full border-b border-black/[0.08] bg-[#F8FAFC]/90 text-[#0F172A] backdrop-blur-md transition-colors"
    >
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
            <Image
              src="/brand/brand-symbol-64.png"
              alt="CREDVAIL Brand Symbol"
              width={32}
              height={32}
              className="h-8 w-8 rounded-md object-contain"
              priority
            />
            <span className="font-sans text-[#0F1D38] font-bold">
              CREDVAIL
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#475569]">
            <Link
              href={isHome ? "#platform" : "/#platform"}
              className="transition-colors hover:text-[#0F172A]"
            >
              Platform
            </Link>
            <Link
              href={isHome ? "#lifecycle" : "/#lifecycle"}
              className="transition-colors hover:text-[#0F172A]"
            >
              Lifecycle
            </Link>
            <Link
              href="/verify"
              className="flex items-center gap-1.5 transition-colors hover:text-[#0F172A]"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Public Verifier
            </Link>
            <Link
              href="/wallet"
              className="transition-colors hover:text-[#0F172A]"
            >
              Holder Wallet
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex text-[#0F172A] hover:bg-black/5 font-medium"
            >
              Sign In
            </Button>
          </Link>
          <Link href="/register">
            <Button
              size="sm"
              className="gap-1.5 rounded-lg bg-[#0F1D38] px-4 text-xs font-medium text-white shadow-none hover:bg-[#152445] transition-colors"
            >
              <span>Institution portal</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Button
            variant="outline"
            size="icon"
            className="md:hidden"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {menuOpen && (
        <nav
          className={`border-t px-4 py-3 md:hidden ${
            isHome ? "border-black/8 bg-[#F4F4F6]" : "bg-background"
          }`}
          aria-label="Mobile navigation"
        >
          <div className="container mx-auto flex max-w-7xl flex-col gap-1">
            <Link
              href="#platform"
              onClick={closeMenu}
              className={`rounded-md px-3 py-3 text-sm font-medium ${
                isHome
                  ? "text-[#4B5563] hover:bg-black/5 hover:text-[#0C0D12]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              Platform
            </Link>
            <Link
              href="#lifecycle"
              onClick={closeMenu}
              className={`rounded-md px-3 py-3 text-sm font-medium ${
                isHome
                  ? "text-[#4B5563] hover:bg-black/5 hover:text-[#0C0D12]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              Lifecycle
            </Link>
            <Link
              href="/verify"
              onClick={closeMenu}
              className={`flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium ${
                isHome
                  ? "text-[#4B5563] hover:bg-black/5 hover:text-[#0C0D12]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Public Verifier
            </Link>
            <Link
              href="/wallet"
              onClick={closeMenu}
              className={`rounded-md px-3 py-3 text-sm font-medium ${
                isHome
                  ? "text-[#4B5563] hover:bg-black/5 hover:text-[#0C0D12]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              Holder Wallet
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
