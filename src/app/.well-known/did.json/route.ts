import { NextRequest, NextResponse } from "next/server";
import { KeyManagementService } from "@/lib/services/key-management-service";

export async function GET(request: NextRequest) {
  try {
    const host = request.headers.get("host") || "credvail.com";
    const didDocument = KeyManagementService.getPlatformDidDocument(host);

    return NextResponse.json(didDocument, {
      headers: {
        "Content-Type": "application/did+ld+json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "DID_RESOLUTION_ERROR",
        message: error.message || "Failed to resolve platform DID document",
      },
      { status: 500 }
    );
  }
}
