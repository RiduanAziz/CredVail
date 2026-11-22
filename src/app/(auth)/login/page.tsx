"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Shield, Lock, Mail, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Invalid credentials");
      }

      // Check user memberships to route appropriately
      const memberships = data.data?.memberships || [];
      if (memberships.length > 0) {
        router.push(`/${memberships[0].tenant.slug}`);
      } else {
        router.push("/onboarding");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell relative flex items-center justify-center overflow-hidden px-4 py-16 sm:px-6">
      <div className="surface-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative w-full max-w-md space-y-7">
        <div className="flex flex-col items-center text-center space-y-2">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-2xl tracking-tight mb-2 group">
            <Image
              src="/brand/brand-symbol-128.png"
              alt="CREDVAIL"
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl shadow-sm object-contain transition-transform group-hover:scale-105"
              priority
            />
            <span>CRED<span className="bg-brand-gradient bg-clip-text text-transparent font-black">VAIL</span></span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Institutional Portal Sign In</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to access your tenant credential dashboard and signing keys.
          </p>
        </div>

        <Card className="glass-surface overflow-hidden rounded-2xl shadow-xl">
          <form onSubmit={handleSubmit}>
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-lg">Authentication</CardTitle>
              <CardDescription>
                Protected by Argon2id cryptographic password hashing and RBAC.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md dark:bg-red-950/50 dark:text-red-300 dark:border-red-800">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground" htmlFor="email">
                  Institutional Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="registrar@university.edu"
                    className="pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground" htmlFor="password">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••••••"
                    className="pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 pt-2">
              <Button type="submit" variant="brand" className="w-full gap-2" disabled={loading}>
                {loading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <div className="text-center text-xs text-muted-foreground">
                Need to register an institution?{" "}
                <Link href="/register" className="text-primary hover:underline font-medium">
                  Create an account
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
