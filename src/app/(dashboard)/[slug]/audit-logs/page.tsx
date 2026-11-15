"use client";

import * as React from "react";
import { History, Shield, Filter, RefreshCw, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AuditLogEntry } from "@/types";

export default function TenantAuditLogsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [slug, setSlug] = React.useState<string>("");
  const [logs, setLogs] = React.useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    params.then((p) => {
      setSlug(p.slug);
      loadLogs(p.slug);
    });
  }, [params]);

  const loadLogs = async (tenantSlug: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/tenants/${tenantSlug}/audit-logs?limit=100`);
      if (!res.ok) throw new Error("Failed to load audit logs");
      const data = await res.json();
      setLogs(data.data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cryptographic & Operational Audit Trail</h1>
          <p className="text-xs text-muted-foreground">
            Immutable log of all institutional actions, membership changes, key rotations, and issuances.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => loadLogs(slug)}
          className="gap-2 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh</span>
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/50 dark:text-red-300 dark:border-red-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card className="border shadow-xs overflow-hidden">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base font-bold">Audit Event Ledger</CardTitle>
          <CardDescription className="text-xs">
            Showing the latest {logs.length} logged events.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Loading audit records...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No audit records recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-y text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-5">Action</th>
                    <th className="py-3 px-4">Resource Target</th>
                    <th className="py-3 px-4">Initiator</th>
                    <th className="py-3 px-4">Details / Metadata</th>
                    <th className="py-3 px-5 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-5">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {log.action}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        <span className="font-semibold text-foreground">{log.resourceType}</span>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                          {log.resourceId}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{log.userFullName || "System Admin"}</div>
                        <div className="text-[10px] text-muted-foreground">{log.userEmail || "system"}</div>
                      </td>
                      <td className="py-3 px-4">
                        <pre className="text-[10px] font-mono text-muted-foreground max-w-[280px] truncate bg-muted/30 p-1 rounded">
                          {JSON.stringify(log.metadata)}
                        </pre>
                      </td>
                      <td className="py-3 px-5 text-right font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
