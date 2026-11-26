"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Building2,
  User,
  Mail,
  Briefcase,
  Phone,
  Globe,
  MapPin,
  FileCheck2,
  Check,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  KeyRound,
  Users,
  Layers,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordStrengthField } from "@/components/auth/PasswordStrengthField";
import {
  ISO_COUNTRIES,
  ORGANIZATION_TYPES,
  adminStepSchema,
  institutionStepSchema,
  reviewConsentSchema,
} from "@/lib/validation/registration";

export default function InstitutionRegistrationPage() {
  const [step, setStep] = React.useState<1 | 2 | 3>(1);

  // Step 1 — Account Administrator
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [jobTitle, setJobTitle] = React.useState("");
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  // Step 2 — Institution Information
  const [name, setName] = React.useState("");
  const [legalEntityName, setLegalEntityName] = React.useState("");
  const [organizationType, setOrganizationType] = React.useState<string>("UNIVERSITY");
  const [organizationTypeOther, setOrganizationTypeOther] = React.useState("");
  const [operatingCountryCode, setOperatingCountryCode] = React.useState("US");
  const [websiteUrl, setWebsiteUrl] = React.useState("");
  const [registrationNumber, setRegistrationNumber] = React.useState("");
  const [registrationAuthority, setRegistrationAuthority] = React.useState("");

  const [addressLine1, setAddressLine1] = React.useState("");
  const [addressLine2, setAddressLine2] = React.useState("");
  const [city, setCity] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [postalCode, setPostalCode] = React.useState("");
  const [addressCountryCode, setAddressCountryCode] = React.useState("US");
  const [contactPhone, setContactPhone] = React.useState("");

  // Step 3 — Consent
  const [authorizedToRegister, setAuthorizedToRegister] = React.useState(false);
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [privacyAccepted, setPrivacyAccepted] = React.useState(false);
  const [marketingOptIn, setMarketingOptIn] = React.useState(false);

  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [completed, setCompleted] = React.useState<{
    message: string;
    tenantSlug?: string;
    emailDeliveryPending: boolean;
    devPreviewUrl?: string;
  } | null>(null);
  const [resending, setResending] = React.useState(false);
  const [resendNotice, setResendNotice] = React.useState<string | null>(null);

  const activeCountryMeta = React.useMemo(
    () => ISO_COUNTRIES.find((c) => c.code === addressCountryCode) || ISO_COUNTRIES[0],
    [addressCountryCode]
  );

  const mapZodErrors = (issues: Array<{ path: (string | number)[]; message: string }>) => {
    const map: Record<string, string> = {};
    for (const issue of issues) {
      const k = String(issue.path[0] || "form");
      if (!map[k]) map[k] = issue.message;
    }
    return map;
  };

  const handleNextStep1 = () => {
    setFieldErrors({});
    setFormError(null);
    const parsed = adminStepSchema.safeParse({
      fullName,
      email,
      jobTitle,
      phoneNumber: phoneNumber || undefined,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      setFieldErrors(mapZodErrors(parsed.error.issues));
      setFormError(parsed.error.issues[0]?.message || "Please complete all required administrator fields.");
      return;
    }
    setStep(2);
  };

  const handleNextStep2 = () => {
    setFieldErrors({});
    setFormError(null);
    const parsed = institutionStepSchema.safeParse({
      name,
      legalEntityName,
      organizationType,
      organizationTypeOther: organizationTypeOther || undefined,
      operatingCountryCode,
      websiteUrl: websiteUrl || undefined,
      registrationNumber: registrationNumber || undefined,
      registrationAuthority: registrationAuthority || undefined,
      addressLine1,
      addressLine2: addressLine2 || undefined,
      city,
      region,
      postalCode,
      addressCountryCode,
      contactPhone: contactPhone || undefined,
    });
    if (!parsed.success) {
      setFieldErrors(mapZodErrors(parsed.error.issues));
      setFormError(parsed.error.issues[0]?.message || "Please complete all required institutional fields.");
      return;
    }
    setStep(3);
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setFieldErrors({});
    setFormError(null);

    const parsedConsent = reviewConsentSchema.safeParse({
      authorizedToRegister,
      termsAccepted,
      privacyAccepted,
      marketingOptIn,
    });
    if (!parsedConsent.success) {
      setFieldErrors(mapZodErrors(parsedConsent.error.issues));
      setFormError(parsedConsent.error.issues[0]?.message || "Please confirm all required consents.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/register/institution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          jobTitle,
          phoneNumber: phoneNumber || undefined,
          password,
          confirmPassword,
          name,
          legalEntityName,
          organizationType,
          organizationTypeOther: organizationTypeOther || undefined,
          operatingCountryCode,
          websiteUrl: websiteUrl || undefined,
          registrationNumber: registrationNumber || undefined,
          registrationAuthority: registrationAuthority || undefined,
          addressLine1,
          addressLine2: addressLine2 || undefined,
          city,
          region,
          postalCode,
          addressCountryCode,
          contactPhone: contactPhone || undefined,
          authorizedToRegister,
          termsAccepted,
          privacyAccepted,
          marketingOptIn,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        if (Array.isArray(json.error?.details)) {
          setFieldErrors(mapZodErrors(json.error.details));
        }
        throw new Error(json.error?.message || "Institutional registration failed.");
      }

      setCompleted({
        message:
          json.data?.message ||
          "Verify your administrator email to activate your institutional workspace.",
        tenantSlug: json.data?.tenantSlug,
        emailDeliveryPending: Boolean(json.data?.emailDeliveryPending),
        devPreviewUrl: json.data?.devPreviewUrl,
      });
    } catch (err: any) {
      setFormError(err.message || "Unable to complete institutional registration.");
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
      setResendNotice(json.data?.message || "Verification link resent.");
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

  const orgTypeLabel =
    ORGANIZATION_TYPES.find((o) => o.value === organizationType)?.label || organizationType;

  return (
    <div className="page-shell relative overflow-hidden px-4 py-10 sm:px-6 lg:py-14">
      <div className="surface-grid pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Account Options
          </Link>
          <span className="font-mono text-[11px] text-[#64748B]">ENTERPRISE &amp; ACADEMIC ONBOARDING</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          {/* Left Institutional Trust Panel */}
          <aside className="rounded-xl border border-black/[0.08] bg-[#0A1224] p-7 text-white lg:sticky lg:top-24 space-y-7">
            <div className="flex items-center gap-2.5">
              <Image
                src="/brand/brand-symbol-64.png"
                alt="CREDVAIL"
                width={32}
                height={32}
                className="h-8 w-8 rounded-lg object-contain"
              />
              <span className="font-bold tracking-tight text-white">CREDVAIL</span>
            </div>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>Institutional Trust Infrastructure</span>
              </div>
              <h2 className="text-2xl font-semibold tracking-[-0.025em] leading-snug text-white">
                Build trusted digital credential infrastructure for your institution.
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Your administrator account, W3C DID:web institutional tenant, and owner authorization are provisioned atomically upon verification.
              </p>
            </div>

            <div className="space-y-4 border-t border-white/10 pt-5 text-xs text-slate-200">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-4 w-4 text-slate-300 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-white">Secure Institutional Identity</div>
                  <p className="text-slate-400 mt-0.5">
                    Dedicated tenant DID URI and controlled platform verification lifecycle.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <KeyRound className="h-4 w-4 text-slate-300 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-white">Cryptographically Verifiable Credentials</div>
                  <p className="text-slate-400 mt-0.5">
                    W3C VC 2.0, ECDSA P-256 signatures, and Ethereum Sepolia Merkle anchoring.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Users className="h-4 w-4 text-slate-300 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-white">Controlled Issuer Authorization</div>
                  <p className="text-slate-400 mt-0.5">
                    Enforced multi-tenant RBAC separation across registrars, designers, and issuers.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Layers className="h-4 w-4 text-slate-300 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-white">Multi-Tenant Management</div>
                  <p className="text-slate-400 mt-0.5">
                    Templates, bulk recipient ingestion, revocation status lists, and audit exports.
                  </p>
                </div>
              </div>
            </div>
          </aside>

          {/* Right Form Flow */}
          <div className="space-y-5">
            {/* Step Progress Header */}
            {!completed && (
              <div className="rounded-xl border border-black/[0.08] bg-white p-4 shadow-sm">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    { num: 1 as const, label: "1. Account Administrator" },
                    { num: 2 as const, label: "2. Institution Information" },
                    { num: 3 as const, label: "3. Review and Submit" },
                  ].map((item) => {
                    const isActive = step === item.num;
                    const isDone = step > item.num;
                    return (
                      <div
                        key={item.num}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 font-medium transition-colors ${
                          isActive
                            ? "bg-[#0F1D38] text-white"
                            : isDone
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-slate-50 text-[#64748B]"
                        }`}
                      >
                        {isDone ? (
                          <Check className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <span className="font-mono text-[11px]">{item.num}</span>
                        )}
                        <span className="truncate">{item.label.replace(/^\d+\.\s*/, "")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {completed ? (
              <Card className="rounded-xl border border-black/[0.08] bg-white shadow-sm">
                <CardHeader>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 mb-2">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-xl text-[#0F172A]">
                    Verify Your Institutional Administrator Email
                  </CardTitle>
                  <CardDescription className="text-sm text-[#475569]">
                    {completed.message}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-black/[0.08] bg-slate-50 p-4 text-xs text-[#475569] space-y-1.5">
                    <div>
                      Administrator Email:{" "}
                      <span className="font-mono font-semibold text-[#0F172A]">
                        {email.trim().toLowerCase()}
                      </span>
                    </div>
                    {completed.tenantSlug && (
                      <div>
                        Assigned Tenant Status:{" "}
                        <span className="font-mono font-semibold text-[#0F172A]">PENDING</span> (/{completed.tenantSlug})
                      </div>
                    )}
                    <p className="pt-1">
                      Verification activates your authenticated session so you can access your dashboard. Institutional accreditation review remains managed by CREDVAIL platform administrators.
                    </p>
                  </div>

                  {completed.devPreviewUrl && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1.5">
                      <div className="font-semibold">Local Development Verification Preview</div>
                      <Link
                        href={completed.devPreviewUrl}
                        className="inline-flex items-center gap-1.5 font-mono text-[#0F1D38] underline break-all"
                      >
                        <span>Verify &amp; Open Institutional Workspace</span>
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
                <form onSubmit={handleFinalSubmit} noValidate>
                  <CardHeader className="border-b border-black/[0.06] pb-4">
                    <CardTitle className="text-xl text-[#0F172A]">
                      {step === 1 && "Step 1: Account Administrator"}
                      {step === 2 && "Step 2: Institution Information"}
                      {step === 3 && "Step 3: Review and Submit"}
                    </CardTitle>
                    <CardDescription>
                      {step === 1 && "Identify the primary institutional administrator (`ORG_OWNER`)."}
                      {step === 2 && "Provide registered institutional identity, legal jurisdiction, and address."}
                      {step === 3 && "Verify your submission details and confirm authorization and policies."}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-5 pt-6">
                    {formError && (
                      <div
                        role="alert"
                        className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                      >
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{formError}</span>
                      </div>
                    )}

                    {/* STEP 1 */}
                    {step === 1 && (
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-[#0F172A]" htmlFor="admin-fullName">
                              Full Name <span className="text-red-600">*</span>
                            </label>
                            <div className="relative">
                              <User className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                              <Input
                                id="admin-fullName"
                                autoComplete="name"
                                placeholder="Dr. Eleanor Vance"
                                className="pl-9"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                aria-invalid={Boolean(fieldErrors.fullName)}
                                required
                              />
                            </div>
                            {fieldErrors.fullName && (
                              <p className="text-xs text-red-600">{fieldErrors.fullName}</p>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-[#0F172A]" htmlFor="admin-email">
                              Official Work Email <span className="text-red-600">*</span>
                            </label>
                            <div className="relative">
                              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                              <Input
                                id="admin-email"
                                type="email"
                                autoComplete="email"
                                placeholder="registrar@university.edu"
                                className="pl-9"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                aria-invalid={Boolean(fieldErrors.email)}
                                required
                              />
                            </div>
                            {fieldErrors.email && (
                              <p className="text-xs text-red-600">{fieldErrors.email}</p>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-[#0F172A]" htmlFor="admin-jobTitle">
                              Position / Job Title <span className="text-red-600">*</span>
                            </label>
                            <div className="relative">
                              <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                              <Input
                                id="admin-jobTitle"
                                autoComplete="organization-title"
                                placeholder="Registrar / Director / Administrator"
                                className="pl-9"
                                value={jobTitle}
                                onChange={(e) => setJobTitle(e.target.value)}
                                aria-invalid={Boolean(fieldErrors.jobTitle)}
                                required
                              />
                            </div>
                            {fieldErrors.jobTitle && (
                              <p className="text-xs text-red-600">{fieldErrors.jobTitle}</p>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-[#0F172A]" htmlFor="admin-phone">
                              Contact Phone <span className="text-[#64748B]">(optional)</span>
                            </label>
                            <div className="relative">
                              <Phone className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                              <Input
                                id="admin-phone"
                                type="tel"
                                autoComplete="tel"
                                placeholder="+1 650 555 0100"
                                className="pl-9"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                aria-invalid={Boolean(fieldErrors.phoneNumber)}
                              />
                            </div>
                            {fieldErrors.phoneNumber && (
                              <p className="text-xs text-red-600">{fieldErrors.phoneNumber}</p>
                            )}
                          </div>
                        </div>

                        <PasswordStrengthField
                          password={password}
                          confirmPassword={confirmPassword}
                          onPasswordChange={setPassword}
                          onConfirmPasswordChange={setConfirmPassword}
                          passwordError={fieldErrors.password}
                          confirmError={fieldErrors.confirmPassword}
                        />
                      </div>
                    )}

                    {/* STEP 2 */}
                    {step === 2 && (
                      <div className="space-y-6">
                        {/* Section A: Organization Identity */}
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                            <Building2 className="h-3.5 w-3.5" />
                            <span>A. Organization Identity</span>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[#0F172A]" htmlFor="org-name">
                                Institution Display Name <span className="text-red-600">*</span>
                              </label>
                              <Input
                                id="org-name"
                                placeholder="Apex Institute of Technology"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                aria-invalid={Boolean(fieldErrors.name)}
                                required
                              />
                              {fieldErrors.name && (
                                <p className="text-xs text-red-600">{fieldErrors.name}</p>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[#0F172A]" htmlFor="org-legal">
                                Registered Legal Entity Name <span className="text-red-600">*</span>
                              </label>
                              <Input
                                id="org-legal"
                                placeholder="Apex Institute Educational Trust"
                                value={legalEntityName}
                                onChange={(e) => setLegalEntityName(e.target.value)}
                                aria-invalid={Boolean(fieldErrors.legalEntityName)}
                                required
                              />
                              {fieldErrors.legalEntityName && (
                                <p className="text-xs text-red-600">{fieldErrors.legalEntityName}</p>
                              )}
                            </div>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[#0F172A]" htmlFor="org-type">
                                Organization Type <span className="text-red-600">*</span>
                              </label>
                              <select
                                id="org-type"
                                value={organizationType}
                                onChange={(e) => setOrganizationType(e.target.value)}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              >
                                {ORGANIZATION_TYPES.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              {fieldErrors.organizationType && (
                                <p className="text-xs text-red-600">{fieldErrors.organizationType}</p>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[#0F172A]" htmlFor="operating-country">
                                Operating Country <span className="text-red-600">*</span>
                              </label>
                              <select
                                id="operating-country"
                                value={operatingCountryCode}
                                onChange={(e) => {
                                  setOperatingCountryCode(e.target.value);
                                  setAddressCountryCode(e.target.value);
                                }}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              >
                                {ISO_COUNTRIES.map((c) => (
                                  <option key={c.code} value={c.code}>
                                    {c.name} ({c.code})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {organizationType === "OTHER" && (
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[#0F172A]" htmlFor="org-type-other">
                                Describe Organization Type <span className="text-red-600">*</span>
                              </label>
                              <Input
                                id="org-type-other"
                                placeholder="e.g. Regional Examination Board"
                                value={organizationTypeOther}
                                onChange={(e) => setOrganizationTypeOther(e.target.value)}
                                aria-invalid={Boolean(fieldErrors.organizationTypeOther)}
                                required
                              />
                              {fieldErrors.organizationTypeOther && (
                                <p className="text-xs text-red-600">{fieldErrors.organizationTypeOther}</p>
                              )}
                            </div>
                          )}

                          <div className="grid gap-4 sm:grid-cols-3">
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[#0F172A]" htmlFor="org-website">
                                Official Website <span className="text-[#64748B]">(optional)</span>
                              </label>
                              <div className="relative">
                                <Globe className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
                                <Input
                                  id="org-website"
                                  placeholder="https://university.edu"
                                  className="pl-9"
                                  value={websiteUrl}
                                  onChange={(e) => setWebsiteUrl(e.target.value)}
                                  aria-invalid={Boolean(fieldErrors.websiteUrl)}
                                />
                              </div>
                              {fieldErrors.websiteUrl && (
                                <p className="text-xs text-red-600">{fieldErrors.websiteUrl}</p>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[#0F172A]" htmlFor="org-reg-num">
                                Registration Number <span className="text-[#64748B]">(optional)</span>
                              </label>
                              <Input
                                id="org-reg-num"
                                placeholder="Charter / Tax / EIN ID"
                                value={registrationNumber}
                                onChange={(e) => setRegistrationNumber(e.target.value)}
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[#0F172A]" htmlFor="org-authority">
                                Accreditation Authority <span className="text-[#64748B]">(optional)</span>
                              </label>
                              <Input
                                id="org-authority"
                                placeholder="e.g. Ministry of Education"
                                value={registrationAuthority}
                                onChange={(e) => setRegistrationAuthority(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Section B: Institutional Address */}
                        <div className="space-y-4 border-t border-black/[0.06] pt-5">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                            <MapPin className="h-3.5 w-3.5" />
                            <span>B. Institutional Address</span>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[#0F172A]" htmlFor="addr-line1">
                                Address Line 1 <span className="text-red-600">*</span>
                              </label>
                              <Input
                                id="addr-line1"
                                autoComplete="address-line1"
                                placeholder="77 Massachusetts Avenue"
                                value={addressLine1}
                                onChange={(e) => setAddressLine1(e.target.value)}
                                aria-invalid={Boolean(fieldErrors.addressLine1)}
                                required
                              />
                              {fieldErrors.addressLine1 && (
                                <p className="text-xs text-red-600">{fieldErrors.addressLine1}</p>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[#0F172A]" htmlFor="addr-line2">
                                Address Line 2 <span className="text-[#64748B]">(optional)</span>
                              </label>
                              <Input
                                id="addr-line2"
                                autoComplete="address-line2"
                                placeholder="Registrar Suite 300"
                                value={addressLine2}
                                onChange={(e) => setAddressLine2(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-4">
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[#0F172A]" htmlFor="addr-city">
                                City <span className="text-red-600">*</span>
                              </label>
                              <Input
                                id="addr-city"
                                autoComplete="address-level2"
                                placeholder="Cambridge"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                aria-invalid={Boolean(fieldErrors.city)}
                                required
                              />
                              {fieldErrors.city && (
                                <p className="text-xs text-red-600">{fieldErrors.city}</p>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[#0F172A]" htmlFor="addr-region">
                                {activeCountryMeta.regionLabel} <span className="text-red-600">*</span>
                              </label>
                              <Input
                                id="addr-region"
                                autoComplete="address-level1"
                                placeholder="MA"
                                value={region}
                                onChange={(e) => setRegion(e.target.value)}
                                aria-invalid={Boolean(fieldErrors.region)}
                                required
                              />
                              {fieldErrors.region && (
                                <p className="text-xs text-red-600">{fieldErrors.region}</p>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[#0F172A]" htmlFor="addr-postal">
                                {activeCountryMeta.postalLabel} <span className="text-red-600">*</span>
                              </label>
                              <Input
                                id="addr-postal"
                                autoComplete="postal-code"
                                placeholder="02139"
                                value={postalCode}
                                onChange={(e) => setPostalCode(e.target.value)}
                                aria-invalid={Boolean(fieldErrors.postalCode)}
                                required
                              />
                              {fieldErrors.postalCode && (
                                <p className="text-xs text-red-600">{fieldErrors.postalCode}</p>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[#0F172A]" htmlFor="addr-country">
                                Country <span className="text-red-600">*</span>
                              </label>
                              <select
                                id="addr-country"
                                value={addressCountryCode}
                                onChange={(e) => setAddressCountryCode(e.target.value)}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              >
                                {ISO_COUNTRIES.map((c) => (
                                  <option key={c.code} value={c.code}>
                                    {c.name} ({c.code})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Section C: Institutional Contact */}
                        <div className="space-y-3 border-t border-black/[0.06] pt-5">
                          <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                            C. Institutional Office Contact
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-[#0F172A]" htmlFor="org-phone">
                                Institution Contact Phone <span className="text-[#64748B]">(optional)</span>
                              </label>
                              <Input
                                id="org-phone"
                                type="tel"
                                placeholder="+1 617 253 1000"
                                value={contactPhone}
                                onChange={(e) => setContactPhone(e.target.value)}
                                aria-invalid={Boolean(fieldErrors.contactPhone)}
                              />
                              {fieldErrors.contactPhone && (
                                <p className="text-xs text-red-600">{fieldErrors.contactPhone}</p>
                              )}
                            </div>
                            <div className="rounded-lg border border-black/[0.06] bg-slate-50 px-3 py-2 text-xs text-[#475569] flex flex-col justify-center">
                              <span className="text-[11px] text-[#64748B]">Primary Contact Position</span>
                              <span className="font-medium text-[#0F172A]">{jobTitle || "Specified in Step 1"}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* STEP 3 */}
                    {step === 3 && (
                      <div className="space-y-5">
                        {/* Section 1 Summary */}
                        <div className="rounded-lg border border-black/[0.08] bg-slate-50 p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
                              Account Administrator
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setStep(1)}
                            >
                              Edit Section
                            </Button>
                          </div>
                          <div className="grid gap-1 text-xs text-[#334155] sm:grid-cols-2">
                            <div>
                              <span className="text-[#64748B]">Name:</span> {fullName}
                            </div>
                            <div>
                              <span className="text-[#64748B]">Work Email:</span>{" "}
                              <span className="font-mono">{email.trim().toLowerCase()}</span>
                            </div>
                            <div>
                              <span className="text-[#64748B]">Position:</span> {jobTitle}
                            </div>
                            {phoneNumber && (
                              <div>
                                <span className="text-[#64748B]">Phone:</span> {phoneNumber}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Section 2 Summary */}
                        <div className="rounded-lg border border-black/[0.08] bg-slate-50 p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
                              Institutional Details
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setStep(2)}
                            >
                              Edit Section
                            </Button>
                          </div>
                          <div className="grid gap-1 text-xs text-[#334155] sm:grid-cols-2">
                            <div>
                              <span className="text-[#64748B]">Display Name:</span> {name}
                            </div>
                            <div>
                              <span className="text-[#64748B]">Legal Entity:</span> {legalEntityName}
                            </div>
                            <div>
                              <span className="text-[#64748B]">Type:</span>{" "}
                              {organizationType === "OTHER" ? `${orgTypeLabel} (${organizationTypeOther})` : orgTypeLabel}
                            </div>
                            <div>
                              <span className="text-[#64748B]">Country:</span> {operatingCountryCode}
                            </div>
                            {websiteUrl && (
                              <div>
                                <span className="text-[#64748B]">Website:</span> {websiteUrl}
                              </div>
                            )}
                            {registrationNumber && (
                              <div>
                                <span className="text-[#64748B]">Reg #:</span> {registrationNumber}
                              </div>
                            )}
                            <div className="sm:col-span-2">
                              <span className="text-[#64748B]">Address:</span> {addressLine1}
                              {addressLine2 ? `, ${addressLine2}` : ""}, {city}, {region} {postalCode},{" "}
                              {addressCountryCode}
                            </div>
                          </div>
                        </div>

                        {/* Consents */}
                        <div className="space-y-3 border-t border-black/[0.06] pt-4 text-xs text-[#334155]">
                          <div className="flex items-center gap-2 font-semibold text-[#0F172A]">
                            <FileCheck2 className="h-4 w-4" />
                            <span>Legal Declarations &amp; Terms</span>
                          </div>

                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={authorizedToRegister}
                              onChange={(e) => setAuthorizedToRegister(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300"
                              required
                            />
                            <span>
                              I confirm that I am authorized to register this institution and manage its credential infrastructure.{" "}
                              <span className="text-red-600">*</span>
                            </span>
                          </label>
                          {fieldErrors.authorizedToRegister && (
                            <p className="text-xs text-red-600">{fieldErrors.authorizedToRegister}</p>
                          )}

                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={termsAccepted}
                              onChange={(e) => setTermsAccepted(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300"
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
                              required
                            />
                            <span>
                              I acknowledge the CREDVAIL Privacy Policy <span className="text-red-600">*</span>
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
                            />
                            <span>Receive optional institutional updates and release announcements</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="flex items-center justify-between border-t border-black/[0.06] pt-4">
                    {step > 1 ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
                        disabled={submitting}
                        className="gap-1.5"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </Button>
                    ) : (
                      <Link href="/login" className="text-xs font-medium text-[#475569] hover:text-[#0F1D38]">
                        Already registered? Sign in
                      </Link>
                    )}

                    {step === 1 && (
                      <Button type="button" onClick={handleNextStep1} className="gap-1.5">
                        <span>Continue to Institution Info</span>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                    {step === 2 && (
                      <Button type="button" onClick={handleNextStep2} className="gap-1.5">
                        <span>Review Registration</span>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                    {step === 3 && (
                      <Button type="submit" disabled={submitting} className="gap-1.5">
                        <span>{submitting ? "Submitting Registration..." : "Submit Institutional Registration"}</span>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                  </CardFooter>
                </form>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
