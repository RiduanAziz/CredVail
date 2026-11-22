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
    <header className={`sticky top-0 z-50 w-full border-b backdrop-blur-md ${
      isHome ? "border-white/10 bg-brand-navy/85 text-white" : "bg-background/85"
    }`}>
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-xl tracking-tight group">
            <Image
              src="/brand/brand-symbol-64.png"
              alt="CREDVAIL Brand Symbol"
              width={36}
              height={36}
              className="h-9 w-9 rounded-lg shadow-sm object-contain transition-transform group-hover:scale-105"
              priority
            />
            <span className={isHome ? "text-white" : undefined}>CRED<span className="bg-brand-gradient bg-clip-text text-transparent font-black">VAIL</span></span>
          </Link>
          <nav className={`hidden md:flex items-center gap-6 text-sm font-medium ${
            isHome ? "text-blue-100/65" : "text-muted-foreground"
          }`}>
            <Link href="#platform" className={`transition-colors ${isHome ? "hover:text-white" : "hover:text-foreground"}`}>
              Platform
            </Link>
            <Link href="#how-it-works" className={`transition-colors ${isHome ? "hover:text-white" : "hover:text-foreground"}`}>
              How it works
            </Link>
            <Link href="/verify" className={`flex items-center gap-1.5 transition-colors ${isHome ? "hover:text-white" : "hover:text-foreground"}`}>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Public Verifier
            </Link>
            <Link href="#trust" className={`transition-colors ${isHome ? "hover:text-white" : "hover:text-foreground"}`}>
              Trust model
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm" className={`hidden sm:inline-flex ${isHome ? "text-blue-100/75 hover:bg-white/10 hover:text-white" : ""}`}>
              Sign In
            </Button>
          </Link>
          <Link href="/register">
            <Button variant="brand" size="sm" className="gap-1.5 shadow-sm">
              <span>Institution Portal</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Button
            variant={isHome ? "brandOutline" : "outline"}
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
        <nav className={`border-t px-4 py-3 md:hidden ${isHome ? "border-white/10 bg-brand-navy" : "bg-background"}`} aria-label="Mobile navigation">
          <div className="container mx-auto flex max-w-7xl flex-col gap-1">
            <Link href="#platform" onClick={closeMenu} className={`rounded-md px-3 py-3 text-sm font-medium ${isHome ? "text-blue-100/70 hover:bg-white/10 hover:text-white" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>Platform</Link>
            <Link href="#how-it-works" onClick={closeMenu} className={`rounded-md px-3 py-3 text-sm font-medium ${isHome ? "text-blue-100/70 hover:bg-white/10 hover:text-white" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>How it works</Link>
            <Link href="/verify" onClick={closeMenu} className={`flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium ${isHome ? "text-blue-100/70 hover:bg-white/10 hover:text-white" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}><CheckCircle2 className="h-4 w-4 text-emerald-500" />Public verifier</Link>
            <Link href="#trust" onClick={closeMenu} className={`rounded-md px-3 py-3 text-sm font-medium ${isHome ? "text-blue-100/70 hover:bg-white/10 hover:text-white" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>Trust model</Link>
          </div>
        </nav>
      )}
    </header>
  );
}
