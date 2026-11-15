import { NextRequest, NextResponse } from "next/server";
import { KeyManagementService } from "@/lib/services/key-management-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  let tenantSlug = "unknown";
  try {
    const { slug } = await params;
    tenantSlug = slug;
    const didDocument = await KeyManagementService.getTenantDidDocument(slug);

    return NextResponse.json(didDocument, {
      headers: {
        "Content-Type": "application/did+ld+json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "public, max-age=60, s-maxage=60",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "NOT_FOUND",
        message: error.message || `DID document for tenant "${tenantSlug}" not found`,
      },
      { status: 404 }
    );
  }
}
