/**
 * CREDVAIL Claim Invitation Service
 * 
 * Implements high-entropy single-use credential claim invitations.
 * 
 * Core Security Properties:
 * 1. 256-bit cryptographic entropy per invitation token.
 * 2. Only SHA-256 hashes are stored at rest; plaintext tokens are single-view.
 * 3. Atomic consumption prevents replay attacks.
 * 4. Mandatory expiration (default 7 days).
 * 5. Strict binding to recipient email and certificate number.
 */

import crypto from "node:crypto";
import {
  ClaimInvitationRepository,
  type StoredClaimInvitation,
} from "../repositories/claim-invitation-repository.ts";

export interface GenerateInvitationInput {
  credentialId: string;
  certificateNumber: string;
  recipientEmail: string;
  tenantId: string;
  ttlHours?: number;
}

export interface VerifyAndConsumeInput {
  certificateNumber: string;
  claimToken: string;
  userEmail: string;
  userId: string;
  holderDid?: string;
  userEmailVerified?: boolean;
}

export class ClaimInvitationService {
  /**
   * Computes deterministic SHA-256 hash of a claim token.
   */
  static hashToken(rawToken: string): string {
    return crypto.createHash("sha256").update(rawToken.trim()).digest("hex");
  }

  /**
   * Generates a high-entropy claim invitation.
   * Returns the raw high-entropy token (to be sent to recipient) and stored record.
   */
  static async createInvitation(
    input: GenerateInvitationInput
  ): Promise<{ rawToken: string; invitation: StoredClaimInvitation }> {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(rawToken);

    const ttlHours = input.ttlHours !== undefined ? input.ttlHours : 168; // default 7 days
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const invitation = await ClaimInvitationRepository.createInvitation({
      tokenHash,
      credentialId: input.credentialId,
      certificateNumber: input.certificateNumber,
      recipientEmail: input.recipientEmail,
      tenantId: input.tenantId,
      expiresAt,
    });

    return {
      rawToken,
      invitation,
    };
  }

  /**
   * Verifies a claim token against an invitation and consumes it atomically.
   * 
   * Throws specific security errors if:
   * - Token is invalid or not found (404/400)
   * - Token is already consumed / replay attack (410)
   * - Token has expired (410)
   * - Certificate number does not match (400)
   * - Claiming user's email does not match recipient email (403)
   */
  static async verifyAndConsume(
    input: VerifyAndConsumeInput,
    onPostConsume?: (txClient?: any) => Promise<void>
  ): Promise<StoredClaimInvitation> {
    const { certificateNumber, claimToken, userEmail, userId, holderDid } = input;

    if (!claimToken || typeof claimToken !== "string" || claimToken.trim().length === 0) {
      throw new Error("A valid high-entropy claim token is required.");
    }

    const tokenHash = this.hashToken(claimToken);
    const invitation = await ClaimInvitationRepository.findByTokenHash(tokenHash);

    if (!invitation) {
      throw new Error("Invalid or unverified credential claim invitation token.");
    }

    // 1. Check certificate number match
    if (invitation.certificateNumber !== certificateNumber.trim()) {
      throw new Error(
        `Certificate mismatch: This claim token is not valid for certificate "${certificateNumber}".`
      );
    }

    // 2. Check replay / already consumed
    if (invitation.consumedAt !== null) {
      throw new Error("This claim invitation token has already been consumed and cannot be reused.");
    }

    // 3. Check expiration
    if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
      throw new Error("This credential claim invitation has expired.");
    }

    // 4. Check recipient identity binding (case-insensitive email match)
    if (invitation.recipientEmail.toLowerCase() !== userEmail.trim().toLowerCase()) {
      throw new Error(
        `Ownership verification failed: You are signed in as "${userEmail}", but this credential was issued to "${invitation.recipientEmail}".`
      );
    }

    // 5. Fail-closed verified email enforcement:
    // ONLY explicit boolean `true` permits a recipient-bound claim.
    // `false`, `undefined`, `null`, or any other falsy/truthy value is strictly rejected.
    if (input.userEmailVerified !== true) {
      throw new Error(
        `Account email "${userEmail}" is not verified. Email verification is required to establish credential recipient ownership.`
      );
    }

    // 6. Consume invitation atomically within a single transactional boundary with rollback support
    const consumed = await ClaimInvitationRepository.redeemInvitationTransaction({
      invitationId: invitation.id,
      tokenHash,
      userId,
      holderDid,
      certificateNumber: invitation.certificateNumber,
      tenantId: invitation.tenantId,
      onPostConsume,
    });

    return consumed;
  }
}
