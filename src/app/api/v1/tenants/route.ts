import { NextRequest, NextResponse } from "next/server";
import { extractSession } from "@/lib/auth/tenant-context";
import { TenantService } from "@/lib/services/tenant-service";
import { createSessionToken, getSessionCookieHeader } from "@/lib/auth/session";
import { UserRepository } from "@/lib/repositories/user-repository";

const tenantService = new TenantService();
const userRepo = new UserRepository();

export async function POST(request: NextRequest) {
  try {
    const session = extractSession(request);
    const body = await request.json();

    const tenant = await tenantService.createOrganization(body, session.sub);

    // Refresh user session with newly added tenant ownership
    const updatedUser = await userRepo.findWithMemberships(session.sub);
    const updatedToken = createSessionToken(updatedUser || {
      id: session.sub,
      email: session.email,
      fullName: session.fullName,
      platformRole: session.platformRole,
    }, tenant.id);

    const response = NextResponse.json(
      {
        success: true,
        data: tenant,
      },
      { status: 201 }
    );

    response.headers.set("Set-Cookie", getSessionCookieHeader(updatedToken));

    return response;
  } catch (error: any) {
    const isConflict = error.message?.includes("already exists");
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isConflict ? "TENANT_EXISTS" : "TENANT_CREATION_FAILED",
          message: error.message || "Failed to create organization",
        },
      },
      { status: isConflict ? 409 : 400 }
    );
  }
}
