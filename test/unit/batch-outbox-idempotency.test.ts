import { describe, it, expect, beforeEach } from "vitest";
import { BatchProcessingService } from "@/lib/services/batch-processing-service";
import { BatchOutboxRepository } from "@/lib/repositories/batch-outbox-repository";
import { BatchRepository } from "@/lib/repositories/batch-repository";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { ClaimInvitationRepository } from "@/lib/repositories/claim-invitation-repository";
import { TemplateRepository } from "@/lib/repositories/template-repository";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";
import { TenantRepository, inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { KeyRepository } from "@/lib/repositories/key-repository";

describe("Phase 7.2/7.3: Batch Idempotency, Durable Outbox & Partial-Failure Recovery", () => {
  const tenantRepo = new TenantRepository(true);
  const templateRepo = new TemplateRepository(true);
  let tenantSlug = "idempotency-demo-uni";
  let tenantId = "";
  let templateId = "";

  beforeEach(async () => {
    BatchOutboxRepository.resetForTesting();
    BatchProcessingService.resetExportStore();
    BatchRepository.resetInMemoryStore();
    CredentialRepository.resetInMemoryStore();
    ClaimInvitationRepository.resetInMemoryStore();
    KeyRepository.resetInMemoryStore();
    inMemoryTenantStore.clear();

    const tenant = await tenantRepo.createTenant({
      slug: tenantSlug,
      name: "Idempotency University",
      legalEntityName: "Idempotency University LLC",
      websiteUrl: "https://idemp.edu",
      didUri: `did:web:credvail.io:tenants:${tenantSlug}`,
      ownerUserId: "usr_owner_batch",
    });
    tenantId = tenant.id;
    await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);

    const template = await templateRepo.createTemplate({
      tenantId: tenant.id,
      name: "B.Sc. Honors",
      title: "Bachelor of Science",
      category: "COURSE_COMPLETION",
      layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
    });
    templateId = template.id;
  });

  it("returns cached result on repeated processBatch calls with same idempotencyKey without duplicating credentials", async () => {
    const stagedBatch = await BatchRepository.createBatch({
      tenantId,
      templateId,
      stagedRecipients: [
        {
          fullName: "Alice Johnson",
          email: "alice@idemp.edu",
          certificateNumberPreview: "IDEMP-2026-001",
          courseName: "Quantum Computing",
          issueDate: "2026-05-01",
          status: "VALID",
        },
        {
          fullName: "Bob Lee",
          email: "bob@idemp.edu",
          certificateNumberPreview: "IDEMP-2026-002",
          courseName: "Cryptography",
          issueDate: "2026-05-01",
          status: "VALID",
        },
      ],
    });

    const first = await BatchProcessingService.processBatch(
      tenantSlug,
      stagedBatch.id,
      undefined,
      "https://credvail.com",
      { idempotencyKey: "req-idem-001" }
    );
    expect(first.status).toBe("GENERATED");
    expect(first.totalProcessed).toBe(2);
    expect(first.idempotentReplay).toBeUndefined();
    expect(first.outboxEventCount).toBe(2);

    const replay = await BatchProcessingService.processBatch(
      tenantSlug,
      stagedBatch.id,
      undefined,
      "https://credvail.com",
      { idempotencyKey: "req-idem-001" }
    );
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.merkleRoot).toBe(first.merkleRoot);
    expect(replay.credentials).toHaveLength(2);

    const stored = await CredentialRepository.listCredentials(tenantId, { batchId: stagedBatch.id });
    expect(stored.total).toBe(2);
  });

  it("isolates per-recipient outbox delivery failure and safely recovers failed items on retry", async () => {
    const stagedBatch = await BatchRepository.createBatch({
      tenantId,
      templateId,
      stagedRecipients: [
        {
          fullName: "Alice One",
          email: "alice@idemp.edu",
          certificateNumberPreview: "IDEMP-2026-003",
          courseName: "Security",
          issueDate: "2026-05-01",
          status: "VALID",
        },
        {
          fullName: "Bob Failed",
          email: "bob.fail@idemp.edu",
          certificateNumberPreview: "IDEMP-2026-004",
          courseName: "Security",
          issueDate: "2026-05-01",
          status: "VALID",
        },
      ],
    });

    const res = await BatchProcessingService.processBatch(
      tenantSlug,
      stagedBatch.id,
      undefined,
      "https://credvail.com",
      { simulateFailEmail: "bob.fail@idemp.edu" }
    );

    expect(res.totalProcessed).toBe(2);
    expect(res.failedItems).toHaveLength(1);
    expect(res.failedItems?.[0].email).toBe("bob.fail@idemp.edu");
    expect(res.claimLinks).toHaveLength(1);

    const eventsBefore = await BatchOutboxRepository.listEvents(tenantId, stagedBatch.id);
    expect(eventsBefore.filter((e) => e.status === "FAILED")).toHaveLength(1);
    expect(eventsBefore.filter((e) => e.status === "PROCESSED")).toHaveLength(1);

    // Retry safely recovers only the failed outbox item without duplicating CredentialRecord rows
    const retryRes = await BatchProcessingService.retryFailedBatchItems(
      tenantSlug,
      stagedBatch.id,
      undefined,
      "https://credvail.com"
    );
    expect(retryRes.retriedCount).toBe(1);
    expect(retryRes.recoveredLinks).toHaveLength(1);
    expect(retryRes.recoveredLinks[0].recipientEmail).toBe("bob.fail@idemp.edu");
    expect(retryRes.remainingFailedCount).toBe(0);

    const stored = await CredentialRepository.listCredentials(tenantId, { batchId: stagedBatch.id });
    expect(stored.total).toBe(2);
  });
});
