import { NextRequest, NextResponse } from "next/server";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import { BatchProcessingService } from "@/lib/services/batch-processing-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cred = await CredentialRepository.findCredentialByPublicId(id);

    if (!cred) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: `Certificate "${id}" was not found.` },
        { status: 404 }
      );
    }

    let pdfBytes =
      CredentialRepository.getPdfBuffer(cred.id) ||
      CredentialRepository.getPdfBuffer(cred.certificateNumber) ||
      CredentialRepository.getPdfBuffer(cred.credentialId);

    if (!pdfBytes) {
      const tenantRepo = new TenantRepository();
      const tenant = await tenantRepo.findById(cred.tenantId);
      if (tenant) {
        const generated = await BatchProcessingService.getCredentialPdf(tenant.slug, cred.id);
        pdfBytes = generated.pdfBytes;
      }
    }

    if (!pdfBytes) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Certificate PDF binary is not currently available." },
        { status: 404 }
      );
    }

    const u8 = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
    const filename = `${cred.certificateNumber}.pdf`;

    return new NextResponse(Buffer.from(u8), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": u8.length.toString(),
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error.message || "Failed to download certificate PDF.",
      },
      { status: 500 }
    );
  }
}
