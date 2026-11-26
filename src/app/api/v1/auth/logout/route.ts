import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  getClearSessionCookieHeader,
  verifySessionToken,
} from "@/lib/auth/session";
import { SessionRevocationService } from "@/lib/auth/session-revocation";
import { TenantRepository } from "@/lib/repositories/tenant-repository";

const tenantRepo = new TenantRepository();

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const payload = verifySessionToken(token);
    if (payload?.jti) {
      await SessionRevocationService.revokeSession(payload.jti, payload.exp);
      await tenantRepo.recordAuditLog({
        tenantId: payload.currentTenantId,
        userId: payload.sub,
        userEmail: payload.email,
        action: "SESSION_LOGOUT",
        resourceType: "Session",
        resourceId: payload.jti,
      });
    }
  }

  const response = NextResponse.json({
    success: true,
    data: { message: "Successfully logged out and revoked session" },
  });

  response.headers.set("Set-Cookie", getClearSessionCookieHeader());

  return response;
}
