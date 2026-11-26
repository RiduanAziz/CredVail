import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  RegistrationService,
  SlugConflictError,
  PrivilegeEscalationError,
} from "@/lib/services/registration-service";
import { AuthService, EmailNotVerifiedError } from "@/lib/services/auth-service";
import { TenantService } from "@/lib/services/tenant-service";
import { VerificationMailer } from "@/lib/email/verification-mailer";
import { EmailVerificationRepository } from "@/lib/repositories/email-verification-repository";
import { inMemoryUserStore } from "@/lib/repositories/user-repository";
import { inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { verifySessionToken } from "@/lib/auth/session";
import { inMemoryApiRateLimitStore } from "@/lib/services/api-rate-limiter";
import {
  institutionRegistrationSchema,
  walletRegistrationSchema,
  normalizeEmail,
} from "@/lib/validation/registration";
import { POST as registerWalletPost } from "@/app/api/v1/auth/register/wallet/route";
import { POST as registerInstitutionPost } from "@/app/api/v1/auth/register/institution/route";
import { POST as verifyEmailPost } from "@/app/api/v1/auth/verify-email/route";
import { POST as resendVerificationPost } from "@/app/api/v1/auth/resend-verification/route";
import { POST as loginPost } from "@/app/api/v1/auth/login/route";
import { POST as legacyRegisterPost } from "@/app/api/v1/auth/register/route";

function extractRawTokenFromUrl(url: string): string {
  const parsed = new URL(url);
  return parsed.searchParams.get("token") || "";
}

function makeInstitutionPayload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Dr. Éléonore O'Connor-Vance",
    email: "  REGISTRAR@OXFORD-DEMO.EDU ",
    jobTitle: "University Registrar",
    phoneNumber: "+44 1865 270000",
    password: "oxford trust institutional passphrase",
    confirmPassword: "oxford trust institutional passphrase",
    name: "Oxford Demo Institute",
    legalEntityName: "Oxford Demo Educational Trust",
    organizationType: "UNIVERSITY",
    operatingCountryCode: "GB",
    websiteUrl: "https://oxford-demo.edu",
    registrationNumber: "UK-REG-88219",
    registrationAuthority: "Office for Students",
    addressLine1: "Wellington Square",
    city: "Oxford",
    region: "Oxfordshire",
    postalCode: "OX1 2JD",
    addressCountryCode: "GB",
    contactPhone: "+44 1865 270100",
    authorizedToRegister: true,
    termsAccepted: true,
    privacyAccepted: true,
    marketingOptIn: false,
    ...overrides,
  };
}

describe("Dual Account Onboarding, Email Verification & Security Controls", () => {
  const registrationService = new RegistrationService();
  const authService = new AuthService();
  const tenantService = new TenantService();

  beforeEach(() => {
    inMemoryUserStore.clear();
    inMemoryTenantStore.clear();
    EmailVerificationRepository.resetInMemoryStore();
    VerificationMailer.resetForTesting();
    inMemoryApiRateLimitStore.clear();
  });

  describe("Validation schemas & Unicode/country rules", () => {
    it("accepts international Unicode names, optional website, and enforces OTHER description", () => {
      expect(normalizeEmail("  User.Name@Example.EDU ")).toBe("user.name@example.edu");

      const unicodeWallet = walletRegistrationSchema.safeParse({
        fullName: "Joséphine d'Artagnan-Müller",
        email: "josephine@example.org",
        password: "correct horse battery staple",
        confirmPassword: "correct horse battery staple",
        termsAccepted: true,
        privacyAccepted: true,
      });
      expect(unicodeWallet.success).toBe(true);

      const otherMissing = institutionRegistrationSchema.safeParse(
        makeInstitutionPayload({ organizationType: "OTHER", organizationTypeOther: "" })
      );
      expect(otherMissing.success).toBe(false);

      const otherValid = institutionRegistrationSchema.safeParse(
        makeInstitutionPayload({
          organizationType: "OTHER",
          organizationTypeOther: "Accredited Examination Syndicate",
          websiteUrl: "",
        })
      );
      expect(otherValid.success).toBe(true);
    });
  });

  describe("Atomic Institutional & Personal Wallet Registration Lifecycles", () => {
    it("registers wallet user without creating any tenant, blocks unverified login, verifies once, and routes to /wallet", async () => {
      const res = await registrationService.registerWallet({
        fullName: "Alex Rivera",
        email: "alex@wallet-demo.org",
        password: "my personal wallet passphrase",
        confirmPassword: "my personal wallet passphrase",
        termsAccepted: true,
        privacyAccepted: true,
      });

      expect(res.accepted).toBe(true);
      expect(res.requiresEmailVerification).toBe(true);
      expect(inMemoryTenantStore.listAllTenants()).toHaveLength(0);

      const user = await inMemoryUserStore.findByEmail("alex@wallet-demo.org");
      expect(user).not.toBeNull();
      expect(user?.emailVerifiedAt).toBeNull();

      // Token stored hashed ONLY (raw token not equal to stored tokenHash)
      const tokens = EmailVerificationRepository.listInMemoryTokenRecordsForUser(user!.id);
      expect(tokens).toHaveLength(1);
      const sentMail = VerificationMailer.getLatestPreviewForEmail("alex@wallet-demo.org");
      expect(sentMail).toBeDefined();
      const rawToken = extractRawTokenFromUrl(sentMail!.verificationUrl);
      expect(rawToken).toBeTruthy();
      expect(tokens[0].tokenHash).not.toBe(rawToken);
      expect(tokens[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);

      // Unverified user login fails closed
      await expect(
        authService.login({
          email: "alex@wallet-demo.org",
          password: "my personal wallet passphrase",
        })
      ).rejects.toThrow(EmailNotVerifiedError);

      // Verify email once -> marks verified, issues session, redirects to /wallet
      const verified = await registrationService.verifyEmail(rawToken);
      expect(verified.verified).toBe(true);
      expect(verified.redirectPath).toBe("/wallet");
      const session = verifySessionToken(verified.token);
      expect(session?.emailVerified).toBe(true);
      expect(session?.tenants).toHaveLength(0);

      // Token replay rejected
      await expect(registrationService.verifyEmail(rawToken)).rejects.toThrow(/already been used/i);
    });

    it("registers institution atomically (User + Tenant + ORG_OWNER + VerificationToken) and preserves PENDING status", async () => {
      const res = await registrationService.registerInstitution(makeInstitutionPayload());
      expect(res.accepted).toBe(true);
      expect(res.tenantSlug).toBe("oxford-demo-institute");

      const tenant = await inMemoryTenantStore.findBySlug("oxford-demo-institute");
      expect(tenant).not.toBeNull();
      expect(tenant?.verificationStatus).toBe("PENDING");
      expect(tenant?.organizationType).toBe("UNIVERSITY");
      expect(tenant?.countryCode).toBe("GB");
      expect(tenant?.registrationNumber).toBe("UK-REG-88219");

      const members = await inMemoryTenantStore.listMembers(tenant!.id);
      expect(members).toHaveLength(1);
      expect(members[0].role).toBe("ORG_OWNER");

      const sent = VerificationMailer.getLatestPreviewForEmail("registrar@oxford-demo.edu")!;
      const rawToken = extractRawTokenFromUrl(sent.verificationUrl);
      const verified = await registrationService.verifyEmail(rawToken);
      expect(verified.redirectPath).toBe("/oxford-demo-institute");
    });

    it("rolls back user cleanly if institutional registration fails mid-flight (no orphaned users)", async () => {
      await expect(
        registrationService.registerInstitution(
          makeInstitutionPayload({ email: "rollback@demo.edu" }),
          {
            failAfterUserHookForTesting: () => {
              throw new Error("Simulated DB tenant write failure");
            },
          }
        )
      ).rejects.toThrow(/Simulated DB tenant write failure/);

      const orphaned = await inMemoryUserStore.findByEmail("rollback@demo.edu");
      expect(orphaned).toBeNull();
      expect(inMemoryTenantStore.listAllTenants()).toHaveLength(0);
    });

    it("handles explicit slug conflict cleanly without leaving orphaned User", async () => {
      await registrationService.registerInstitution(
        makeInstitutionPayload({ email: "first@demo.edu", slug: "shared-uni" })
      );

      await expect(
        registrationService.registerInstitution(
          makeInstitutionPayload({ email: "second@demo.edu", slug: "shared-uni" })
        )
      ).rejects.toThrow(SlugConflictError);

      expect(await inMemoryUserStore.findByEmail("second@demo.edu")).toBeNull();
    });

    it("keeps account recoverable via resend verification if initial email delivery fails", async () => {
      VerificationMailer.setSimulateFailureForTesting(true);
      const res = await registrationService.registerWallet({
        fullName: "Recoverable User",
        email: "recover@demo.org",
        password: "crimson mountain cedar river 2026",
        confirmPassword: "crimson mountain cedar river 2026",
        termsAccepted: true,
        privacyAccepted: true,
      });
      expect(res.emailDeliveryPending).toBe(true);

      // Recover delivery via resend -> invalidates old token and delivers new token
      VerificationMailer.setSimulateFailureForTesting(false);
      const user = await inMemoryUserStore.findByEmail("recover@demo.org");
      const firstTokenHash = EmailVerificationRepository.listInMemoryTokenRecordsForUser(user!.id)[0].tokenHash;

      await registrationService.resendVerification("recover@demo.org");
      const allTokens = EmailVerificationRepository.listInMemoryTokenRecordsForUser(user!.id);
      expect(allTokens).toHaveLength(2);
      expect(allTokens.find((t) => t.tokenHash === firstTokenHash)?.consumedAt).not.toBeNull();

      const freshMail = VerificationMailer.getLatestPreviewForEmail("recover@demo.org")!;
      const freshRaw = extractRawTokenFromUrl(freshMail.verificationUrl);
      const verified = await registrationService.verifyEmail(freshRaw);
      expect(verified.verified).toBe(true);
    });

    it("returns safe generic response on duplicate email and rejects privilege escalation attempts", async () => {
      await registrationService.registerWallet({
        fullName: "First Holder",
        email: "dup@demo.org",
        password: "first holder secure passphrase",
        confirmPassword: "first holder secure passphrase",
        termsAccepted: true,
        privacyAccepted: true,
      });

      const dup = await registrationService.registerWallet({
        fullName: "Attacker",
        email: "dup@demo.org",
        password: "attacker secure passphrase 99",
        confirmPassword: "attacker secure passphrase 99",
        termsAccepted: true,
        privacyAccepted: true,
      });
      expect(dup.accepted).toBe(true);
      expect(dup.message).toMatch(/If your email is eligible/i);

      await expect(
        registrationService.registerInstitution(
          makeInstitutionPayload({ platformRole: "SUPER_ADMIN" })
        )
      ).rejects.toThrow(PrivilegeEscalationError);
    });

    it("allows a verified public wallet user to accept an institutional invitation later", async () => {
      await registrationService.registerInstitution(makeInstitutionPayload());
      const instMail = VerificationMailer.getLatestPreviewForEmail("registrar@oxford-demo.edu")!;
      const instVerified = await registrationService.verifyEmail(
        extractRawTokenFromUrl(instMail.verificationUrl)
      );
      const ownerSession = verifySessionToken(instVerified.token)!;

      await registrationService.registerWallet({
        fullName: "Invited Staff",
        email: "staff@oxford-demo.edu",
        password: "amber lantern timber valley 2026",
        confirmPassword: "amber lantern timber valley 2026",
        termsAccepted: true,
        privacyAccepted: true,
      });
      const staffMail = VerificationMailer.getLatestPreviewForEmail("staff@oxford-demo.edu")!;
      await registrationService.verifyEmail(extractRawTokenFromUrl(staffMail.verificationUrl));
      const staffUser = await inMemoryUserStore.findByEmail("staff@oxford-demo.edu");

      const invite = await tenantService.inviteMember(
        "oxford-demo-institute",
        { email: "staff@oxford-demo.edu", fullName: "Invited Staff", role: "CERTIFICATE_ISSUER" },
        ownerSession
      );
      await tenantService.acceptInvitation(
        "oxford-demo-institute",
        invite.invitationToken!,
        staffUser!.id
      );

      const staffLogin = await authService.login({
        email: "staff@oxford-demo.edu",
        password: "amber lantern timber valley 2026",
      });
      expect(staffLogin.user.redirectPath).toBe("/oxford-demo-institute");
    });
  });

  describe("API Routes Security, Validation & Rate Limiting", () => {
    it("handles malformed JSON, rejects privilege injection, never mints session before verification, and sets no-store headers", async () => {
      const badJsonReq = new NextRequest("http://localhost:3000/api/v1/auth/register/wallet", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.11" },
        body: "{bad json",
      });
      const badJsonRes = await registerWalletPost(badJsonReq);
      expect(badJsonRes.status).toBe(400);
      expect(badJsonRes.headers.get("cache-control")).toContain("no-store");

      const privReq = new NextRequest("http://localhost:3000/api/v1/auth/register/institution", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.12" },
        body: JSON.stringify(makeInstitutionPayload({ platformRole: "SUPER_ADMIN" })),
      });
      const privRes = await registerInstitutionPost(privReq);
      expect(privRes.status).toBe(403);

      // Valid wallet registration via API -> 201 and NO Set-Cookie session minted yet
      const okReq = new NextRequest("http://localhost:3000/api/v1/auth/register/wallet", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.13" },
        body: JSON.stringify({
          fullName: "API Holder",
          email: "api.holder@demo.org",
          password: "api holder secure passphrase",
          confirmPassword: "api holder secure passphrase",
          termsAccepted: true,
          privacyAccepted: true,
        }),
      });
      const okRes = await registerWalletPost(okReq);
      expect(okRes.status).toBe(201);
      expect(okRes.headers.get("set-cookie")).toBeNull();

      // Legacy /api/v1/auth/register also does NOT issue an unverified Set-Cookie
      const legacyReq = new NextRequest("http://localhost:3000/api/v1/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.14" },
        body: JSON.stringify({
          fullName: "Legacy Holder",
          email: "legacy.holder@demo.org",
          password: "legacy holder secure passphrase",
        }),
      });
      const legacyRes = await legacyRegisterPost(legacyReq);
      expect(legacyRes.status).toBe(201);
      expect(legacyRes.headers.get("set-cookie")).toBeNull();

      // Login before verify returns 403 EMAIL_NOT_VERIFIED
      const unverifiedLoginReq = new NextRequest("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.15" },
        body: JSON.stringify({
          email: "api.holder@demo.org",
          password: "api holder secure passphrase",
        }),
      });
      const unverifiedLoginRes = await loginPost(unverifiedLoginReq);
      expect(unverifiedLoginRes.status).toBe(403);

      // Verify via API sets HttpOnly cookie and returns redirectPath /wallet
      const mail = VerificationMailer.getLatestPreviewForEmail("api.holder@demo.org")!;
      const rawToken = extractRawTokenFromUrl(mail.verificationUrl);
      const verifyReq = new NextRequest("http://localhost:3000/api/v1/auth/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.16" },
        body: JSON.stringify({ token: rawToken }),
      });
      const verifyRes = await verifyEmailPost(verifyReq);
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.headers.get("set-cookie")).toContain("credvail_session=");
      const verifyJson = await verifyRes.json();
      expect(verifyJson.data.redirectPath).toBe("/wallet");

      // Rate limit resend-verification after 3 requests
      for (let i = 0; i < 3; i++) {
        const resendReq = new NextRequest("http://localhost:3000/api/v1/auth/resend-verification", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.99" },
          body: JSON.stringify({ email: "nobody@demo.org" }),
        });
        expect((await resendVerificationPost(resendReq)).status).toBe(200);
      }
      const throttledReq = new NextRequest("http://localhost:3000/api/v1/auth/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.99" },
        body: JSON.stringify({ email: "nobody@demo.org" }),
      });
      expect((await resendVerificationPost(throttledReq)).status).toBe(429);
    });
  });
});
