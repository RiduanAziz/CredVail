import { NextRequest, NextResponse } from "next/server";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import { StatusSnapshotRepository } from "@/lib/repositories/status-snapshot-repository";
import { StatusListService } from "@/lib/services/status-list-service";

/**
 * GET /api/v1/tenants/[slug]/status/[epoch]
 * Public endpoint serving W3C Bitstring Status List 2021 Verifiable Credentials.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; epoch: string }> }
) {
  try {
    const { slug, epoch } = await params;
    const epochNum = parseInt(epoch, 10);
    if (isNaN(epochNum) || epochNum < 1) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Invalid status epoch number." },
        { status: 400 }
      );
    }

    const tenantRepo = new TenantRepository();
    const tenant = await tenantRepo.findBySlug(slug);
    if (!tenant) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: `Institution "${slug}" not found.` },
        { status: 404 }
      );
    }

    let snapshot = await StatusSnapshotRepository.getSnapshotByEpoch(tenant.id, epochNum);
    if (!snapshot) {
      // If snapshot for epoch doesn't exist yet, generate empty bitstring
      const emptyBitstring = StatusListService.createBitstring();
      const gzipBase64 = StatusListService.compressBitstring(emptyBitstring);
      const digest = StatusListService.computeStatusDigest(gzipBase64);

      snapshot = await StatusSnapshotRepository.createSnapshot({
        tenantId: tenant.id,
        epoch: epochNum,
        bitstringGzipBase64: gzipBase64,
        digestSha256: digest,
      });
    }

    const spec = request.nextUrl.searchParams.get("spec") || request.nextUrl.searchParams.get("format");
    const useV1 = spec === "v1" || spec === "bitstring-v1";

    const vc = useV1
      ? StatusListService.buildBitstringStatusListCredential({
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          statusEpoch: epochNum,
          bufferOrGzipBase64: snapshot.bitstringGzipBase64,
          issuerDid: tenant.didUri,
        })
      : StatusListService.buildStatusListCredential({
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          statusEpoch: epochNum,
          bitstringGzipBase64: snapshot.bitstringGzipBase64,
          issuerDid: tenant.didUri,
        });

    return NextResponse.json(vc, {
      status: 200,
      headers: {
        "Content-Type": "application/vc+json; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=300",
        "Access-Control-Allow-Origin": "*",
        "X-Credvail-StatusList-Spec": useV1 ? "bitstring-v1.0" : "status-list-2021",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: error.message || "Failed to serve status list." },
      { status: 500 }
    );
  }
}
