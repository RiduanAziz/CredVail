"use client";

import * as React from "react";
import Link from "next/link";
import { Mail, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submittedMessage, setSubmittedMessage] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSubmittedMessage(null);

    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to request reset");
      }
      setSubmittedMessage(data.data?.message || "Reset instructions prepared.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell relative flex items-center justify-center px-4 py-16 sm:px-6">
      <div className="surface-grid pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-md border border-black/[0.08] bg-white px-3 py-1 text-xs font-medium text-[#475569]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0F1D38]" />
            <span>Account Recovery</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.025em] text-[#0F172A]">
            Reset Password{" "}
            <span className="text-[#64748B] font-normal">via email token</span>
          </h1>
        </div>
        <Card className="rounded-xl border border-black/[0.08] bg-white shadow-sm">
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle>Recover Institutional Account</CardTitle>
              <CardDescription>
                Enter your registered institutional email address to initiate a single-use password reset.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {submittedMessage && (
                <div className="flex items-center gap-2 p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{submittedMessage}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground" htmlFor="email">
                  Email Address
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
            </CardContent>
            <CardFooter className="flex flex-col space-y-3">
              <Button type="submit" variant="brand" className="w-full" disabled={loading}>
                {loading ? "Preparing Reset..." : "Send Recovery Instructions"}
              </Button>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Sign In
              </Link>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
