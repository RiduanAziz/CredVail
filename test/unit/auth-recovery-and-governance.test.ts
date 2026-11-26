import { describe, it, expect, beforeEach } from "vitest";
import { AuthService } from "@/lib/services/auth-service";
import { AuthRecoveryService } from "@/lib/services/auth-recovery-service";
import { SessionRevocationService } from "@/lib/auth/session-revocation";
import { verifySessionToken, verifySessionTokenAsync } from "@/lib/auth/session";
import { TenantService } from "@/lib/services/tenant-service";
import { inMemoryUserStore } from "@/lib/repositories/user-repository";
import { EmailVerificationRepository } from "@/lib/repositories/email-verification-repository";
import { inMemoryTenantStore } from "@/lib/repositories/tenant-repository";

describe("Phase 3: Auth Recovery, Email Verification, Session Revocation & Ownership Transfer", () => {
  const authService = new AuthService();
  const recoveryService = new AuthRecoveryService();
  const tenantService = new TenantService();

  beforeEach(() => {
    inMemoryUserStore.clear();
    inMemoryTenantStore.clear();
    AuthRecoveryService.resetForTesting();
    SessionRevocationService.resetForTesting();
  });

  it("supports single-use password reset without leaking account existence and blocks token replay", async () => {
    const unknown = await recoveryService.requestPasswordReset({
      email: "nonexistent@university.edu",
    });
    expect(unknown.accepted).toBe(true);
    expect(unknown.debugToken).toBeUndefined();

    const reg = await authService.register({
      email: "registrar@mit-demo.edu",
      password: "InitialPassword!123",
      fullName: "Registrar Admin",
    });
    await EmailVerificationRepository.consumeAndVerifyUser(reg.verificationToken);

    const resetReq = await recoveryService.requestPasswordReset({
      email: "registrar@mit-demo.edu",
    });
    expect(resetReq.accepted).toBe(true);
    expect(resetReq.debugToken).toBeTruthy();

    const confirmed = await recoveryService.confirmPasswordReset({
      token: resetReq.debugToken!,
      newPassword: "RotatedStrongPassword!456",
    });
    expect(confirmed.reset).toBe(true);
    expect(confirmed.userId).toBe(reg.user.id);

    // Replay of consumed token must fail
    await expect(
      recoveryService.confirmPasswordReset({
        token: resetReq.debugToken!,
        newPassword: "AnotherPassword!789",
      })
    ).rejects.toThrow(/already been consumed/i);

    // Old password must fail, new password succeeds
    await expect(
      authService.login({
        email: "registrar@mit-demo.edu",
        password: "InitialPassword!123",
      })
    ).rejects.toThrow(/invalid email or password/i);

    const loginRes = await authService.login({
      email: "registrar@mit-demo.edu",
      password: "RotatedStrongPassword!456",
    });
    expect(loginRes.user.id).toBe(reg.user.id);
  });

  it("verifies user email with single-use token and revokes active sessions upon logout", async () => {
    const reg = await authService.register({
      email: "holder@oxford-demo.edu",
      password: "HolderPassword!123",
      fullName: "Holder Student",
    });

    const req = await recoveryService.requestEmailVerification(reg.user.id);
    expect(req.sent).toBe(true);
    expect(req.debugToken).toBeTruthy();

    const verified = await recoveryService.confirmEmailVerification({
      token: req.debugToken!,
    });
    expect(verified.verified).toBe(true);

    const userAfter = await inMemoryUserStore.findById(reg.user.id);
    expect(userAfter?.emailVerifiedAt).toBeInstanceOf(Date);

    // Active token validates before revocation
    const payload = verifySessionToken(reg.token);
    expect(payload).not.toBeNull();
    expect(await verifySessionTokenAsync(reg.token)).not.toBeNull();

    // Revoke session JTI and confirm immediate invalidation
    await SessionRevocationService.revokeSession(payload!.jti, payload!.exp);
    expect(verifySessionToken(reg.token)).toBeNull();
    expect(await verifySessionTokenAsync(reg.token)).toBeNull();
  });

  it("atomically transfers organization ownership only from ORG_OWNER to accepted members", async () => {
    const owner = await authService.register({
      email: "owner@stanford-demo.edu",
      password: "OwnerPassword!123",
      fullName: "Original Owner",
    });
    await EmailVerificationRepository.consumeAndVerifyUser(owner.verificationToken);
    const staff = await authService.register({
      email: "dean@stanford-demo.edu",
      password: "StaffPassword!123",
      fullName: "Academic Dean",
    });
    await EmailVerificationRepository.consumeAndVerifyUser(staff.verificationToken);

    const tenant = await tenantService.createOrganization(
      {
        name: "Stanford Demo",
        legalEntityName: "Stanford Demo University",
        websiteUrl: "https://stanford-demo.edu",
        slug: "stanford-demo",
      },
      owner.user.id
    );

    const ownerLogin = await authService.login({
      email: "owner@stanford-demo.edu",
      password: "OwnerPassword!123",
      targetTenantId: tenant.id,
    });
    const ownerSession = verifySessionToken(ownerLogin.token)!;

    // Invite staff member
    const invited = await tenantService.inviteMember(
      "stanford-demo",
      {
        email: "dean@stanford-demo.edu",
        fullName: "Academic Dean",
        role: "INSTITUTION_ADMIN",
      },
      ownerSession
    );

    // Unaccepted member cannot receive ownership transfer
    await expect(
      tenantService.transferOwnership("stanford-demo", staff.user.id, ownerSession)
    ).rejects.toThrow(/pending unaccepted invitation/i);

    await tenantService.acceptInvitation("stanford-demo", invited.invitationToken!, staff.user.id);

    // Non-owner cannot transfer ownership
    const staffLogin = await authService.login({
      email: "dean@stanford-demo.edu",
      password: "StaffPassword!123",
      targetTenantId: tenant.id,
    });
    const staffSession = verifySessionToken(staffLogin.token)!;
    await expect(
      tenantService.transferOwnership("stanford-demo", staff.user.id, staffSession)
    ).rejects.toThrow(/Only Organization Owners/i);

    // Owner transfers ownership atomically
    const transferred = await tenantService.transferOwnership(
      "stanford-demo",
      staff.user.id,
      ownerSession
    );
    expect(transferred).toBe(true);

    const members = await inMemoryTenantStore.listMembers(tenant.id);
    const newOwner = members.find((m) => m.userId === staff.user.id);
    const formerOwner = members.find((m) => m.userId === owner.user.id);
    expect(newOwner?.role).toBe("ORG_OWNER");
    expect(formerOwner?.role).toBe("INSTITUTION_ADMIN");
  });
});
