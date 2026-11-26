"use client";

import * as React from "react";
import Link from "next/link";
import {
  Wallet,
  User,
  Mail,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  KeyRound,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordStrengthField } from "@/components/auth/PasswordStrengthField";
import { walletRegistrationSchema } from "@/lib/validation/registration";

export default function WalletRegistrationPage() {
  const [fullName, setFullName] = React.useState("");
  const [preferredDisplayName, setPreferredDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [privacyAccepted, setPrivacyAccepted] = React.useState(false);
  const [marketingOptIn, setMarketingOptIn] = React.useState(false);

  const [submitting, setSubmitting] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [completed, setCompleted] = React.useState<{
    message: string;
    emailDeliveryPending: boolean;
    devPreviewUrl?: string;
  } | null>(null);
  const [resending, setResending] = React.useState(false);
  const [resendNotice, setResendNotice] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setFieldErrors({});
    setFormError(null);

    const parsed = walletRegistrationSchema.safeParse({
      fullName,
      preferredDisplayName: preferredDisplayName || undefined,
      email,
      password,
      confirmPassword,
      termsAccepted,
      privacyAccepted,
      marketingOptIn,
    });

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] || "form");
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      setFormError(parsed.error.issues[0]?.message || "Please check all highlighted fields.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/register/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json();
      if (!res.ok) {
        if (Array.isArray(json.error?.details)) {
          const nextErrors: Record<string, string> = {};
          for (const issue of json.error.details) {
            const key = String(issue.path?.[0] || "form");
            if (!nextErrors[key]) nextErrors[key] = issue.message;
          }
          setFieldErrors(nextErrors);
        }
        throw new Error(json.error?.message || "Unable to create personal wallet account.");
      }

      setCompleted({
        message: json.data?.message || "Check your email to activate your personal wallet.",
        emailDeliveryPending: Boolean(json.data?.emailDeliveryPending),
        devPreviewUrl: json.data?.devPreviewUrl,
      });
    } catch (err: any) {
      setFormError(err.message || "Registration request failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resending || !email.trim()) return;
    setResending(true);
    setResendNotice(null);
    try {
      const res = await fetch("/api/v1/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Unable to resend verification link.");
      }
      setResendNotice(json.data?.message || "A fresh verification link has been prepared.");
      if (json.data?.devPreviewUrl) {
        setCompleted((prev) =>
          prev ? { ...prev, devPreviewUrl: json.data.devPreviewUrl } : prev
        );
      }
    } catch (err: any) {
      setResendNotice(err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="page-shell relative overflow-hidden px-4 py-12 sm:px-6 sm:py-16">
      <div className="surface-grid pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-4xl space-y-8">
        <div className="flex items-center justify-between">
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Account Options
          </Link>
          <span className="font-mono text-[11px] text-[#64748B]">PERSONAL HOLDER WALLET</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          {/* Left Identity Summary */}
          <div className="space-y-6 rounded-xl border border-black/[0.08] bg-white p-6 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0F1D38] text-white">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[#0F172A]">
                Create Your Personal{" "}
                <span className="text-[#64748B] font-normal">credential wallet</span>
              </h1>
              <p className="text-sm text-[#475569] leading-relaxed">
                Receive diplomas, certificates, and verified badges issued to your email address with zero institutional overhead.
              </p>
            </div>

            <div className="space-y-3 border-t border-black/[0.06] pt-4 text-xs text-[#334155]">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0F1D38]" />
                <span>Holder private keys remain strictly inside your browser IndexedDB vault.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#0F1D38]" />
                <span>No seed phrases, national IDs, or organization details required.</span>
              </div>
            </div>
          </div>

          {/* Right Form or Verification Confirmation */}
          {completed ? (
            <Card className="rounded-xl border border-black/[0.08] bg-white shadow-sm">
              <CardHeader>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 mb-2">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <CardTitle className="text-xl text-[#0F172A]">Verify Your Email Address</CardTitle>
                <CardDescription className="text-sm text-[#475569]">
                  {completed.message}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-black/[0.08] bg-slate-50 p-3 text-xs text-[#475569]">
                  Sent to <span className="font-mono font-medium text-[#0F172A]">{email.trim().toLowerCase()}</span>.
                  Once verified, your personal browser wallet will initialize automatically at{" "}
                  <span className="font-mono">/wallet</span>.
                </div>

                {completed.devPreviewUrl && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
                    <div className="font-semibold">Local Development Verification Preview</div>
                    <Link
                      href={completed.devPreviewUrl}
                      className="inline-flex items-center gap-1.5 font-mono text-[#0F1D38] underline break-all"
                    >
                      <span>Open Verification Link</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </Link>
                  </div>
                )}

                {resendNotice && (
                  <p className="text-xs text-[#475569]">{resendNotice}</p>
                )}
              </CardContent>
              <CardFooter className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <Button variant="outline" onClick={handleResend} disabled={resending} className="w-full sm:w-auto">
                  {resending ? "Sending..." : "Resend Verification Email"}
                </Button>
                <Link href="/login" className="w-full sm:w-auto">
                  <Button className="w-full">Go to Sign In</Button>
                </Link>
              </CardFooter>
            </Card>
          ) : (
            <Card className="rounded-xl border border-black/[0.08] bg-white shadow-sm">
              <form onSubmit={handleSubmit} noValidate>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">Personal Account Details</CardTitle>
                  <CardDescription>
                    Enter your name, email address, and choose a 15+ character passphrase.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {formError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                    >
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#0F172A]" htmlFor="fullName">
                      Full Name <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                      <Input
                        id="fullName"
                        name="fullName"
                        autoComplete="name"
                        placeholder="Alex Rivera"
                        className="pl-9"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        aria-invalid={Boolean(fieldErrors.fullName)}
                        disabled={submitting}
                        required
                      />
                    </div>
                    {fieldErrors.fullName && (
                      <p className="text-xs text-red-600">{fieldErrors.fullName}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#0F172A]" htmlFor="preferredDisplayName">
                      Preferred Display Name <span className="text-[#64748B]">(optional)</span>
                    </label>
                    <Input
                      id="preferredDisplayName"
                      name="preferredDisplayName"
                      autoComplete="nickname"
                      placeholder="How your wallet greeting displays"
                      value={preferredDisplayName}
                      onChange={(e) => setPreferredDisplayName(e.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#0F172A]" htmlFor="email">
                      Email Address <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="alex.rivera@example.com"
                        className="pl-9"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        aria-invalid={Boolean(fieldErrors.email)}
                        disabled={submitting}
                        required
                      />
                    </div>
                    {fieldErrors.email && (
                      <p className="text-xs text-red-600">{fieldErrors.email}</p>
                    )}
                  </div>

                  <PasswordStrengthField
                    password={password}
                    confirmPassword={confirmPassword}
                    onPasswordChange={setPassword}
                    onConfirmPasswordChange={setConfirmPassword}
                    passwordError={fieldErrors.password}
                    confirmError={fieldErrors.confirmPassword}
                    disabled={submitting}
                  />

                  <div className="space-y-2.5 border-t border-black/[0.06] pt-4 text-xs text-[#334155]">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300"
                        disabled={submitting}
                        required
                      />
                      <span>
                        I agree to CREDVAIL&apos;s Terms of Service <span className="text-red-600">*</span>
                      </span>
                    </label>
                    {fieldErrors.termsAccepted && (
                      <p className="text-xs text-red-600">{fieldErrors.termsAccepted}</p>
                    )}

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={privacyAccepted}
                        onChange={(e) => setPrivacyAccepted(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300"
                        disabled={submitting}
                        required
                      />
                      <span>
                        I acknowledge CREDVAIL&apos;s Privacy Policy <span className="text-red-600">*</span>
                      </span>
                    </label>
                    {fieldErrors.privacyAccepted && (
                      <p className="text-xs text-red-600">{fieldErrors.privacyAccepted}</p>
                    )}

                    <label className="flex items-start gap-2.5 cursor-pointer text-[#64748B]">
                      <input
                        type="checkbox"
                        checked={marketingOptIn}
                        onChange={(e) => setMarketingOptIn(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300"
                        disabled={submitting}
                      />
                      <span>Send optional product and security updates</span>
                    </label>
                  </div>
                </CardContent>

                <CardFooter className="flex flex-col space-y-3 pt-2">
                  <Button type="submit" className="w-full h-11 gap-2" disabled={submitting}>
                    {submitting ? (
                      <span>Creating Personal Account...</span>
                    ) : (
                      <>
                        <span>Create Personal Wallet Account</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <p className="text-center text-xs text-[#64748B]">
                    Already registered?{" "}
                    <Link href="/login" className="font-medium text-[#0F1D38] hover:underline">
                      Sign in
                    </Link>
                  </p>
                </CardFooter>
              </form>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
