import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auditEvents = await repository.getAuditEvents(id);
    return NextResponse.json({
      incidentId: id,
      auditEvents: auditEvents || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch audit events" },
      { status: 500 }
    );
  }
}

/**
 * P0 Invariant: Audit events must NEVER be client-fabricated.
 * External POST to /audit is strictly forbidden. Audit append is callable only
 * from trusted internal server-side domain functions.
 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: "Method Not Allowed: Direct client append to audit ledger is forbidden. Audit events are strictly derived from trusted server-side domain operations.",
    },
    {
      status: 405,
      headers: {
        Allow: "GET",
      },
    }
  );
}
