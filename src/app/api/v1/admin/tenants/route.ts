import { NextRequest, NextResponse } from "next/server";
import { extractSession } from "@/lib/auth/tenant-context";
import { PlatformAdminService } from "@/lib/services/platform-admin-service";
import type { VerificationStatus } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const session = extractSession(request);
    const tenants = await PlatformAdminService.listAllTenants(session);
    return NextResponse.json({ success: true, data: tenants });
  } catch (error: any) {
    const status =
      error.name === "AuthenticationError"
        ? 401
        : error.name === "AuthorizationError"
        ? 403
        : 400;
    return NextResponse.json(
      {
        success: false,
        error: {
          code: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "ADMIN_QUERY_FAILED",
          message: error.message || "Admin access failed",
        },
      },
      { status }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = extractSession(request);
    const body = await request.json();
    const tenantId = String(body?.tenantId || "");
    const verificationStatus = String(body?.verificationStatus || "").toUpperCase() as VerificationStatus;

    if (!tenantId || !["UNVERIFIED", "PENDING", "VERIFIED", "SUSPENDED"].includes(verificationStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "tenantId and valid verificationStatus are required",
          },
        },
        { status: 400 }
      );
    }

    const updated = await PlatformAdminService.setTenantVerificationStatus(
      tenantId,
      verificationStatus,
      session
    );
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    const status =
      error.name === "AuthenticationError"
        ? 401
        : error.name === "AuthorizationError"
        ? 403
        : 400;
    return NextResponse.json(
      {
        success: false,
        error: {
          code: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "ADMIN_UPDATE_FAILED",
          message: error.message || "Admin update failed",
        },
      },
      { status }
    );
  }
}
