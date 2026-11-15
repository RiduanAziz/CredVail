import { NextRequest, NextResponse } from "next/server";
import { extractTenantContext } from "@/lib/auth/tenant-context";
import { BatchService } from "@/lib/services/batch-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = extractTenantContext(request, slug);

    const contentType = request.headers.get("content-type") || "";

    let fileBuffer: Buffer;
    let filename: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "Missing 'file' field in multipart form data",
            },
          },
          { status: 400 }
        );
      }
      filename = file.name;
      const arrayBuf = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuf);
    } else {
      // JSON body with base64
      const body = await request.json();
      if (!body.fileBase64 || !body.filename) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "BAD_REQUEST",
              message: "JSON upload requires 'fileBase64' and 'filename'",
            },
          },
          { status: 400 }
        );
      }
      filename = body.filename;
      fileBuffer = Buffer.from(body.fileBase64, "base64");
    }

    const result = await BatchService.parseUploadedSpreadsheet(
      slug,
      fileBuffer,
      filename,
      ctx.session
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const isForbidden = error.name === "AuthorizationError" || error.message?.includes("Forbidden");
    const isNotFound = error.message?.includes("not found");

    return NextResponse.json(
      {
        success: false,
        error: {
          code: isForbidden ? "FORBIDDEN" : isNotFound ? "NOT_FOUND" : "BAD_REQUEST",
          message: error.message || "Failed to parse spreadsheet",
        },
      },
      { status: isForbidden ? 403 : isNotFound ? 404 : 400 }
    );
  }
}
