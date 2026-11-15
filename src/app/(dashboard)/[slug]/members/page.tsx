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
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TenantMemberRecord } from "@/lib/repositories/tenant-repository";
import { TenantRole } from "@/types";

const ROLE_DEFINITIONS: Record<TenantRole, { label: string; desc: string; color: string }> = {
  ORG_OWNER: {
    label: "Organization Owner",
    desc: "Full governance, signing key management, institutional profile, and owner transfer.",
    color: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
  },
  INSTITUTION_ADMIN: {
    label: "Institution Admin",
    desc: "Staff management, batch creation, template configuration, and credential issuance.",
    color: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
  },
  CERTIFICATE_ISSUER: {
    label: "Certificate Issuer",
    desc: "Ingests CSV/XLSX recipient lists, triggers batch issuance, and executes revocations.",
    color: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
  },
  TEMPLATE_DESIGNER: {
    label: "Template Designer",
    desc: "Builds and customizes visual vector certificate layouts and dynamic placeholders.",
    color: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800",
  },
  READ_ONLY_STAFF: {
    label: "Read-Only Staff",
    desc: "Views credential records, batches, and audit trails without modification rights.",
    color: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700",
  },
};

export default function TenantMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [slug, setSlug] = React.useState<string>("");
  const [members, setMembers] = React.useState<TenantMemberRecord[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

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

  React.useEffect(() => {
    params.then((p) => {
      setSlug(p.slug);
      loadMembers(p.slug);
    });
  }, [params]);

  const loadMembers = async (tenantSlug: string) => {
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
  };

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

      setSuccessMsg(`Successfully invited ${inviteEmail} as ${ROLE_DEFINITIONS[inviteRole].label}`);
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

      setSuccessMsg("Role updated successfully.");
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team Members & Governance</h1>
          <p className="text-xs text-muted-foreground">
            Manage institutional staff accounts and granular Role-Based Access Control (RBAC).
          </p>
        </div>

        <Button
          onClick={() => setInviteModalOpen(true)}
          className="gap-2 text-xs"
        >
          <UserPlus className="h-4 w-4" />
          <span>Invite Team Member</span>
        </Button>
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

      {/* Invite Member Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <Card className="w-full max-w-lg border shadow-lg">
            <form onSubmit={handleInvite}>
              <CardHeader className="flex flex-row items-center justify-between p-5 pb-3">
                <div>
                  <CardTitle className="text-base font-bold">Invite Staff Member</CardTitle>
                  <CardDescription className="text-xs">
                    Assign a role to grant permission to issue credentials or manage templates.
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
              <CardContent className="p-5 pt-0 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" htmlFor="inviteName">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="inviteName"
                      placeholder="e.g. Dr. Alan Turing"
                      className="pl-9 text-xs"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium" htmlFor="inviteEmail">
                    Institutional Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="inviteEmail"
                      type="email"
                      placeholder="registrar@institution.edu"
                      className="pl-9 text-xs"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Assigned Institutional Role</label>
                  <div className="grid grid-cols-1 gap-2">
                    {(Object.keys(ROLE_DEFINITIONS) as TenantRole[]).map((r) => (
                      <label
                        key={r}
                        className={`flex items-start gap-3 p-2.5 border rounded-lg cursor-pointer text-xs transition-colors ${
                          inviteRole === r
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="role"
                          value={r}
                          checked={inviteRole === r}
                          onChange={() => setInviteRole(r)}
                          className="mt-0.5"
                        />
                        <div className="space-y-0.5">
                          <span className="font-semibold text-foreground block">
                            {ROLE_DEFINITIONS[r].label}
                          </span>
                          <span className="text-[11px] text-muted-foreground block">
                            {ROLE_DEFINITIONS[r].desc}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </CardContent>
              <div className="flex items-center justify-end gap-2 p-5 border-t bg-muted/20">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setInviteModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={inviting}>
                  {inviting ? "Inviting..." : "Send Invitation"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Roster Table */}
      <Card className="border shadow-xs overflow-hidden">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base font-bold">Active Staff Directory</CardTitle>
          <CardDescription className="text-xs">
            Users who possess authorized access to this institutional tenant.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Loading staff roster...</div>
          ) : members.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No staff members registered. Use the invite button above to onboard team members.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-y text-muted-foreground uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-5">Staff Member</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Accepted Date</th>
                    <th className="py-3 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {members.map((m) => {
                    const isOwner = m.role === "ORG_OWNER";
                    const isEditing = editingUserId === m.userId;

                    return (
                      <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-5">
                          <div className="font-medium text-foreground">{m.user.fullName}</div>
                          <div className="text-[11px] text-muted-foreground">{m.user.email}</div>
                        </td>
                        <td className="py-3 px-4">
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
                                className="h-7 text-[10px]"
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
                                ROLE_DEFINITIONS[m.role]?.color || "bg-muted"
                              }`}
                            >
                              {ROLE_DEFINITIONS[m.role]?.label || m.role}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className="text-[10px]">
                            {m.acceptedAt ? "Active" : "Pending"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
                          {m.acceptedAt ? new Date(m.acceptedAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-3 px-5 text-right space-x-1">
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
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleRemoveMember(m.userId, m.user.email)}
                            title={isOwner ? "Sole owners cannot be removed" : "Remove staff member"}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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
    </div>
  );
}
