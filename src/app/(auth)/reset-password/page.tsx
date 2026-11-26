"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Lock, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [token, setToken] = React.useState(searchParams.get("token") || "");
  const [newPassword, setNewPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to reset password");
      }
      setSuccess(true);
      setTimeout(() => router.push("/login"), 1200);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="rounded-xl border border-black/[0.08] bg-white shadow-sm">
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>Set New Password</CardTitle>
          <CardDescription>
            Paste your single-use recovery token and choose a strong password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Password updated. Redirecting to login...</span>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="token">
              Recovery Token
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="credvail_rst_..."
                className="pl-9"
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground" htmlFor="newPassword">
              New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 10 characters with complexity"
                className="pl-9"
                required
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-3">
          <Button type="submit" variant="brand" className="w-full" disabled={loading}>
            {loading ? "Updating Password..." : "Reset Password"}
          </Button>
          <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground">
            Return to Sign In
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="page-shell relative flex items-center justify-center px-4 py-16">
      <div className="surface-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative w-full max-w-md">
        <React.Suspense fallback={<div className="p-6 text-center text-sm">Loading reset form...</div>}>
          <ResetPasswordForm />
        </React.Suspense>
      </div>
    </div>
  );
}
