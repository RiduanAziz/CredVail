"use client";

import * as React from "react";
import {
  Users,
  UserPlus,
  Shield,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Mail,
  User,
  ShieldAlert,
  ArrowRight,
  X,
  Search,
  Filter,
  KeyRound,
  ShieldCheck,
  Award,
  Sparkles,
  RefreshCw,
  MoreVertical,
  Check,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TenantMemberRecord } from "@/lib/repositories/tenant-repository";
import { TenantRole } from "@/types";

const ROLE_DEFINITIONS: Record<
  TenantRole,
  { label: string; desc: string; color: string; badgeStyle: string; permissions: string[] }
> = {
  ORG_OWNER: {
    label: "Organization Owner",
    desc: "Full governance, signing key management, institutional profile, and owner transfer.",
    color: "from-amber-500 to-orange-600",
    badgeStyle: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    permissions: ["Full Administrative Control", "Signing Key Epoch Management", "Transfer Ownership", "Financial & Legal Governance"],
  },
  INSTITUTION_ADMIN: {
    label: "Institution Admin",
    desc: "Staff management, batch creation, template configuration, and credential issuance.",
    color: "from-blue-600 to-indigo-600",
    badgeStyle: "bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
    permissions: ["Manage Staff & Roles", "Configure Certificate Templates", "Trigger Ingestion Batches", "View Audit Trails"],
  },
  CERTIFICATE_ISSUER: {
    label: "Certificate Issuer",
    desc: "Ingests CSV/XLSX recipient lists, triggers batch issuance, and executes revocations.",
    color: "from-emerald-600 to-teal-600",
    badgeStyle: "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
    permissions: ["Upload Recipient Spreadsheets", "Generate Verifiable Certificates", "Trigger Merkle Anchoring", "Revoke Individual Credentials"],
  },
  TEMPLATE_DESIGNER: {
    label: "Template Designer",
    desc: "Builds and customizes visual vector certificate layouts and dynamic placeholders.",
    color: "from-purple-600 to-violet-600",
    badgeStyle: "bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800",
    permissions: ["Design Certificate Canvas", "Manage Layouts & Fonts", "Configure QR Placement", "Manage Signature Blocks"],
  },
  READ_ONLY_STAFF: {
    label: "Read-Only Staff",
    desc: "Views credential records, batches, and audit trails without modification rights.",
    color: "from-slate-600 to-zinc-600",
    badgeStyle: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700",
    permissions: ["View Dashboard Metrics", "Inspect Certificates & Batches", "Export Verification Reports", "Read-Only Ledger Access"],
  },
};

export default function TenantMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const unwrappedParams = React.use(params);
  const slug = unwrappedParams.slug;

  const [members, setMembers] = React.useState<TenantMemberRecord[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  // Search and filter
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [selectedRoleFilter, setSelectedRoleFilter] = React.useState<string>("ALL");

  // Invite Modal state
  const [inviteModalOpen, setInviteModalOpen] = React.useState<boolean>(false);
  const [inviteEmail, setInviteEmail] = React.useState<string>("");
  const [inviteName, setInviteName] = React.useState<string>("");
  const [inviteRole, setInviteRole] = React.useState<TenantRole>("CERTIFICATE_ISSUER");
  const [inviting, setInviting] = React.useState<boolean>(false);

  // Edit Role state
  const [editingUserId, setEditingUserId] = React.useState<string | null>(null);
  const [selectedNewRole, setSelectedNewRole] = React.useState<TenantRole>("CERTIFICATE_ISSUER");
  const [updatingRole, setUpdatingRole] = React.useState<boolean>(false);

  const loadMembers = React.useCallback(async (tenantSlug: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/tenants/${tenantSlug}/members`);
      if (!res.ok) throw new Error("Failed to load staff roster");
      const data = await res.json();
      setMembers(data.data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadMembers(slug);
  }, [slug, loadMembers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/v1/tenants/${slug}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          fullName: inviteName,
          role: inviteRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to invite staff member");
      }

      setSuccessMsg(`Successfully onboarded ${inviteEmail} as ${ROLE_DEFINITIONS[inviteRole].label}`);
      setInviteEmail("");
      setInviteName("");
      setInviteModalOpen(false);
      loadMembers(slug);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInviting(false);
    }
  };

  const handleRoleUpdate = async (userId: string) => {
    setUpdatingRole(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/v1/tenants/${slug}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          role: selectedNewRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to update role");
      }

      setSuccessMsg("Role permissions updated successfully.");
      setEditingUserId(null);
      loadMembers(slug);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdatingRole(false);
    }
  };

  const handleRemoveMember = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to remove ${email} from this organization?`)) {
      return;
    }

    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/v1/tenants/${slug}/members?userId=${userId}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to remove member");
      }

      setSuccessMsg(`Removed ${email} from the organization.`);
      loadMembers(slug);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Filtered members list
  const filteredMembers = React.useMemo(() => {
    return members.filter((m) => {
      const matchesRole = selectedRoleFilter === "ALL" || m.role === selectedRoleFilter;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchesRole;

      const matchesQuery =
        m.user.fullName.toLowerCase().includes(q) ||
        m.user.email.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q);

      return matchesRole && matchesQuery;
    });
  }, [members, selectedRoleFilter, searchQuery]);

  // Executive stats
  const stats = React.useMemo(() => {
    const total = members.length;
    const owners = members.filter((m) => m.role === "ORG_OWNER" || m.role === "INSTITUTION_ADMIN").length;
    const issuers = members.filter((m) => m.role === "CERTIFICATE_ISSUER").length;
    const active = members.filter((m) => m.acceptedAt !== null).length;
    return { total, owners, issuers, active };
  }, [members]);

  const getInitials = (name: string) => {
    const parts = name.split(" ").filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (name[0] || "U").toUpperCase();
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-black/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-[-0.025em] text-[#0F172A]">
              Team Members & Governance
            </h1>
            <Badge variant="outline" className="border-black/[0.08] bg-white text-[#475569] font-mono text-[11px] gap-1.5">
              <Sparkles className="h-3 w-3" />
              Role-Based Access Control
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage institutional staff accounts, assign granular permissions, and govern credential issuance authorities.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadMembers(slug)}
            disabled={loading}
            className="gap-2 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setInviteModalOpen(true)}
            className="gap-2 text-xs shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <UserPlus className="h-4 w-4" />
            <span>Invite Team Member</span>
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Staff Roster
            </span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2">{stats.total}</p>
          <span className="text-[10px] text-muted-foreground">{stats.active} active accounts</span>
        </Card>

        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-blue-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Owners & Admins
            </span>
            <ShieldCheck className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-2">{stats.owners}</p>
          <span className="text-[10px] text-muted-foreground">Full governance authorities</span>
        </Card>

        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-emerald-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Certificate Issuers
            </span>
            <Award className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">{stats.issuers}</p>
          <span className="text-[10px] text-muted-foreground">Batch & revocation operators</span>
        </Card>

        <Card className="p-4 bg-muted/20 border-border shadow-xs hover:border-amber-500/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Active Session Status
            </span>
            <KeyRound className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-2">100%</p>
          <span className="text-[10px] text-muted-foreground">Argon2id password protected</span>
        </Card>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/50 dark:text-red-300 dark:border-red-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Search and Role Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by staff name, email, or role..."
            className="pl-9 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">Role:</span>
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            className="border rounded-md px-2.5 py-1.5 text-xs bg-background text-foreground font-medium"
          >
            <option value="ALL">All Roles ({members.length})</option>
            {(Object.keys(ROLE_DEFINITIONS) as TenantRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_DEFINITIONS[r].label} ({members.filter((m) => m.role === r).length})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Roster Table */}
      <Card className="border shadow-xs overflow-hidden">
        <CardHeader className="p-4 pb-3 border-b border-border/60 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold">Active Staff Directory</CardTitle>
            <CardDescription className="text-xs">
              Showing {filteredMembers.length} authorized operator{filteredMembers.length === 1 ? "" : "s"}
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            RBAC Enforced
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {loading && members.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
              Loading staff accounts...
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Users className="h-8 w-8 text-muted-foreground/60 mx-auto mb-1" />
              <p className="text-sm font-semibold text-foreground">No matching staff members found</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No users match your search query. Try broadening your filter or invite a new member.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-5">Staff Member</th>
                    <th className="py-3 px-4">Assigned Role</th>
                    <th className="py-3 px-4">Permissions Overview</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Onboarded</th>
                    <th className="py-3 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredMembers.map((m) => {
                    const isOwner = m.role === "ORG_OWNER";
                    const isEditing = editingUserId === m.userId;
                    const roleMeta = ROLE_DEFINITIONS[m.role];

                    return (
                      <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-9 w-9 rounded-full bg-gradient-to-tr ${roleMeta?.color || "from-slate-500 to-slate-700"} text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0`}
                            >
                              {getInitials(m.user.fullName)}
                            </div>
                            <div>
                              <div className="font-semibold text-foreground flex items-center gap-1.5">
                                <span>{m.user.fullName}</span>
                                {isOwner && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40 font-mono">
                                    Primary Owner
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground font-mono">{m.user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={selectedNewRole}
                                onChange={(e) => setSelectedNewRole(e.target.value as TenantRole)}
                                className="border rounded px-2 py-1 text-xs bg-background"
                              >
                                {(Object.keys(ROLE_DEFINITIONS) as TenantRole[]).map((r) => (
                                  <option key={r} value={r}>
                                    {ROLE_DEFINITIONS[r].label}
                                  </option>
                                ))}
                              </select>
                              <Button
                                size="sm"
                                className="h-7 text-[10px] bg-primary text-primary-foreground"
                                onClick={() => handleRoleUpdate(m.userId)}
                                disabled={updatingRole}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-[10px]"
                                onClick={() => setEditingUserId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                                roleMeta?.badgeStyle || "bg-muted"
                              }`}
                            >
                              {roleMeta?.label || m.role}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-[11px] max-w-[220px]">
                          <span className="truncate block" title={roleMeta?.desc}>
                            {roleMeta?.desc || "Standard access rights."}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={m.acceptedAt ? "verified" : "outline"}
                            className="text-[10px]"
                          >
                            {m.acceptedAt ? "Active" : "Pending Invite"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                          {m.acceptedAt ? new Date(m.acceptedAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-3 px-5 text-right space-x-1 whitespace-nowrap">
                          {!isEditing && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px]"
                              onClick={() => {
                                setEditingUserId(m.userId);
                                setSelectedNewRole(m.role);
                              }}
                            >
                              Edit Role
                            </Button>
                          )}
                          {!isOwner && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 border-red-200 dark:border-red-800"
                              onClick={() => handleRemoveMember(m.userId, m.user.email)}
                              title="Remove staff member"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Member Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <Card className="w-full max-w-lg border shadow-2xl animate-in fade-in-50 zoom-in-95">
            <form onSubmit={handleInvite}>
              <CardHeader className="flex flex-row items-center justify-between p-5 pb-3 border-b">
                <div>
                  <CardTitle className="text-base font-bold">Invite Institutional Staff</CardTitle>
                  <CardDescription className="text-xs">
                    Assign role capabilities to grant access to credential workflows.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setInviteModalOpen(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold" htmlFor="inviteName">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="inviteName"
                      placeholder="e.g. Dr. Ada Lovelace"
                      className="pl-9 text-xs"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold" htmlFor="inviteEmail">
                    Institutional Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="inviteEmail"
                      type="email"
                      placeholder="alovelace@institution.edu"
                      className="pl-9 text-xs"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="text-xs font-semibold block">Select Role & Permissions</label>
                  <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
                    {(Object.keys(ROLE_DEFINITIONS) as TenantRole[]).map((r) => {
                      const isSelected = inviteRole === r;
                      const meta = ROLE_DEFINITIONS[r];

                      return (
                        <div
                          key={r}
                          onClick={() => setInviteRole(r)}
                          className={`p-3 border rounded-xl cursor-pointer text-xs transition-all ${
                            isSelected
                              ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary/40"
                              : "hover:bg-muted/40 border-border"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-foreground text-xs">{meta.label}</span>
                            <span
                              className={`h-4 w-4 rounded-full border flex items-center justify-center text-[10px] ${
                                isSelected ? "bg-primary border-primary text-white" : "border-muted-foreground/40"
                              }`}
                            >
                              {isSelected && <Check className="h-2.5 w-2.5" />}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mb-2">{meta.desc}</p>
                          <div className="flex flex-wrap gap-1">
                            {meta.permissions.map((p) => (
                              <Badge key={p} variant="secondary" className="text-[9px] font-normal py-0 px-1.5">
                                {p}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
              <div className="flex items-center justify-end gap-2 p-4 border-t bg-muted/20">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setInviteModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={inviting} className="bg-primary text-primary-foreground">
                  {inviting ? "Sending Invitation..." : "Confirm & Send Invitation"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
