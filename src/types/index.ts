// CREDVAIL Core Type Definitions

export * from "./template.ts";

export type VerificationState =
  | "VALID_CURRENT"
  | "REVOKED"
  | "AUTHENTICITY_ONLY"
  | "STATUS_UNKNOWN"
  | "INVALID";

export type PlatformRole = "SUPER_ADMIN" | "PLATFORM_AUDITOR" | "USER";

export type TenantRole =
  | "ORG_OWNER"
  | "INSTITUTION_ADMIN"
  | "CERTIFICATE_ISSUER"
  | "TEMPLATE_DESIGNER"
  | "READ_ONLY_STAFF";

export type VerificationStatus =
  | "UNVERIFIED"
  | "PENDING"
  | "VERIFIED"
  | "SUSPENDED";

export type BatchStatus =
  | "DRAFT"
  | "PROCESSING"
  | "GENERATED"
  | "ANCHORED"
  | "FAILED";

export type CredentialState =
  | "ISSUED"
  | "SUSPENDED"
  | "REVOKED";

export interface TenantBrandingConfig {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  darkLogoUrl?: string;
  certificateBorderUrl?: string;
  signatureTitle?: string;
  tagline?: string;
}

export interface TenantAnalyticsOverview {
  totalCredentials: number;
  activeCredentials: number;
  revokedCredentials: number;
  suspendedCredentials: number;
  totalBatches: number;
  anchoredBatches: number;
  pendingBatches: number;
  failedBatches: number;
  totalTemplates: number;
  totalMembers: number;
  verificationRequests: number;
  verificationSuccessRate: number;
  recentActivity: Array<{
    id: string;
    action: string;
    description: string;
    timestamp: string;
    userEmail?: string;
  }>;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string | null;
  userId: string | null;
  userEmail?: string;
  userFullName?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  ipHash: string;
  userAgent?: string | null;
  createdAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface MerkleInclusionProof {
  leafHash: `0x${string}`;
  root: `0x${string}`;
  proof: `0x${string}`[];
  index: number;
  totalLeaves: number;
}

export interface VerificationEvaluation {
  outcome: VerificationState;
  issuer: {
    did: string;
    name: string;
    verifiedDomain: string;
    keyEpoch: number;
    keyCompromised: boolean;
  };
  integrity: {
    signatureValid: boolean;
    merkleInclusionValid: boolean;
    batchAnchoredOnChain: boolean;
    blockNumber?: number;
  };
  revocation: {
    isRevoked: boolean;
    revocationReason?: string;
    statusEpoch: number;
    statusFresh: boolean;
    anchoredDigestMatches: boolean;
  };
  claims: Record<string, unknown>;
  evaluatedAt: string;
}
