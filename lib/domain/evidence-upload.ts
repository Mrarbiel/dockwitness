import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mock.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "mock-key"
);

export const ALLOWED_EVIDENCE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_EVIDENCE_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    if (buffer.length < 8) return false;
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimeType === "image/webp") {
    if (buffer.length < 12) return false;
    const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    return isRiff && isWebp;
  }
  return false;
}

export async function processEvidenceUpload(request: Request, fallbackIncidentId?: string) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const incidentId = (formData.get("incidentId") as string | null) || fallbackIncidentId;
    const capturedBy = (formData.get("capturedBy") as string | null) || "RECEIVER";
    const description = formData.get("description") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!incidentId) {
      return NextResponse.json({ error: "Missing required field: incidentId" }, { status: 400 });
    }

    const mimeType = file.type ? file.type.toLowerCase() : "";
    if (!ALLOWED_EVIDENCE_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `Invalid file type '${file.type}'. Only image/jpeg, image/png, and image/webp are supported.` },
        { status: 400 }
      );
    }

    if (file.size > MAX_EVIDENCE_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds the 15 MB limit.` },
        { status: 400 }
      );
    }

    // 1. Validate incident existence
    const incident = await repository.getIncident(incidentId);
    if (!incident) {
      return NextResponse.json({ error: `Incident '${incidentId}' not found.` }, { status: 404 });
    }

    // 2. Prepare storage upload
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (!validateMagicBytes(buffer, mimeType)) {
      return NextResponse.json(
        { error: "Invalid file content: magic bytes do not match expected image type" },
        { status: 400 }
      );
    }
    const cleanName = file.name ? file.name.replace(/[^a-zA-Z0-9.\-_]/g, "") : "evidence.jpg";
    const fileName = `${incidentId}/${Date.now()}-${cleanName || "evidence.jpg"}`;
    let storagePath = fileName;

    // 3. Perform genuine Storage upload when connected to Supabase
    if (process.env.USE_MOCK_STORE !== "true" && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("evidence")
        .upload(fileName, buffer, { contentType: mimeType, upsert: false });

      if (uploadError) {
        console.error("[processEvidenceUpload] Supabase storage upload error:", uploadError);
        return NextResponse.json(
          { error: `Storage upload failed: ${uploadError.message}` },
          { status: 500 }
        );
      }
      if (uploadData?.path) {
        storagePath = uploadData.path;
      }
    }

    // 4. Insert into evidence table via repository
    const record = await repository.saveEvidence({
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      incidentId,
      type: "PHOTO",
      storagePath,
      description: description || null,
      capturedBy,
      createdAt: new Date().toISOString(),
    });

    // 5. Append to append-only audit events ledger
    await repository.appendAuditEvent({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      incidentId,
      actor: capturedBy,
      eventType: "EVIDENCE_ADDED",
      payloadJson: { evidenceId: record.id, type: "PHOTO", storagePath, description },
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[processEvidenceUpload] Upload error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
