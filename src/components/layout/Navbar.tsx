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
  const publicRoute = ["/", "/login", "/register", "/verify", "/wallet", "/claim"].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  const closeMenu = () => setMenuOpen(false);

  if (!publicRoute) return null;

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b backdrop-blur-md transition-colors ${
        isHome
          ? "border-black/8 bg-[#F4F4F6]/85 text-[#0C0D12]"
          : "bg-background/85"
      }`}
    >
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-xl tracking-tight group">
            <Image
              src="/brand/brand-symbol-64.png"
              alt="CREDVAIL Brand Symbol"
              width={34}
              height={34}
              className="h-8.5 w-8.5 rounded-lg shadow-sm object-contain transition-transform group-hover:scale-105"
              priority
            />
            <span className={isHome ? "text-[#0F1D38]" : undefined}>
              CRED<span className="bg-brand-gradient bg-clip-text text-transparent font-black">VAIL</span>
            </span>
          </Link>
          <nav
            className={`hidden md:flex items-center gap-6 text-sm font-medium ${
              isHome ? "text-[#4B5563]" : "text-muted-foreground"
            }`}
          >
            <Link
              href="#platform"
              className={`transition-colors ${
                isHome ? "hover:text-[#0C0D12]" : "hover:text-foreground"
              }`}
            >
              Platform
            </Link>
            <Link
              href="#lifecycle"
              className={`transition-colors ${
                isHome ? "hover:text-[#0C0D12]" : "hover:text-foreground"
              }`}
            >
              Lifecycle
            </Link>
            <Link
              href="/verify"
              className={`flex items-center gap-1.5 transition-colors ${
                isHome ? "hover:text-[#0C0D12]" : "hover:text-foreground"
              }`}
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Public Verifier
            </Link>
            <Link
              href="/wallet"
              className={`transition-colors ${
                isHome ? "hover:text-[#0C0D12]" : "hover:text-foreground"
              }`}
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
              className={`hidden sm:inline-flex ${
                isHome ? "text-[#0C0D12] hover:bg-black/5 font-semibold" : ""
              }`}
            >
              Sign In
            </Button>
          </Link>
          <Link href="/register">
            <Button
              size="sm"
              className="gap-1.5 rounded-xl bg-[#0F1D38] px-4 text-xs font-semibold text-white shadow-sm hover:bg-[#152445]"
            >
              <span>Institution Portal</span>
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
