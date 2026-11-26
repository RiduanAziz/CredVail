import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { RegistrationService, SlugConflictError } from "@/lib/services/registration-service";
import { EmailVerificationRepository } from "@/lib/repositories/email-verification-repository";
import { VerificationMailer } from "@/lib/email/verification-mailer";

const RUN_POSTGRES = process.env.REQUIRE_POSTGRES_INTEGRATION === "true";

describe.skipIf(!RUN_POSTGRES)("Live PostgreSQL Dual Registration & Transactional Atomicity", () => {
  const regService = new RegistrationService();
  const testEmails: string[] = [];
  const testSlugs: string[] = [];

  beforeAll(async () => {
    await db.$connect();
  });

  beforeEach(() => {
    VerificationMailer.resetForTesting();
  });

  afterAll(async () => {
    for (const slug of testSlugs) {
      await db.tenant.deleteMany({ where: { slug } }).catch(() => {});
    }
    for (const email of testEmails) {
      await db.user.deleteMany({ where: { email } }).catch(() => {});
    }
    await db.$disconnect();
  });

  it("atomically commits User + Tenant + ORG_OWNER + VerificationToken and rolls back cleanly on slug race or DB error", async () => {
    const email1 = `pg-inst-${Date.now()}@credvail.test`;
    const email2 = `pg-inst-rollback-${Date.now()}@credvail.test`;
    const slug = `pg-uni-${Date.now()}`;
    testEmails.push(email1, email2);
    testSlugs.push(slug);

    const created = await regService.registerInstitution({
      fullName: "Dr. PG Registrar",
      email: email1,
      jobTitle: "Registrar",
      password: "postgresql institutional passphrase 1",
      confirmPassword: "postgresql institutional passphrase 1",
      name: "PG University",
      legalEntityName: "PG University Trust",
      organizationType: "UNIVERSITY",
      operatingCountryCode: "US",
      addressLine1: "100 Campus Way",
      city: "Boston",
      region: "MA",
      postalCode: "02115",
      addressCountryCode: "US",
      slug,
      authorizedToRegister: true,
      termsAccepted: true,
      privacyAccepted: true,
    });
    expect(created.tenantSlug).toBe(slug);

    // Explicit slug conflict rolls back entire transaction (no orphaned email2 user)
    await expect(
      regService.registerInstitution({
        fullName: "Dr. PG Conflict",
        email: email2,
        jobTitle: "Dean",
        password: "postgresql institutional passphrase 2",
        confirmPassword: "postgresql institutional passphrase 2",
        name: "PG University Copy",
        legalEntityName: "PG University Copy Trust",
        organizationType: "COLLEGE",
        operatingCountryCode: "US",
        addressLine1: "200 Campus Way",
        city: "Boston",
        region: "MA",
        postalCode: "02115",
        addressCountryCode: "US",
        slug,
        authorizedToRegister: true,
        termsAccepted: true,
        privacyAccepted: true,
      })
    ).rejects.toThrow(SlugConflictError);

    const orphan = await db.user.findUnique({ where: { email: email2 } });
    expect(orphan).toBeNull();

    // Verify token consumes once atomically in PostgreSQL
    const sent = VerificationMailer.getLatestPreviewForEmail(email1)!;
    const rawToken = new URL(sent.verificationUrl).searchParams.get("token")!;
    const verified = await EmailVerificationRepository.consumeAndVerifyUser(rawToken);
    expect(verified.user.emailVerifiedAt).toBeInstanceOf(Date);
    await expect(EmailVerificationRepository.consumeAndVerifyUser(rawToken)).rejects.toThrow(
      /already been used/i
    );
  });
});
