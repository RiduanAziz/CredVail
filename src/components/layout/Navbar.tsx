import Link from "next/link";
import { Shield, CheckCircle2, Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-xl tracking-tight">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Shield className="h-5 w-5" />
            </div>
            <span>CRED<span className="text-primary font-black">VAIL</span></span>
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
            <Button size="sm" className="gap-1.5 shadow-sm">
              <span>Institution Portal</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
