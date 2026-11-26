"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, AlertCircle, Mail, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BrowserWalletEngine } from "@/lib/wallet/browser-wallet";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";
  const initialEmail = searchParams.get("email") || "";

  const [status, setStatus] = React.useState<"idle" | "verifying" | "verified" | "error">(
    token ? "verifying" : "idle"
  );
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [redirectPath, setRedirectPath] = React.useState<string>("/wallet");

  const [resendEmail, setResendEmail] = React.useState(initialEmail);
  const [resending, setResending] = React.useState(false);
  const [resendResult, setResendResult] = React.useState<{
    message: string;
    devPreviewUrl?: string;
  } | null>(null);

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function runVerification() {
      setStatus("verifying");
      setErrorMessage(null);
      try {
        const res = await fetch("/api/v1/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error?.message || "Verification link is invalid or expired.");
        }

        const nextPath = json.data?.redirectPath || "/wallet";
        if (!cancelled) {
          setRedirectPath(nextPath);
          setStatus("verified");

          if (nextPath === "/wallet") {
            try {
              await BrowserWalletEngine.getOrCreateBrowserIdentity();
            } catch {
              // Ignore if IndexedDB restricted
            }
          }

          setTimeout(() => {
            if (!cancelled) router.push(nextPath);
          }, 900);
        }
      } catch (err: any) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(err.message || "Email verification failed.");
        }
      }
    }

    runVerification();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resending || !resendEmail.trim()) return;
    setResending(true);
    setResendResult(null);
    try {
      const res = await fetch("/api/v1/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Unable to resend verification link.");
      }
      setResendResult({
        message: json.data?.message || "If eligible, a fresh verification link has been sent.",
        devPreviewUrl: json.data?.devPreviewUrl,
      });
    } catch (err: any) {
      setResendResult({ message: err.message });
    } finally {
      setResending(false);
    }
  };

  return (
    <Card className="rounded-xl border border-black/[0.08] bg-white shadow-sm">
      <CardHeader>
        <div className="inline-flex w-fit items-center gap-2 rounded-md border border-black/[0.08] bg-slate-50 px-2.5 py-1 text-xs font-medium text-[#475569] mb-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#0F1D38]" />
          <span>Email Verification</span>
        </div>
        <CardTitle className="text-xl text-[#0F172A]">
          {status === "verifying"
            ? "Verifying your email..."
            : status === "verified"
            ? "Email Verified & Session Active"
            : status === "error"
            ? "Verification Link Unavailable"
            : "Verify Your CREDVAIL Account"}
        </CardTitle>
        <CardDescription>
          {status === "verifying"
            ? "Validating your cryptographic verification token."
            : status === "verified"
            ? "Your account email is now verified. Redirecting you into CREDVAIL..."
            : "Confirm your email ownership or request a new single-use verification link."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {status === "verifying" && (
          <div className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-slate-50 p-4 text-xs text-[#475569]">
            <RefreshCw className="h-4 w-4 animate-spin text-[#0F1D38]" />
            <span>Completing verification and establishing secure session...</span>
          </div>
        )}

        {status === "verified" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Email verified cleanly. Taking you to {redirectPath}.</span>
            </div>
            <Link href={redirectPath} className="block">
              <Button className="w-full gap-2">
                <span>Continue Now</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}

        {status === "error" && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {status !== "verified" && (
          <form onSubmit={handleResend} className="space-y-3 border-t border-black/[0.06] pt-4">
            <label className="text-xs font-medium text-[#0F172A]" htmlFor="resend-email">
              Need a fresh verification link?
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
              <Input
                id="resend-email"
                type="email"
                placeholder="you@organization.edu"
                className="pl-9"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" variant="outline" className="w-full" disabled={resending}>
              {resending ? "Sending Link..." : "Resend Verification Email"}
            </Button>

            {resendResult && (
              <div className="rounded-lg border border-black/[0.08] bg-slate-50 p-3 text-xs text-[#475569] space-y-1.5">
                <p>{resendResult.message}</p>
                {resendResult.devPreviewUrl && (
                  <Link href={resendResult.devPreviewUrl} className="font-mono text-[#0F1D38] underline break-all block">
                    Dev Preview Verification Link
                  </Link>
                )}
              </div>
            )}
          </form>
        )}
      </CardContent>

      <CardFooter className="justify-center border-t border-black/[0.06] pt-4">
        <Link href="/login" className="text-xs text-[#475569] hover:text-[#0F1D38] font-medium">
          Return to Sign In
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="page-shell relative flex items-center justify-center px-4 py-16 sm:px-6">
      <div className="surface-grid pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-md">
        <React.Suspense fallback={<div className="p-6 text-center text-sm">Loading verification...</div>}>
          <VerifyEmailContent />
        </React.Suspense>
      </div>
    </div>
  );
}
