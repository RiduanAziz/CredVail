"use client";

import * as React from "react";
import { CreditCard, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PlanItem {
  tier: string;
  displayName: string;
  monthlyUsd: number;
  monthlyCredentialLimit: number;
  maxTeamSeats: number;
  features: string[];
}

export default function TenantBillingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [slug, setSlug] = React.useState<string>("");

  React.useEffect(() => {
    params.then((p) => setSlug(p.slug));
  }, [params]);
  const [subscription, setSubscription] = React.useState<any>(null);
  const [plans, setPlans] = React.useState<PlanItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [updatingTier, setUpdatingTier] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const loadBilling = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tenants/${slug}/billing`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to load billing");
      setSubscription(json.data.subscription);
      setPlans(json.data.availablePlans || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  React.useEffect(() => {
    if (slug) loadBilling();
  }, [slug, loadBilling]);

  const handleSelectPlan = async (tier: string) => {
    setUpdatingTier(tier);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/tenants/${slug}/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Plan update failed");
      setSubscription(json.data);
      setNotice(`Subscription updated to ${tier}.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdatingTier(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-black/[0.08] pb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.025em] text-[#0F172A]">
            Subscription & Quotas
          </h1>
          <p className="text-sm text-[#475569] mt-1">
            Manage monthly credential issuance allowances, staff seats, and institutional tier.
          </p>
        </div>
        {subscription && (
          <Badge variant="outline" className="gap-1.5 px-3 py-1 font-mono text-xs border-black/[0.08] bg-white text-[#475569]">
            <CreditCard className="h-3.5 w-3.5" />
            {subscription.tier} ({subscription.status})
          </Badge>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading billing summary...</CardContent>
        </Card>
      ) : (
        <>
          {subscription && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Current Billing Cycle Usage</CardTitle>
                <CardDescription>
                  {subscription.monthlyIssuedCount} of {subscription.monthlyCredentialLimit.toLocaleString()} monthly credentials issued
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (subscription.monthlyIssuedCount /
                            Math.max(1, subscription.monthlyCredentialLimit)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent = subscription?.tier === plan.tier;
              return (
                <Card key={plan.tier} className={isCurrent ? "border-primary shadow-md" : ""}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-lg">
                      <span>{plan.displayName}</span>
                      <span className="text-base font-semibold">${plan.monthlyUsd}/mo</span>
                    </CardTitle>
                    <CardDescription>
                      Up to {plan.monthlyCredentialLimit.toLocaleString()} credentials / month
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-xs text-muted-foreground">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="w-full"
                      variant={isCurrent ? "outline" : "brand"}
                      disabled={isCurrent || updatingTier === plan.tier}
                      onClick={() => handleSelectPlan(plan.tier)}
                    >
                      {isCurrent
                        ? "Current Plan"
                        : updatingTier === plan.tier
                        ? "Updating..."
                        : `Switch to ${plan.displayName}`}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
