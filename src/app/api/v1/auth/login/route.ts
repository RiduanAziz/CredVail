import { NextRequest, NextResponse } from "next/server";
import { AuthService } from "@/lib/services/auth-service";
import { getSessionCookieHeader } from "@/lib/auth/session";

const authService = new AuthService();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await authService.login(body);

    const response = NextResponse.json({
      success: true,
      data: result.user,
    });

    response.headers.set("Set-Cookie", getSessionCookieHeader(result.token));

    return response;
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "AUTHENTICATION_FAILED",
          message: error.message || "Invalid credentials",
        },
      },
      { status: 401 }
    );
  }
}
