"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = React.useState<string | null>(null);
  const [resending, setResending] = React.useState(false);
  const [resendMessage, setResendMessage] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);
    setUnverifiedEmail(null);
    setResendMessage(null);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error?.code === "EMAIL_NOT_VERIFIED") {
          setUnverifiedEmail(data.error?.email || email.trim().toLowerCase());
        }
        throw new Error(data.error?.message || "Invalid credentials");
      }

      const redirectPath = data.data?.redirectPath;
      if (typeof redirectPath === "string" && redirectPath.startsWith("/")) {
        router.push(redirectPath);
        return;
      }

      const memberships = data.data?.memberships || [];
      if (data.data?.platformRole === "SUPER_ADMIN") {
        router.push("/admin");
      } else if (memberships.length > 0) {
        router.push(`/${memberships[0].tenant.slug}`);
      } else {
        router.push("/wallet");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const targetEmail = unverifiedEmail || email.trim().toLowerCase();
    if (!targetEmail || resending) return;
    setResending(true);
    setResendMessage(null);
    try {
      const res = await fetch("/api/v1/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const json = await res.json();
      setResendMessage(json.data?.message || "Verification link resent.");
    } catch (err: any) {
      setResendMessage(err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="page-shell relative flex items-center justify-center overflow-hidden px-4 py-16 sm:px-6">
      <div className="surface-grid pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-md border border-black/[0.08] bg-white px-3 py-1 text-xs font-medium text-[#475569]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0F1D38]" />
            <span>Unified Identity Access</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.025em] text-[#0F172A]">
            Portal Sign In{" "}
            <span className="text-[#64748B] font-normal">to CREDVAIL</span>
          </h1>
          <p className="text-sm text-[#475569] max-w-sm">
            Sign in to your institutional credential workspace or personal holder wallet.
          </p>
        </div>

        <Card className="overflow-hidden rounded-xl border border-black/[0.08] bg-white shadow-sm">
          <form onSubmit={handleSubmit}>
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-lg">Authentication</CardTitle>
              <CardDescription>
                Protected by Argon2id hashing, rate limiting, and verified-email sessions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                  {unverifiedEmail && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-red-200">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs bg-white"
                        onClick={handleResendVerification}
                        disabled={resending}
                      >
                        {resending ? "Sending..." : "Resend Verification Email"}
                      </Button>
                      <Link
                        href={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`}
                        className="text-xs font-medium underline"
                      >
                        Open Verification Page
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {resendMessage && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{resendMessage}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#0F172A]" htmlFor="email">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
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
                  <label className="text-xs font-medium text-[#0F172A]" htmlFor="password">
                    Password
                  </label>
                  <Link href="/forgot-password" className="text-xs text-[#0F1D38] hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your passphrase"
                    className="pl-9 pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-2 rounded p-1 text-[#64748B] hover:text-[#0F172A]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 pt-2">
              <Button type="submit" className="w-full h-11 gap-2" disabled={loading}>
                {loading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <div className="text-center text-xs text-[#475569]">
                New to CREDVAIL?{" "}
                <Link href="/register" className="text-[#0F1D38] hover:underline font-medium">
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
