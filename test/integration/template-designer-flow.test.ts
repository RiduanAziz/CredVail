import { describe, it, expect, beforeEach } from "vitest";
import { AuthService } from "@/lib/services/auth-service";
import { TenantService } from "@/lib/services/tenant-service";
import { TemplateService } from "@/lib/services/template-service";
import { UserRepository, inMemoryUserStore } from "@/lib/repositories/user-repository";
import { EmailVerificationRepository } from "@/lib/repositories/email-verification-repository";
import { TenantRepository, inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { TemplateRepository, inMemoryTemplateStore } from "@/lib/repositories/template-repository";
import { verifySessionToken } from "@/lib/auth/session";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";

describe("Phase 4 End-to-End Certificate Template Designer Flow", () => {
  let userRepo: UserRepository;
  let tenantRepo: TenantRepository;
  let templateRepo: TemplateRepository;
  let authService: AuthService;
  let tenantService: TenantService;
  let templateService: TemplateService;

  beforeEach(() => {
    inMemoryUserStore.clear();
    inMemoryTenantStore.clear();
    inMemoryTemplateStore.clear();
    userRepo = new UserRepository(true);
    tenantRepo = new TenantRepository(true);
    templateRepo = new TemplateRepository(true);
    authService = new AuthService(userRepo);
    tenantService = new TenantService(tenantRepo, userRepo);
    templateService = new TemplateService(templateRepo, tenantRepo);
  });

  it("should complete the full template lifecycle: auto-seeding, custom template design, coordinate adjustments, dynamic QR generation, vector preview, deletion, and cross-tenant barrier enforcement", async () => {
    // 1. Elena registers and creates Imperial College
    const elenaReg = await authService.register({
      email: "elena@imperial.ac.uk",
      password: "ImperialDeanPassword!2026",
      fullName: "Prof. Elena Rostova",
    });
    await EmailVerificationRepository.consumeAndVerifyUser(elenaReg.verificationToken);

    const imperialTenant = await tenantService.createOrganization(
      {
        name: "Imperial College London",
        legalEntityName: "Imperial College of Science, Technology and Medicine",
        websiteUrl: "https://imperial.ac.uk",
        slug: "imperial",
      },
      elenaReg.user.id
    );

    const elenaLogin = await authService.login({
      email: "elena@imperial.ac.uk",
      password: "ImperialDeanPassword!2026",
      targetTenantId: imperialTenant.id,
    });
    const elenaSession = verifySessionToken(elenaLogin.token)!;

    // 2. Elena invites Bob as TEMPLATE_DESIGNER
    const bobReg = await authService.register({
      email: "bob@imperial.ac.uk",
      password: "BobDesignerPassword!2026",
      fullName: "Bob Canvas",
    });
    await EmailVerificationRepository.consumeAndVerifyUser(bobReg.verificationToken);

    const bobInvite = await tenantService.inviteMember(
      "imperial",
      {
        email: "bob@imperial.ac.uk",
        fullName: "Bob Canvas",
        role: "TEMPLATE_DESIGNER",
      },
      elenaSession
    );

    // Bob accepts the invitation before logging in
    await tenantService.acceptInvitation(
      "imperial",
      bobInvite.invitationToken!,
      bobReg.user.id
    );

    // 3. Bob logs in with imperial tenant session
    const bobLogin = await authService.login({
      email: "bob@imperial.ac.uk",
      password: "BobDesignerPassword!2026",
      targetTenantId: imperialTenant.id,
    });
    const bobSession = verifySessionToken(bobLogin.token)!;
    expect(bobSession.currentTenantRole).toBe("TEMPLATE_DESIGNER");

    // 4. Bob lists templates -> triggers automatic seeding of standard presets
    const initialTemplates = await templateService.listTemplates("imperial", bobSession);
    expect(initialTemplates.length).toBe(2);
    expect(initialTemplates.some((t) => t.isDefault)).toBe(true);

    // 5. Bob creates a new specialized template from the Training preset
    const trainingPreset = TEMPLATE_PRESETS.TRAINING_COMPLETION;
    const newTemplate = await templateService.createTemplate(
      "imperial",
      {
        title: "Autonomous Systems & Robotics Certification",
        description: "Specialized post-grad robotics completion award",
        category: "TRAINING_COMPLETION",
        layoutConfig: {
          ...trainingPreset.layoutConfig,
          backgroundColor: "#ffffff",
          border: {
            style: "classic",
            color: "#002147", // Imperial Navy
            secondaryColor: "#d4af37", // Imperial Gold
            width: 4,
          },
        },
      },
      bobSession
    );

    expect(newTemplate.id).toBeDefined();
    expect(newTemplate.title).toBe("Autonomous Systems & Robotics Certification");

    // 6. Bob generates a real-time vector preview
    const preview = await templateService.generatePreview("imperial", newTemplate.id, bobSession, {
      "{{recipient_name}}": "Sir James Dyson",
      "{{course_name}}": "Advanced Autonomous Robotics and Cybernetics",
    });

    expect(preview.templateId).toBe(newTemplate.id);
    expect(preview.qrCode.dataUrl).toMatch(/^data:image\/png;base64,/);

    const recipientField = preview.resolvedFields.find((f) => f.name === "Recipient Name");
    expect(recipientField?.text).toBe("Sir James Dyson");

    // 7. Bob updates template coordinates and adds an extra signature
    const updatedTemplate = await templateService.updateTemplate(
      "imperial",
      newTemplate.id,
      {
        title: "Autonomous Systems & Robotics Honors Certification",
        layoutConfig: {
          ...newTemplate.layoutConfig,
          signatures: [
            ...newTemplate.layoutConfig.signatures,
            {
              id: "sig_provost",
              title: "College Provost",
              signatoryName: "Prof. Ian Walmsley",
              x: 25,
              y: 84,
              width: 140,
              height: 48,
            },
          ],
        },
      },
      bobSession
    );

    expect(updatedTemplate.title).toContain("Honors Certification");
    expect(updatedTemplate.layoutConfig.signatures.length).toBe(3);

    // 8. Register Eve (outsider with competitor tenant)
    const eveReg = await authService.register({
      email: "eve@outsider-lab.org",
      password: "EveOutsiderPassword!2026",
      fullName: "Eve Outsider",
    });
    await EmailVerificationRepository.consumeAndVerifyUser(eveReg.verificationToken);
    const outsiderTenant = await tenantService.createOrganization(
      {
        name: "Outsider Lab",
        legalEntityName: "Outsider Lab LLC",
        websiteUrl: "https://outsider-lab.org",
        slug: "outsider-lab",
      },
      eveReg.user.id
    );
    const eveLogin = await authService.login({
      email: "eve@outsider-lab.org",
      password: "EveOutsiderPassword!2026",
      targetTenantId: outsiderTenant.id,
    });
    const eveSession = verifySessionToken(eveLogin.token)!;

    // 9. CROSS-TENANT ISOLATION BARRIER:
    // Eve CANNOT read Imperial's templates
    await expect(
      templateService.listTemplates("imperial", eveSession)
    ).rejects.toThrow(/Forbidden: You do not possess access to organization 'imperial'/);

    // Eve CANNOT preview Bob's template
    await expect(
      templateService.generatePreview("imperial", newTemplate.id, eveSession)
    ).rejects.toThrow(/Forbidden: You do not possess access to organization 'imperial'/);

    // Eve CANNOT delete Bob's template
    await expect(
      templateService.deleteTemplate("imperial", newTemplate.id, eveSession)
    ).rejects.toThrow(/Forbidden: You do not possess access to organization 'imperial'/);

    // 10. Bob can delete the template
    const deleted = await templateService.deleteTemplate("imperial", newTemplate.id, bobSession);
    expect(deleted).toBe(true);

    // 11. Audit trail verification
    const auditLogs = await tenantService.getAuditLogs("imperial", elenaSession);
    const templateActions = auditLogs.filter((l) => l.resourceType === "CertificateTemplate").map((l) => l.action);
    expect(templateActions).toContain("TEMPLATE_CREATED");
    expect(templateActions).toContain("TEMPLATE_UPDATED");
    expect(templateActions).toContain("TEMPLATE_DELETED");
  });
});
