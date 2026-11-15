import { NextRequest, NextResponse } from "next/server";
import { AuthService, registerInputSchema } from "@/lib/services/auth-service";
import { getSessionCookieHeader } from "@/lib/auth/session";

const authService = new AuthService();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await authService.register(body);

    const response = NextResponse.json(
      {
        success: true,
        data: result.user,
      },
      { status: 201 }
    );

    response.headers.set("Set-Cookie", getSessionCookieHeader(result.token));

    return response;
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "REGISTRATION_FAILED",
          message: error.message || "Failed to register user",
          details: error.issues || error.details,
        },
      },
      { status: error.message?.includes("already exists") ? 409 : 400 }
    );
  }
}
