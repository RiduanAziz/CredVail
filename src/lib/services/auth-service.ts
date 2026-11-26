import { z } from "zod";
import { UserRepository } from "@/lib/repositories/user-repository";
import { EmailVerificationRepository } from "@/lib/repositories/email-verification-repository";
import { hashPassword, verifyPassword, passwordSchema } from "@/lib/auth/password";
import { createSessionToken, SessionPayload } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/validation/registration";
import { getPostLoginRedirectPath } from "./registration-service";

export const registerInputSchema = z.object({
  email: z.string().trim().email("Invalid email address").transform(normalizeEmail),
  password: passwordSchema,
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters long"),
});

export const loginInputSchema = z.object({
  email: z.string().trim().email("Invalid email address").transform(normalizeEmail),
  password: z.string().min(1, "Password is required"),
  targetTenantId: z.string().optional(),
});

export class EmailNotVerifiedError extends Error {
  public readonly code = "EMAIL_NOT_VERIFIED";
  public readonly email: string;

  constructor(email: string, message: string = "Please verify your email address before signing in.") {
    super(message);
    this.name = "EmailNotVerifiedError";
    this.email = email;
  }
}

export class AuthService {
  private userRepo: UserRepository;

  constructor(userRepo?: UserRepository) {
    this.userRepo = userRepo || new UserRepository();
  }

  /**
   * Registers a platform user with Argon2id hashing and an unverified email state.
   * Requires email verification before full authenticated login is permitted.
   */
  async register(input: z.infer<typeof registerInputSchema>) {
    const validated = registerInputSchema.parse(input);
    const email = normalizeEmail(validated.email);

    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw new Error("A user with this email address already exists");
    }

    const passwordHash = await hashPassword(validated.password);
    const user = await this.userRepo.create({
      email,
      passwordHash,
      fullName: validated.fullName,
      platformRole: "USER",
      emailVerifiedAt: null,
    });

    const { rawToken } = await EmailVerificationRepository.createToken(user.id);
    const token = createSessionToken(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        platformRole: user.platformRole,
        emailVerified: false,
      },
      token,
      verificationToken: rawToken,
    };
  }

  /**
   * Authenticates a user against their Argon2id password hash and issues a session token.
   * Fails closed if the user's email has not yet been verified.
   */
  async login(input: z.infer<typeof loginInputSchema>) {
    const validated = loginInputSchema.parse(input);
    const email = normalizeEmail(validated.email);

    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new Error("Invalid email or password");
    }

    const isValid = await verifyPassword(validated.password, user.passwordHash);
    if (!isValid) {
      throw new Error("Invalid email or password");
    }

    if (!user.emailVerifiedAt) {
      throw new EmailNotVerifiedError(user.email);
    }

    const userWithMemberships = await this.userRepo.findWithMemberships(user.id);
    const acceptedMemberships = (userWithMemberships?.memberships || []).filter(
      (m) => m.acceptedAt !== null
    );
    const token = createSessionToken(
      userWithMemberships || user,
      validated.targetTenantId
    );
    const redirectPath = getPostLoginRedirectPath({
      platformRole: user.platformRole,
      tenants: acceptedMemberships.map((m) => ({
        tenantId: m.tenantId,
        slug: m.tenant.slug,
        name: m.tenant.name,
        role: m.role,
      })),
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        preferredDisplayName: user.preferredDisplayName ?? null,
        jobTitle: user.jobTitle ?? null,
        phoneNumber: user.phoneNumber ?? null,
        platformRole: user.platformRole,
        emailVerified: true,
        memberships: acceptedMemberships,
        redirectPath,
      },
      token,
    };
  }

  /**
   * Retrieves profile details and active memberships from a verified session token.
   */
  async getProfile(session: SessionPayload) {
    const userWithMemberships = await this.userRepo.findWithMemberships(session.sub);
    if (!userWithMemberships) {
      throw new Error("User record not found");
    }

    return {
      id: userWithMemberships.id,
      email: userWithMemberships.email,
      fullName: userWithMemberships.fullName,
      preferredDisplayName: userWithMemberships.preferredDisplayName ?? null,
      jobTitle: userWithMemberships.jobTitle ?? null,
      phoneNumber: userWithMemberships.phoneNumber ?? null,
      platformRole: userWithMemberships.platformRole,
      emailVerified: Boolean(userWithMemberships.emailVerifiedAt),
      emailVerifiedAt: userWithMemberships.emailVerifiedAt?.toISOString() ?? null,
      memberships: userWithMemberships.memberships,
    };
  }
}
