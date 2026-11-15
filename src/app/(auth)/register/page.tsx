"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, Lock, Mail, User, Building, Globe, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [orgName, setOrgName] = React.useState("");
  const [websiteUrl, setWebsiteUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Step 1: Register user account
      const userRes = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, fullName }),
      });

      const userData = await userRes.json();
      if (!userRes.ok) {
        throw new Error(userData.error?.message || "Registration failed");
      }

      // Step 2: Create initial organization tenant
      const tenantRes = await fetch("/api/v1/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: orgName,
          legalEntityName: orgName,
          websiteUrl: websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`,
        }),
      });

      const tenantData = await tenantRes.json();
      if (!tenantRes.ok) {
        throw new Error(tenantData.error?.message || "Failed to create organization");
      }

      router.push(`/dashboard/${tenantData.data.slug}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[90vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <Link href="/" className="flex items-center gap-2 font-bold text-2xl tracking-tight mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Shield className="h-6 w-6" />
            </div>
            <span>CRED<span className="text-primary font-black">VAIL</span></span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Register Your Institution</h1>
          <p className="text-sm text-muted-foreground">
            Onboard your university, academy, or enterprise to issue blockchain-anchored credentials.
          </p>
        </div>

        <Card className="border shadow-md">
          <form onSubmit={handleSubmit}>
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-lg">Account & Organization Setup</CardTitle>
              <CardDescription>
                You will be designated as the Organization Owner (`ORG_OWNER`) for your tenant.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md dark:bg-red-950/50 dark:text-red-300 dark:border-red-800">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground" htmlFor="fullName">
                    Your Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="fullName"
                      placeholder="Dr. Eleanor Vance"
                      className="pl-9"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground" htmlFor="email">
                    Institutional Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@mit.edu"
                      className="pl-9"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground" htmlFor="password">
                  Password (Min 8 chars, 1 Upper, 1 Lower, 1 Digit, 1 Symbol)
                </label>
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

              <div className="border-t pt-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground" htmlFor="orgName">
                    Institution / Organization Name
                  </label>
                  <div className="relative">
                    <Building className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="orgName"
                      placeholder="Massachusetts Institute of Technology"
                      className="pl-9"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground" htmlFor="websiteUrl">
                    Official Website Domain
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="websiteUrl"
                      placeholder="https://mit.edu"
                      className="pl-9"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 pt-2">
              <Button type="submit" className="w-full gap-2" disabled={loading}>
                {loading ? (
                  <span>Creating Tenant...</span>
                ) : (
                  <>
                    <span>Complete Registration & Launch Tenant</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <div className="text-center text-xs text-muted-foreground">
                Already registered?{" "}
                <Link href="/login" className="text-primary hover:underline font-medium">
                  Sign in here
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
