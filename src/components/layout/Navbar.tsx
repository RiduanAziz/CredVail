import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
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
            <span>CRED<span className="bg-brand-gradient bg-clip-text text-transparent font-black">VAIL</span></span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link href="#architecture" className="hover:text-foreground transition-colors">
              Architecture
            </Link>
            <Link href="#features" className="hover:text-foreground transition-colors">
              Capabilities
            </Link>
            <Link href="#verify" className="hover:text-foreground transition-colors flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Public Verifier
            </Link>
            <Link href="#docs" className="hover:text-foreground transition-colors">
              Thesis Docs
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
              Sign In
            </Button>
          </Link>
          <Link href="/register">
            <Button variant="brand" size="sm" className="gap-1.5 shadow-sm">
              <span>Institution Portal</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
