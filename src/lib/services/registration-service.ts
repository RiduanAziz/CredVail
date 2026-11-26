import crypto from "node:crypto";
import { db } from "../db.ts";
import { hashPassword } from "../auth/password.ts";
import {
  createSessionToken,
  type SessionPayload,
} from "../auth/session.ts";
import { isInMemoryFallbackPermissible, handleRepositoryError } from "../db/persistence-policy.ts";
import { UserRepository, inMemoryUserStore } from "../repositories/user-repository.ts";
import { TenantRepository, inMemoryTenantStore } from "../repositories/tenant-repository.ts";
import { EmailVerificationRepository } from "../repositories/email-verification-repository.ts";
import { VerificationMailer } from "../email/verification-mailer.ts";
import { TenantService } from "./tenant-service.ts";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  institutionRegistrationSchema,
  normalizeEmail,
  walletRegistrationSchema,
} from "../validation/registration.ts";

export interface RegistrationResult {
  accepted: boolean;
  accountType: "institution" | "wallet";
  requiresEmailVerification: true;
  emailDeliveryPending: boolean;
  message: string;
  tenantSlug?: string;
  devPreviewUrl?: string;
}

export interface EmailVerificationOutcome {
  verified: true;
  user: {
    id: string;
    email: string;
    fullName: string;
    platformRole: string;
    emailVerified: true;
    memberships: Array<{
      tenantId: string;
      role: string;
      acceptedAt?: Date | null;
      tenant: { id: string; slug: string; name: string; didUri: string };
    }>;
  };
  token: string;
  redirectPath: string;
}

export class PrivilegeEscalationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivilegeEscalationError";
  }
}

export class SlugConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlugConflictError";
  }
}

function isPrismaUniqueConstraintError(err: unknown, targetField?: string): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  if (code !== "P2002") return false;
  if (!targetField) return true;
  const target = (err as { meta?: { target?: string[] | string } }).meta?.target;
  if (Array.isArray(target)) return target.some((t) => String(t).includes(targetField));
  if (typeof target === "string") return target.includes(targetField);
  return false;
}

function assertNoForbiddenClientPrivilegeFields(rawPayload: unknown): void {
  if (!rawPayload || typeof rawPayload !== "object") return;
  const obj = rawPayload as Record<string, unknown>;
  if (obj.platformRole !== undefined && obj.platformRole !== "USER") {
    throw new PrivilegeEscalationError("Forbidden: platformRole cannot be assigned by registration payload.");
  }
  if (obj.role !== undefined) {
    throw new PrivilegeEscalationError("Forbidden: role cannot be assigned via public registration.");
  }
  if (obj.emailVerified !== undefined || obj.emailVerifiedAt !== undefined) {
    throw new PrivilegeEscalationError("Forbidden: email verification state cannot be client-supplied.");
  }
  if (obj.verificationStatus !== undefined && obj.verificationStatus !== "PENDING") {
    throw new PrivilegeEscalationError("Forbidden: institutional verificationStatus cannot be client-supplied.");
  }
}

export class RegistrationService {
  private userRepo: UserRepository;
  private tenantRepo: TenantRepository;

  constructor(userRepo?: UserRepository, tenantRepo?: TenantRepository) {
    this.userRepo = userRepo || new UserRepository();
    this.tenantRepo = tenantRepo || new TenantRepository();
  }

  private get useMemory(): boolean {
    if (!isInMemoryFallbackPermissible()) return false;
    return !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");
  }

  private deriveSafeBaseSlug(name: string, explicitSlug?: string): string {
    if (explicitSlug && explicitSlug.trim().length > 0) {
      return explicitSlug.trim().toLowerCase();
    }
    const base = TenantService.generateSlug(name);
    if (base.length >= 3) {
      return base.slice(0, 48);
    }
    return `org-${crypto.randomBytes(3).toString("hex")}`;
  }

  async registerWallet(
    rawPayload: unknown,
    options?: { baseUrl?: string; ipHash?: string }
  ): Promise<RegistrationResult> {
    assertNoForbiddenClientPrivilegeFields(rawPayload);
    const validated = walletRegistrationSchema.parse(rawPayload);
    const email = normalizeEmail(validated.email);
    const passwordHash = await hashPassword(validated.password);
    const consentTimestamp = new Date();

    const genericSuccessMessage =
      "If your email is eligible, a verification link has been prepared to activate your CREDVAIL personal wallet.";

    let createdUserId: string | null = null;
    let rawVerificationToken: string | null = null;

    if (this.useMemory) {
      const existing = await inMemoryUserStore.findByEmail(email);
      if (existing) {
        return {
          accepted: true,
          accountType: "wallet",
          requiresEmailVerification: true,
          emailDeliveryPending: false,
          message: genericSuccessMessage,
        };
      }

      let rollbackUserId: string | null = null;
      try {
        const user = await inMemoryUserStore.create({
          email,
          passwordHash,
          fullName: validated.fullName,
          preferredDisplayName: validated.preferredDisplayName,
          platformRole: "USER",
          emailVerifiedAt: null,
          termsAcceptedAt: consentTimestamp,
          privacyAcceptedAt: consentTimestamp,
          termsVersion: CURRENT_TERMS_VERSION,
          privacyVersion: CURRENT_PRIVACY_VERSION,
          marketingOptIn: Boolean(validated.marketingOptIn),
        });
        rollbackUserId = user.id;

        const tokenRes = await EmailVerificationRepository.createToken(user.id);
        await inMemoryTenantStore.recordAuditLog({
          userId: user.id,
          userEmail: user.email,
          action: "WALLET_ACCOUNT_REGISTERED",
          resourceType: "User",
          resourceId: user.id,
          ipHash: options?.ipHash,
          metadata: {
            termsVersion: CURRENT_TERMS_VERSION,
            privacyVersion: CURRENT_PRIVACY_VERSION,
            marketingOptIn: Boolean(validated.marketingOptIn),
          },
        });

        createdUserId = user.id;
        rawVerificationToken = tokenRes.rawToken;
      } catch (err) {
        if (rollbackUserId) {
          inMemoryUserStore.deleteUser(rollbackUserId);
        }
        throw err;
      }
    } else {
      try {
        const txResult = await db.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email,
              passwordHash,
              fullName: validated.fullName,
              preferredDisplayName: validated.preferredDisplayName,
              platformRole: "USER",
              emailVerifiedAt: null,
              termsAcceptedAt: consentTimestamp,
              privacyAcceptedAt: consentTimestamp,
              termsVersion: CURRENT_TERMS_VERSION,
              privacyVersion: CURRENT_PRIVACY_VERSION,
              marketingOptIn: Boolean(validated.marketingOptIn),
            },
          });

          const tokenRes = await EmailVerificationRepository.createToken(user.id, { tx });

          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: "WALLET_ACCOUNT_REGISTERED",
              resourceType: "User",
              resourceId: user.id,
              ipHash: options?.ipHash || "0".repeat(64),
              metadata: {
                termsVersion: CURRENT_TERMS_VERSION,
                privacyVersion: CURRENT_PRIVACY_VERSION,
                marketingOptIn: Boolean(validated.marketingOptIn),
              },
            },
          });

          return { userId: user.id, rawToken: tokenRes.rawToken };
        });

        createdUserId = txResult.userId;
        rawVerificationToken = txResult.rawToken;
      } catch (err) {
        if (isPrismaUniqueConstraintError(err, "email") || isPrismaUniqueConstraintError(err)) {
          return {
            accepted: true,
            accountType: "wallet",
            requiresEmailVerification: true,
            emailDeliveryPending: false,
            message: genericSuccessMessage,
          };
        }
        handleRepositoryError("RegistrationService.registerWallet", err);
        throw err;
      }
    }

    if (createdUserId && rawVerificationToken) {
      const mailOutcome = await VerificationMailer.sendVerificationEmail({
        to: email,
        fullName: validated.fullName,
        rawToken: rawVerificationToken,
        accountType: "wallet",
        baseUrl: options?.baseUrl,
      });

      return {
        accepted: true,
        accountType: "wallet",
        requiresEmailVerification: true,
        emailDeliveryPending: !mailOutcome.delivered,
        message: mailOutcome.delivered
          ? genericSuccessMessage
          : "Account created, but verification email delivery is pending. Use resend verification to receive a new link.",
        ...(mailOutcome.devPreviewUrl ? { devPreviewUrl: mailOutcome.devPreviewUrl } : {}),
      };
    }

    return {
      accepted: true,
      accountType: "wallet",
      requiresEmailVerification: true,
      emailDeliveryPending: false,
      message: genericSuccessMessage,
    };
  }

  async registerInstitution(
    rawPayload: unknown,
    options?: {
      baseUrl?: string;
      ipHash?: string;
      failAfterUserHookForTesting?: () => void;
    }
  ): Promise<RegistrationResult> {
    assertNoForbiddenClientPrivilegeFields(rawPayload);
    const validated = institutionRegistrationSchema.parse(rawPayload);
    const email = normalizeEmail(validated.email);
    const passwordHash = await hashPassword(validated.password);
    const now = new Date();
    const didDomain = process.env.NEXT_PUBLIC_DID_DOMAIN || "credvail.io";

    const genericConflictMessage =
      "If your administrator email is eligible, verification instructions have been prepared for your institutional workspace.";

    let createdSlug = "";
    let rawVerificationToken = "";

    if (this.useMemory) {
      const existingUser = await inMemoryUserStore.findByEmail(email);
      if (existingUser) {
        return {
          accepted: true,
          accountType: "institution",
          requiresEmailVerification: true,
          emailDeliveryPending: false,
          message: genericConflictMessage,
        };
      }

      let candidateSlug = this.deriveSafeBaseSlug(validated.name, validated.slug);
      const existingTenant = await inMemoryTenantStore.findBySlug(candidateSlug);
      if (existingTenant) {
        if (validated.slug) {
          throw new SlugConflictError(`Institution slug '${candidateSlug}' is already taken.`);
        }
        candidateSlug = `${candidateSlug.slice(0, 40)}-${crypto.randomBytes(3).toString("hex")}`;
      }

      let rollbackUserId: string | null = null;
      let rollbackTenantId: string | null = null;
      try {
        const user = await inMemoryUserStore.create({
          email,
          passwordHash,
          fullName: validated.fullName,
          jobTitle: validated.jobTitle,
          phoneNumber: validated.phoneNumber,
          platformRole: "USER",
          emailVerifiedAt: null,
          termsAcceptedAt: now,
          privacyAcceptedAt: now,
          termsVersion: CURRENT_TERMS_VERSION,
          privacyVersion: CURRENT_PRIVACY_VERSION,
          marketingOptIn: Boolean(validated.marketingOptIn),
        });
        rollbackUserId = user.id;

        if (options?.failAfterUserHookForTesting) {
          options.failAfterUserHookForTesting();
        }

        const didUri = `did:web:${didDomain}:tenants:${candidateSlug}`;
        const tenant = await inMemoryTenantStore.create({
          slug: candidateSlug,
          name: validated.name,
          legalEntityName: validated.legalEntityName,
          websiteUrl: validated.websiteUrl,
          organizationType: validated.organizationType,
          organizationTypeOther:
            validated.organizationType === "OTHER" ? validated.organizationTypeOther || null : null,
          countryCode: validated.operatingCountryCode,
          registrationNumber: validated.registrationNumber,
          registrationAuthority: validated.registrationAuthority,
          addressLine1: validated.addressLine1,
          addressLine2: validated.addressLine2,
          city: validated.city,
          region: validated.region,
          postalCode: validated.postalCode,
          contactPhone: validated.contactPhone,
          adminContactPosition: validated.jobTitle,
          authorizedToRegisterAt: now,
          didUri,
          ownerUserId: user.id,
          ownerEmail: user.email,
          ownerFullName: user.fullName,
        });
        rollbackTenantId = tenant.id;
        createdSlug = tenant.slug;

        const tokenRes = await EmailVerificationRepository.createToken(user.id);
        rawVerificationToken = tokenRes.rawToken;

        await inMemoryTenantStore.recordAuditLog({
          tenantId: tenant.id,
          userId: user.id,
          userEmail: user.email,
          action: "INSTITUTION_REGISTERED",
          resourceType: "Tenant",
          resourceId: tenant.id,
          ipHash: options?.ipHash,
          metadata: {
            slug: tenant.slug,
            organizationType: validated.organizationType,
            countryCode: validated.operatingCountryCode,
            verificationStatus: "PENDING",
            termsVersion: CURRENT_TERMS_VERSION,
            privacyVersion: CURRENT_PRIVACY_VERSION,
          },
        });
      } catch (err) {
        if (rollbackTenantId) {
          // Roll back in-memory tenant + membership cleanly if token/audit creation fails
          const members = await inMemoryTenantStore.listMembers(rollbackTenantId);
          for (const m of members) {
            await inMemoryTenantStore.removeMember(rollbackTenantId, m.userId);
          }
        }
        if (rollbackUserId) {
          inMemoryUserStore.deleteUser(rollbackUserId);
        }
        throw err;
      }
    } else {
      try {
        const txResult = await db.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email,
              passwordHash,
              fullName: validated.fullName,
              jobTitle: validated.jobTitle,
              phoneNumber: validated.phoneNumber,
              platformRole: "USER",
              emailVerifiedAt: null,
              termsAcceptedAt: now,
              privacyAcceptedAt: now,
              termsVersion: CURRENT_TERMS_VERSION,
              privacyVersion: CURRENT_PRIVACY_VERSION,
              marketingOptIn: Boolean(validated.marketingOptIn),
            },
          });

          if (options?.failAfterUserHookForTesting) {
            options.failAfterUserHookForTesting();
          }

          let candidateSlug = this.deriveSafeBaseSlug(validated.name, validated.slug);
          const takenSlug = await tx.tenant.findUnique({ where: { slug: candidateSlug } });
          if (takenSlug) {
            if (validated.slug) {
              throw new SlugConflictError(`Institution slug '${candidateSlug}' is already taken.`);
            }
            candidateSlug = `${candidateSlug.slice(0, 40)}-${crypto.randomBytes(3).toString("hex")}`;
          }

          const didUri = `did:web:${didDomain}:tenants:${candidateSlug}`;
          const tenant = await tx.tenant.create({
            data: {
              slug: candidateSlug,
              name: validated.name,
              legalEntityName: validated.legalEntityName,
              websiteUrl: validated.websiteUrl,
              organizationType: validated.organizationType as any,
              organizationTypeOther:
                validated.organizationType === "OTHER"
                  ? validated.organizationTypeOther || null
                  : null,
              countryCode: validated.operatingCountryCode,
              registrationNumber: validated.registrationNumber,
              registrationAuthority: validated.registrationAuthority,
              addressLine1: validated.addressLine1,
              addressLine2: validated.addressLine2,
              city: validated.city,
              region: validated.region,
              postalCode: validated.postalCode,
              contactPhone: validated.contactPhone,
              adminContactPosition: validated.jobTitle,
              authorizedToRegisterAt: now,
              didUri,
              verificationStatus: "PENDING",
              memberships: {
                create: {
                  userId: user.id,
                  role: "ORG_OWNER",
                  acceptedAt: now,
                },
              },
            },
          });

          const tokenRes = await EmailVerificationRepository.createToken(user.id, { tx });

          await tx.auditLog.create({
            data: {
              tenantId: tenant.id,
              userId: user.id,
              action: "INSTITUTION_REGISTERED",
              resourceType: "Tenant",
              resourceId: tenant.id,
              ipHash: options?.ipHash || "0".repeat(64),
              metadata: {
                slug: tenant.slug,
                organizationType: validated.organizationType,
                countryCode: validated.operatingCountryCode,
                verificationStatus: "PENDING",
                termsVersion: CURRENT_TERMS_VERSION,
                privacyVersion: CURRENT_PRIVACY_VERSION,
              },
            },
          });

          return {
            slug: tenant.slug,
            rawToken: tokenRes.rawToken,
          };
        });

        createdSlug = txResult.slug;
        rawVerificationToken = txResult.rawToken;
      } catch (err) {
        if (err instanceof SlugConflictError) {
          throw err;
        }
        if (isPrismaUniqueConstraintError(err, "email")) {
          return {
            accepted: true,
            accountType: "institution",
            requiresEmailVerification: true,
            emailDeliveryPending: false,
            message: genericConflictMessage,
          };
        }
        if (isPrismaUniqueConstraintError(err, "slug") || isPrismaUniqueConstraintError(err, "didUri")) {
          throw new SlugConflictError("Institution identifier conflicted with an existing registration. Please retry.");
        }
        handleRepositoryError("RegistrationService.registerInstitution", err);
        throw err;
      }
    }

    const mailOutcome = await VerificationMailer.sendVerificationEmail({
      to: email,
      fullName: validated.fullName,
      rawToken: rawVerificationToken,
      accountType: "institution",
      institutionName: validated.name,
      baseUrl: options?.baseUrl,
    });

    return {
      accepted: true,
      accountType: "institution",
      requiresEmailVerification: true,
      emailDeliveryPending: !mailOutcome.delivered,
      tenantSlug: createdSlug,
      message: mailOutcome.delivered
        ? genericConflictMessage
        : "Institutional account registered, but verification email delivery failed. Use resend verification to receive a new link.",
      ...(mailOutcome.devPreviewUrl ? { devPreviewUrl: mailOutcome.devPreviewUrl } : {}),
    };
  }

  async verifyEmail(
    rawToken: string,
    options?: { ipHash?: string }
  ): Promise<EmailVerificationOutcome> {
    const { user, verifiedAt } = await EmailVerificationRepository.consumeAndVerifyUser(rawToken);
    const acceptedMemberships = (user.memberships || []).filter((m) => m.acceptedAt !== null);

    await this.tenantRepo.recordAuditLog({
      tenantId: acceptedMemberships[0]?.tenantId,
      userId: user.id,
      userEmail: user.email,
      action: "EMAIL_VERIFIED",
      resourceType: "User",
      resourceId: user.id,
      ipHash: options?.ipHash,
      metadata: {
        verifiedAt: verifiedAt.toISOString(),
        membershipCount: acceptedMemberships.length,
      },
    });

    const token = createSessionToken(user, acceptedMemberships[0]?.tenantId);
    const redirectPath =
      user.platformRole === "SUPER_ADMIN"
        ? "/admin"
        : acceptedMemberships.length > 0
        ? `/${acceptedMemberships[0].tenant.slug}`
        : "/wallet";

    return {
      verified: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        platformRole: user.platformRole,
        emailVerified: true,
        memberships: acceptedMemberships,
      },
      token,
      redirectPath,
    };
  }

  async resendVerification(
    rawEmail: string,
    options?: { baseUrl?: string; ipHash?: string }
  ): Promise<{
    accepted: boolean;
    message: string;
    emailDeliveryPending?: boolean;
    devPreviewUrl?: string;
  }> {
    const email = normalizeEmail(rawEmail);
    const genericMessage =
      "If an unverified account exists for that email address, a fresh verification link has been sent.";

    const user = await this.userRepo.findWithMemberships(
      (await this.userRepo.findByEmail(email))?.id || "__nonexistent__"
    );

    if (!user || user.emailVerifiedAt) {
      return { accepted: true, message: genericMessage };
    }

    const { rawToken } = await EmailVerificationRepository.createToken(user.id, {
      invalidateExisting: true,
    });

    const firstMembership = user.memberships?.[0];
    const mailOutcome = await VerificationMailer.sendVerificationEmail({
      to: user.email,
      fullName: user.fullName,
      rawToken,
      accountType: firstMembership ? "institution" : "wallet",
      institutionName: firstMembership?.tenant?.name,
      baseUrl: options?.baseUrl,
    });

    await this.tenantRepo.recordAuditLog({
      tenantId: firstMembership?.tenantId,
      userId: user.id,
      userEmail: user.email,
      action: "EMAIL_VERIFICATION_RESENT",
      resourceType: "User",
      resourceId: user.id,
      ipHash: options?.ipHash,
      metadata: { delivered: mailOutcome.delivered },
    });

    return {
      accepted: true,
      message: genericMessage,
      emailDeliveryPending: !mailOutcome.delivered,
      ...(mailOutcome.devPreviewUrl ? { devPreviewUrl: mailOutcome.devPreviewUrl } : {}),
    };
  }
}

export function getPostLoginRedirectPath(session: Pick<SessionPayload, "platformRole" | "tenants">): string {
  if (session.platformRole === "SUPER_ADMIN") {
    return "/admin";
  }
  if (session.tenants && session.tenants.length > 0) {
    return `/${session.tenants[0].slug}`;
  }
  return "/wallet";
}
