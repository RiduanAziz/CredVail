"use client";

import * as React from "react";
import {
  History,
  Shield,
  Filter,
  RefreshCw,
  AlertCircle,
  Search,
  Download,
  Eye,
  KeyRound,
  FileCheck2,
  Users,
  ShieldAlert,
  ArrowUpDown,
  Copy,
  Check,
  X,
  Clock,
  Sparkles,
  Layers,
  Fingerprint,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AuditLogEntry } from "@/types";

export default function TenantAuditLogsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const unwrappedParams = React.use(params);
  const slug = unwrappedParams.slug;

  const [logs, setLogs] = React.useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  // Search, filter, and pagination
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [selectedResourceType, setSelectedResourceType] = React.useState<string>("ALL");
  const [selectedLog, setSelectedLog] = React.useState<AuditLogEntry | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState<number>(1);
  const pageSize = 20;

  const loadLogs = React.useCallback(async (tenantSlug: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/tenants/${tenantSlug}/audit-logs?limit=250`);
      if (!res.ok) throw new Error("Failed to load audit logs");
      const data = await res.json();
      setLogs(data.data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadLogs(slug);
  }, [slug, loadLogs]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportCSV = () => {
    if (logs.length === 0) return;
    const headers = "Timestamp,Action,ResourceType,ResourceId,UserEmail,UserFullName,IpHash\n";
    const rows = logs
      .map(
        (l) =>
          `"${new Date(l.createdAt).toISOString()}","${l.action}","${l.resourceType}","${l.resourceId}","${
            l.userEmail || ""
          }","${l.userFullName || ""}","${l.ipHash || ""}"`
      )
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-logs-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Derive unique resource types for filter dropdown
  const resourceTypes = React.useMemo(() => {
    const types = new Set<string>();
    logs.forEach((l) => {
      if (l.resourceType) types.add(l.resourceType);
    });
    return Array.from(types).sort();
  }, [logs]);

  // Filtered logs
  const filteredLogs = React.useMemo(() => {
    return logs.filter((log) => {
      const matchesResource = selectedResourceType === "ALL" || log.resourceType === selectedResourceType;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchesResource;

      const matchesSearch =
        log.action.toLowerCase().includes(q) ||
        log.resourceType.toLowerCase().includes(q) ||
        log.resourceId.toLowerCase().includes(q) ||
        (log.userEmail && log.userEmail.toLowerCase().includes(q)) ||
        (log.userFullName && log.userFullName.toLowerCase().includes(q)) ||
        JSON.stringify(log.metadata).toLowerCase().includes(q);

      return matchesResource && matchesSearch;
    });
  }, [logs, selectedResourceType, searchQuery]);

  const paginatedLogs = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, page]);

  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;

  // Stat metrics
  const stats = React.useMemo(() => {
    const keyActions = logs.filter((l) => l.action.includes("KEY") || l.action.includes("EPOCH")).length;
    const batchActions = logs.filter((l) => l.action.includes("BATCH") || l.action.includes("CREDENTIAL")).length;
    const memberActions = logs.filter((l) => l.action.includes("MEMBER") || l.action.includes("ROLE") || l.action.includes("TENANT")).length;
    return {
      total: logs.length,
      keyActions,
      batchActions,
      memberActions,
    };
  }, [logs]);

  const getActionBadge = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes("KEY") || act.includes("ROTATE") || act.includes("EPOCH")) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800">
          <KeyRound className="h-2.5 w-2.5" />
          {action}
        </span>
      );
    }
    if (act.includes("REVOKE") || act.includes("COMPROMISE") || act.includes("DELETE") || act.includes("FAILED")) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800">
          <ShieldAlert className="h-2.5 w-2.5" />
          {action}
        </span>
      );
    }
    if (act.includes("BATCH") || act.includes("ANCHOR") || act.includes("ISSUE") || act.includes("STAGE")) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800">
          <FileCheck2 className="h-2.5 w-2.5" />
          {action}
        </span>
      );
    }
    if (act.includes("MEMBER") || act.includes("INVITE") || act.includes("ROLE") || act.includes("USER")) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
          <Users className="h-2.5 w-2.5" />
          {action}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-muted text-foreground border border-border">
        {action}
      </span>
    );
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-serif">
              Cryptographic Audit Trail
            </h1>
            <Badge variant="outline" className="border-primary/30 text-primary font-mono text-xs gap-1">
              <Sparkles className="h-3 w-3" />
              Immutable Ledger
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Tamper-evident record of all institutional governance events, signing key epochs, batch generation, and authorization changes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={logs.length === 0}
            className="gap-2 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadLogs(slug)}
            disabled={loading}
            className="gap-2 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Recorded Events
            </span>
            <History className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2">{stats.total}</p>
          <span className="text-[10px] text-muted-foreground">Persisted in primary event store</span>
        </Card>

        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-indigo-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Key & Cryptography Events
            </span>
            <KeyRound className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-2">{stats.keyActions}</p>
          <span className="text-[10px] text-muted-foreground">Rotations, epochs & compromise flags</span>
        </Card>

        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-blue-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Batch & Issuance Operations
            </span>
            <Layers className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-2">{stats.batchActions}</p>
          <span className="text-[10px] text-muted-foreground">Ingestions, proofs & anchoring</span>
        </Card>

        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-emerald-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Staff & RBAC Governance
            </span>
            <Users className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">{stats.memberActions}</p>
          <span className="text-[10px] text-muted-foreground">Role assignments & tenant updates</span>
        </Card>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/50 dark:text-red-300 dark:border-red-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search action, user, resource ID, or metadata..."
            className="pl-9 text-xs"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">Resource:</span>
          <select
            value={selectedResourceType}
            onChange={(e) => {
              setSelectedResourceType(e.target.value);
              setPage(1);
            }}
            className="border rounded-md px-2.5 py-1.5 text-xs bg-background text-foreground font-medium"
          >
            <option value="ALL">All Resources ({logs.length})</option>
            {resourceTypes.map((rt) => (
              <option key={rt} value={rt}>
                {rt} ({logs.filter((l) => l.resourceType === rt).length})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Event Table */}
      <Card className="border shadow-xs overflow-hidden">
        <CardHeader className="p-4 pb-3 border-b border-border/60 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold">Event Ledger Entries</CardTitle>
            <CardDescription className="text-xs">
              Showing {filteredLogs.length > 0 ? (page - 1) * pageSize + 1 : 0}–
              {Math.min(page * pageSize, filteredLogs.length)} of {filteredLogs.length} matching events
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            Page {page} of {totalPages}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {loading && logs.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
              Loading cryptographic ledger records...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Shield className="h-8 w-8 text-muted-foreground/60 mx-auto mb-1" />
              <p className="text-sm font-semibold text-foreground">No matching audit events</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No events match your current filter criteria. Try resetting your search or filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Resource Target</th>
                    <th className="py-3 px-4">Initiating Entity</th>
                    <th className="py-3 px-4">Metadata Evidence</th>
                    <th className="py-3 px-4 text-right">Timestamp</th>
                    <th className="py-3 px-3 text-center">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getActionBadge(log.action)}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        <span className="font-semibold text-foreground">{log.resourceType}</span>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[140px]" title={log.resourceId}>
                          {log.resourceId}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{log.userFullName || "System / Automated"}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{log.userEmail || "daemon"}</div>
                      </td>
                      <td className="py-3 px-4">
                        <pre
                          onClick={() => setSelectedLog(log)}
                          className="text-[10px] font-mono text-muted-foreground max-w-[240px] truncate bg-muted/40 p-1.5 rounded cursor-pointer hover:bg-muted/70 transition-colors"
                          title="Click to inspect full metadata"
                        >
                          {JSON.stringify(log.metadata)}
                        </pre>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        <div className="text-foreground">{new Date(log.createdAt).toLocaleDateString()}</div>
                        <div className="text-[10px]">{new Date(log.createdAt).toLocaleTimeString()}</div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setSelectedLog(log)}
                          title="Inspect Event"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        {totalPages > 1 && (
          <CardFooter className="p-4 border-t border-border flex items-center justify-between text-xs">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="text-xs h-8"
            >
              Previous
            </Button>
            <span className="text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="text-xs h-8"
            >
              Next
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Inspect Event Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-2xl max-h-[85vh] shadow-2xl border border-border flex flex-col overflow-hidden animate-in fade-in-50 zoom-in-95">
            <CardHeader className="flex flex-row items-center justify-between p-4 border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Fingerprint className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold">Audit Event Detail</CardTitle>
                  <CardDescription className="text-xs font-mono">{selectedLog.id}</CardDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setSelectedLog(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-muted/40 p-3.5 rounded-lg border border-border">
                <div>
                  <span className="text-muted-foreground block text-[10px]">Action:</span>
                  <span className="font-mono font-bold text-foreground">{selectedLog.action}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Resource Type:</span>
                  <span className="font-mono font-semibold text-foreground">{selectedLog.resourceType}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Target ID:</span>
                  <span className="font-mono font-bold text-primary truncate block" title={selectedLog.resourceId}>
                    {selectedLog.resourceId}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Initiator:</span>
                  <span className="font-semibold text-foreground">{selectedLog.userFullName || "System"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Email:</span>
                  <span className="font-mono text-muted-foreground">{selectedLog.userEmail || "daemon@credvail.internal"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">IP Anonymized Hash:</span>
                  <span className="font-mono text-[10px] text-muted-foreground truncate block" title={selectedLog.ipHash}>
                    {selectedLog.ipHash ? `${selectedLog.ipHash.slice(0, 12)}...` : "N/A"}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Cryptographic Metadata Payload</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => handleCopy(JSON.stringify(selectedLog.metadata, null, 2), "copy-meta")}
                  >
                    {copiedId === "copy-meta" ? (
                      <Check className="h-3 w-3 text-emerald-600 mr-1" />
                    ) : (
                      <Copy className="h-3 w-3 mr-1" />
                    )}
                    Copy JSON
                  </Button>
                </div>
                <pre className="p-3.5 rounded-lg bg-zinc-950 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-64 border border-zinc-800 leading-relaxed">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </div>

              <div className="flex items-center justify-between text-muted-foreground text-[11px] pt-2 border-t">
                <span>Recorded: {new Date(selectedLog.createdAt).toUTCString()}</span>
                {selectedLog.userAgent && (
                  <span className="truncate max-w-[280px]" title={selectedLog.userAgent}>
                    Agent: {selectedLog.userAgent}
                  </span>
                )}
              </div>
            </CardContent>
            <CardFooter className="border-t border-border p-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setSelectedLog(null)} className="text-xs">
                Close
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
