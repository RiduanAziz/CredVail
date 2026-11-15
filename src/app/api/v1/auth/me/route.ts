import { NextRequest, NextResponse } from "next/server";
import { extractSession } from "@/lib/auth/tenant-context";
import { AuthService } from "@/lib/services/auth-service";

const authService = new AuthService();

export async function GET(request: NextRequest) {
  try {
    const session = extractSession(request);
    const profile = await authService.getProfile(session);

    return NextResponse.json({
      success: true,
      data: profile,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: error.message || "Authentication required",
        },
      },
      { status: 401 }
    );
  }
}
