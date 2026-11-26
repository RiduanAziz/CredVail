"use client";

import Link from "next/link";
import Image from "next/image";
import { Building2, Wallet, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const INSTITUTIONAL_CAPABILITIES = [
  "Organization dashboard and tenant analytics",
  "Digital certificate issuance & PDF rendering",
  "Certificate template management studio",
  "Bulk CSV/XLSX recipient ingestion",
  "Institutional DID:web identity & issuer key governance",
  "Team invitations and role-based access control",
  "Credential verification and revocation lifecycle",
];

const WALLET_CAPABILITIES = [
  "Personal browser credential wallet vault",
  "Receive official institutional certificates",
  "Claim eligible credentials issued to your verified email",
  "Inspect 5-layer cryptographic verification details",
  "Manage client-side WebCrypto holder DID identity",
  "Export and import encrypted wallet vault backups",
];

export default function RegisterSelectionPage() {
  return (
    <div className="page-shell relative overflow-hidden px-4 py-14 sm:px-6 sm:py-20">
      <div className="surface-grid pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-5xl space-y-10">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-md border border-black/[0.08] bg-white px-3 py-1 text-xs font-medium text-[#475569]">
            <Image
              src="/brand/brand-symbol-64.png"
              alt="CREDVAIL"
              width={16}
              height={16}
              className="h-4 w-4 rounded-sm object-contain"
            />
            <span>CREDVAIL Onboarding</span>
          </div>

          <h1 className="text-3xl font-semibold tracking-[-0.025em] text-[#0F172A] sm:text-5xl">
            Choose Your Registration{" "}
            <span className="text-[#64748B] font-normal">account experience</span>
          </h1>

          <p className="text-sm sm:text-base text-[#475569] leading-relaxed">
            Both account types share CREDVAIL&apos;s unified identity layer—you can later accept staff invitations or manage your personal credential wallet from the same verified identity.
          </p>
        </div>

        {/* Dual Track Cards */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Option A — Institutional */}
          <Card className="flex flex-col justify-between rounded-xl border border-black/[0.08] bg-white shadow-sm hover:border-black/20 transition-colors">
            <CardHeader className="space-y-3 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0F1D38] text-white">
                  <Building2 className="h-5 w-5" />
                </div>
                <span className="rounded bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-medium text-[#475569]">
                  ORGANIZATIONS &amp; ISSUERS
                </span>
              </div>
              <div>
                <CardTitle className="text-xl font-semibold text-[#0F172A]">
                  Register Your Institution
                </CardTitle>
                <CardDescription className="mt-1.5 text-sm text-[#475569] leading-relaxed">
                  Create an institutional workspace to issue, manage, authenticate, and verify digital credentials.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-2.5 border-t border-black/[0.06] pt-5">
              {INSTITUTIONAL_CAPABILITIES.map((item) => (
                <div key={item} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#334155]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0F1D38]" />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>

            <CardFooter className="pt-4">
              <Link href="/register/institution" className="w-full">
                <Button className="w-full h-11 gap-2">
                  <span>Create Institutional Account</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardFooter>
          </Card>

          {/* Option B — Personal Wallet */}
          <Card className="flex flex-col justify-between rounded-xl border border-black/[0.08] bg-white shadow-sm hover:border-black/20 transition-colors">
            <CardHeader className="space-y-3 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-black/[0.12] bg-slate-50 text-[#0F1D38]">
                  <Wallet className="h-5 w-5" />
                </div>
                <span className="rounded bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-medium text-[#475569]">
                  INDIVIDUAL HOLDERS
                </span>
              </div>
              <div>
                <CardTitle className="text-xl font-semibold text-[#0F172A]">
                  Create Your Personal Wallet
                </CardTitle>
                <CardDescription className="mt-1.5 text-sm text-[#475569] leading-relaxed">
                  Create your personal credential account to receive, securely manage, and present verified digital credentials.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-2.5 border-t border-black/[0.06] pt-5">
              {WALLET_CAPABILITIES.map((item) => (
                <div key={item} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#334155]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0F1D38]" />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>

            <CardFooter className="pt-4">
              <Link href="/register/wallet" className="w-full">
                <Button variant="outline" className="w-full h-11 gap-2">
                  <span>Create Personal Wallet</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </div>

        {/* Existing Account Sign-In */}
        <div className="text-center text-sm text-[#475569]">
          Already have a CREDVAIL account?{" "}
          <Link href="/login" className="font-semibold text-[#0F1D38] hover:underline">
            Sign in to your account
          </Link>
        </div>
      </div>
    </div>
  );
}
