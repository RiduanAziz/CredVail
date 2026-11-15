import { z } from "zod";
import { UserRepository } from "@/lib/repositories/user-repository";
import { hashPassword, verifyPassword, passwordSchema } from "@/lib/auth/password";
import { createSessionToken, verifySessionToken, SessionPayload } from "@/lib/auth/session";

export const registerInputSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: passwordSchema,
  fullName: z.string().min(2, "Full name must be at least 2 characters long"),
});

export const loginInputSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  targetTenantId: z.string().optional(),
});

export class AuthService {
  private userRepo: UserRepository;

  constructor(userRepo?: UserRepository) {
    this.userRepo = userRepo || new UserRepository();
  }

  /**
   * Registers a new platform user with Argon2id password hashing.
   */
  async register(input: z.infer<typeof registerInputSchema>) {
    const validated = registerInputSchema.parse(input);

    const existing = await this.userRepo.findByEmail(validated.email);
    if (existing) {
      throw new Error("A user with this email address already exists");
    }

    const passwordHash = await hashPassword(validated.password);
    const user = await this.userRepo.create({
      email: validated.email,
      passwordHash,
      fullName: validated.fullName,
      platformRole: "USER",
    });

    const token = createSessionToken(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        platformRole: user.platformRole,
      },
      token,
    };
  }

  /**
   * Authenticates a user against their Argon2id password hash and issues a session token.
   */
  async login(input: z.infer<typeof loginInputSchema>) {
    const validated = loginInputSchema.parse(input);

    const user = await this.userRepo.findByEmail(validated.email);
    if (!user) {
      throw new Error("Invalid email or password");
    }

    const isValid = await verifyPassword(validated.password, user.passwordHash);
    if (!isValid) {
      throw new Error("Invalid email or password");
    }

    const userWithMemberships = await this.userRepo.findWithMemberships(user.id);
    const token = createSessionToken(
      userWithMemberships || user,
      validated.targetTenantId
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        platformRole: user.platformRole,
        memberships: userWithMemberships?.memberships || [],
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
      platformRole: userWithMemberships.platformRole,
      memberships: userWithMemberships.memberships,
    };
  }
}
