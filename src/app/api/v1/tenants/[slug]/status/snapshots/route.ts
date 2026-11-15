import { NextRequest, NextResponse } from "next/server";
import { TenantRepository } from "@/lib/repositories/tenant-repository";
import { StatusSnapshotRepository } from "@/lib/repositories/status-snapshot-repository";

/**
 * GET /api/v1/tenants/[slug]/status/snapshots
 * Public/institutional endpoint listing all status snapshots and on-chain anchor transactions.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const tenantRepo = new TenantRepository();
    const tenant = await tenantRepo.findBySlug(slug);
    if (!tenant) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: `Institution "${slug}" not found.` },
        { status: 404 }
      );
    }

    const snapshots = await StatusSnapshotRepository.listSnapshots(tenant.id);
    return NextResponse.json({
      success: true,
      data: snapshots,
      totalSnapshots: snapshots.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: error.message || "Failed to list snapshots." },
      { status: 500 }
    );
  }
}
