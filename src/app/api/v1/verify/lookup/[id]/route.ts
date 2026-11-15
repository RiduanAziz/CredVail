import { NextRequest, NextResponse } from "next/server";
import { VerificationService } from "@/lib/services/verification-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || id.trim().length === 0) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "A credential public identifier is required." },
        { status: 400 }
      );
    }

    const result = await VerificationService.verifyByPublicId(id);

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      {
        status: result.status === "NOT_FOUND" ? 404 : 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error.message || "Failed to execute public verification.",
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
