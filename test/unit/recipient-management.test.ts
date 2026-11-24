import { describe, it, expect, beforeEach } from "vitest";
import {
  RecipientRepository,
  inMemoryRecipientStore,
} from "@/lib/repositories/recipient-repository";
import {
  TenantRepository,
  inMemoryTenantStore,
} from "@/lib/repositories/tenant-repository";
import { RecipientService } from "@/lib/services/recipient-service";
import { SessionPayload } from "@/lib/auth/session";
import { TenantRole } from "@/types";

describe("Phase 6 Recipient Management & Spreadsheet Import Engine Hardening", () => {
  let recipientRepo: RecipientRepository;
  let tenantRepo: TenantRepository;
  let recipientService: RecipientService;

  beforeEach(() => {
    inMemoryRecipientStore.clear();
    inMemoryTenantStore.clear();
    recipientRepo = new RecipientRepository(true);
    tenantRepo = new TenantRepository(true);
    recipientService = new RecipientService(recipientRepo, tenantRepo);
  });

  const createSession = (
    userId: string,
    tenantId: string,
    slug: string,
    role: TenantRole
  ): SessionPayload => ({
    sub: userId,
    email: `${role.toLowerCase()}@test.edu`,
    fullName: `Test ${role}`,
    platformRole: "USER",
    tenants: [{ tenantId, slug, name: "Test University", role }],
    currentTenantId: tenantId,
    currentTenantRole: role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: "nonce",
  });

  describe("1. Recipient Creation, Validation & Lowercase Email Normalization", () => {
    it("should create a valid recipient and normalize email to lowercase", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "Imperial College",
        legalEntityName: "Imperial Inc",
        websiteUrl: "https://imperial.ac.uk",
        slug: "imperial",
        didUri: "did:web:credvail.io:tenants:imperial",
        ownerUserId: "usr_owner_imp",
      });

      const issuerSession = createSession("usr_iss_1", tenant.id, "imperial", "CERTIFICATE_ISSUER");

      const recipient = await recipientService.createRecipient(
        "imperial",
        {
          fullName: "Dr. Eleanor Vance",
          email: "Eleanor.Vance@Imperial.AC.UK  ",
          externalIdentifier: "STUDENT-99420",
          metadata: { department: "Computing", cohort: 2026 },
        },
        issuerSession
      );

      expect(recipient.id).toBeDefined();
      expect(recipient.fullName).toBe("Dr. Eleanor Vance");
      expect(recipient.email).toBe("eleanor.vance@imperial.ac.uk");
      expect(recipient.externalIdentifier).toBe("STUDENT-99420");
      expect(recipient.metadata.cohort).toBe(2026);
    });

    it("should reject invalid email formats", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "UCL",
        legalEntityName: "UCL Inc",
        websiteUrl: "https://ucl.ac.uk",
        slug: "ucl",
        didUri: "did:web:credvail.io:tenants:ucl",
        ownerUserId: "usr_owner_ucl",
      });

      const issuerSession = createSession("usr_iss_2", tenant.id, "ucl", "CERTIFICATE_ISSUER");

      await expect(
        recipientService.createRecipient(
          "ucl",
          {
            fullName: "Invalid Email Person",
            email: "not-an-email",
          },
          issuerSession
        )
      ).rejects.toThrow(/valid email/);
    });
  });

  describe("2. Deduplication and Multi-Tenant Isolation", () => {
    it("should prevent duplicate recipient email within the same institution", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "MIT",
        legalEntityName: "MIT Inc",
        websiteUrl: "https://mit.edu",
        slug: "mit",
        didUri: "did:web:credvail.io:tenants:mit",
        ownerUserId: "usr_owner_mit",
      });

      const session = createSession("usr_owner_mit", tenant.id, "mit", "ORG_OWNER");

      await recipientService.createRecipient(
        "mit",
        {
          fullName: "Alan Turing",
          email: "alan.turing@mit.edu",
        },
        session
      );

      // Attempt second registration with same email (different case)
      await expect(
        recipientService.createRecipient(
          "mit",
          {
            fullName: "A. Turing Duplicate",
            email: "ALAN.TURING@MIT.EDU",
          },
          session
        )
      ).rejects.toThrow(/already exists/);
    });

    it("should allow the same email to exist in distinct organizations without conflict", async () => {
      const tenantA = await tenantRepo.createTenant({
        name: "Org Alpha",
        legalEntityName: "Alpha Inc",
        websiteUrl: "https://alpha.org",
        slug: "alpha-org",
        didUri: "did:web:credvail.io:tenants:alpha-org",
        ownerUserId: "usr_alpha_owner",
      });

      const tenantB = await tenantRepo.createTenant({
        name: "Org Beta",
        legalEntityName: "Beta Inc",
        websiteUrl: "https://beta.org",
        slug: "beta-org",
        didUri: "did:web:credvail.io:tenants:beta-org",
        ownerUserId: "usr_beta_owner",
      });

      const sessionA = createSession("usr_alpha_owner", tenantA.id, "alpha-org", "ORG_OWNER");
      const sessionB = createSession("usr_beta_owner", tenantB.id, "beta-org", "ORG_OWNER");

      const recA = await recipientService.createRecipient(
        "alpha-org",
        { fullName: "Shared Recipient", email: "student@shared.edu" },
        sessionA
      );
      const recB = await recipientService.createRecipient(
        "beta-org",
        { fullName: "Shared Recipient", email: "student@shared.edu" },
        sessionB
      );

      expect(recA.id).not.toBe(recB.id);
      expect(recA.tenantId).toBe(tenantA.id);
      expect(recB.tenantId).toBe(tenantB.id);
    });
  });

  describe("3. Fuzzy Search, Filtering & Pagination", () => {
    it("should search recipients by name, email, or external identifier with pagination", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "Stanford",
        legalEntityName: "Stanford Inc",
        websiteUrl: "https://stanford.edu",
        slug: "stanford",
        didUri: "did:web:credvail.io:tenants:stanford",
        ownerUserId: "usr_owner_stanford",
      });

      const session = createSession("usr_owner_stanford", tenant.id, "stanford", "ORG_OWNER");

      await recipientService.createRecipient("stanford", { fullName: "Alice Smith", email: "alice@stanford.edu", externalIdentifier: "STU-001" }, session);
      await recipientService.createRecipient("stanford", { fullName: "Bob Jones", email: "bob@stanford.edu", externalIdentifier: "STU-002" }, session);
      await recipientService.createRecipient("stanford", { fullName: "Charlie Smith", email: "charlie@stanford.edu", externalIdentifier: "EMP-900" }, session);

      // Search by name "Smith" -> should match Alice and Charlie
      const searchSmith = await recipientService.listRecipients("stanford", session, { search: "smith" });
      expect(searchSmith.total).toBe(2);
      expect(searchSmith.items.length).toBe(2);

      // Search by external ID "EMP" -> should match Charlie
      const searchEmp = await recipientService.listRecipients("stanford", session, { search: "EMP" });
      expect(searchEmp.total).toBe(1);
      expect(searchEmp.items[0].fullName).toBe("Charlie Smith");

      // Pagination limit 1
      const paged = await recipientService.listRecipients("stanford", session, { limit: 1, offset: 0 });
      expect(paged.total).toBe(3);
      expect(paged.items.length).toBe(1);
    });
  });

  describe("4. Bulk Recipient Import & Deduplication", () => {
    it("should bulk import recipients and automatically report skipped duplicates", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "Berkeley",
        legalEntityName: "Berkeley Inc",
        websiteUrl: "https://berkeley.edu",
        slug: "berkeley",
        didUri: "did:web:credvail.io:tenants:berkeley",
        ownerUserId: "usr_owner_cal",
      });

      const session = createSession("usr_owner_cal", tenant.id, "berkeley", "ORG_OWNER");

      // Seed one existing recipient
      await recipientService.createRecipient(
        "berkeley",
        { fullName: "Existing User", email: "existing@berkeley.edu" },
        session
      );

      // Bulk import batch containing 1 existing duplicate, 1 internal duplicate, and 2 unique records
      const bulkResult = await recipientService.bulkImportRecipients(
        "berkeley",
        {
          recipients: [
            { fullName: "New Student 1", email: "student1@berkeley.edu" },
            { fullName: "Existing User Attempt", email: "EXISTING@berkeley.edu" }, // duplicate!
            { fullName: "New Student 2", email: "student2@berkeley.edu" },
            { fullName: "New Student 1 Duplicate", email: "student1@berkeley.edu" }, // duplicate!
          ],
        },
        session
      );

      expect(bulkResult.total).toBe(4);
      expect(bulkResult.imported.length).toBe(2);
      expect(bulkResult.duplicatesSkipped).toBe(2);

      const all = await recipientService.listRecipients("berkeley", session);
      expect(all.total).toBe(3); // 1 existing + 2 new
    });
  });

  describe("5. Update, Deletion Guard & RBAC Barriers", () => {
    it("should update recipient profile and prevent duplicate email collision on update", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "Yale",
        legalEntityName: "Yale Inc",
        websiteUrl: "https://yale.edu",
        slug: "yale",
        didUri: "did:web:credvail.io:tenants:yale",
        ownerUserId: "usr_owner_yale",
      });

      const session = createSession("usr_owner_yale", tenant.id, "yale", "ORG_OWNER");

      const rec1 = await recipientService.createRecipient("yale", { fullName: "User One", email: "one@yale.edu" }, session);
      const rec2 = await recipientService.createRecipient("yale", { fullName: "User Two", email: "two@yale.edu" }, session);

      // Update name and external ID
      const updated = await recipientService.updateRecipient("yale", rec1.id, { fullName: "User One Updated", externalIdentifier: "EXT-101" }, session);
      expect(updated.fullName).toBe("User One Updated");
      expect(updated.externalIdentifier).toBe("EXT-101");

      // Attempting to change rec2 email to rec1 email must fail
      await expect(
        recipientService.updateRecipient("yale", rec2.id, { email: "one@yale.edu" }, session)
      ).rejects.toThrow(/already exists/);
    });

    it("should prevent deletion of a recipient actively linked to issued credentials", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "Oxford",
        legalEntityName: "Oxford Inc",
        websiteUrl: "https://oxford.ac.uk",
        slug: "oxford",
        didUri: "did:web:credvail.io:tenants:oxford",
        ownerUserId: "usr_owner_ox",
      });

      const session = createSession("usr_owner_ox", tenant.id, "oxford", "ORG_OWNER");

      const rec = await recipientService.createRecipient("oxford", { fullName: "Graduate", email: "grad@oxford.ac.uk" }, session);

      // Set credential reference
      recipientRepo.setCredentialReferenceCount(rec.id, 1);

      await expect(recipientService.deleteRecipient("oxford", rec.id, session)).rejects.toThrow(
        /linked to issued credentials/
      );
    });

    it("should block READ_ONLY_STAFF from creating or deleting recipients", async () => {
      const tenant = await tenantRepo.createTenant({
        name: "Edinburgh",
        legalEntityName: "Edinburgh Inc",
        websiteUrl: "https://edinburgh.ac.uk",
        slug: "edinburgh",
        didUri: "did:web:credvail.io:tenants:edinburgh",
        ownerUserId: "usr_owner_edi",
      });

      const readOnlySession = createSession("usr_read_1", tenant.id, "edinburgh", "READ_ONLY_STAFF");

      await expect(
        recipientService.createRecipient("edinburgh", { fullName: "Staff Add", email: "staff@edinburgh.ac.uk" }, readOnlySession)
      ).rejects.toThrow(/Forbidden/);
    });
  });
});
