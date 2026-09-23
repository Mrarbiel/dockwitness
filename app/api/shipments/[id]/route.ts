import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const shipment = await repository.getShipment(id);
  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }
  return NextResponse.json(shipment);
}
