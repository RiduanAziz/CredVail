import { NextRequest, NextResponse } from "next/server";
import { AuthRecoveryService } from "@/lib/services/auth-recovery-service";

const authRecovery = new AuthRecoveryService();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await authRecovery.confirmPasswordReset(body);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RESET_PASSWORD_FAILED",
          message: error.message || "Unable to reset password",
        },
      },
      { status: 400 }
    );
  }
}
