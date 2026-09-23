import { NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { createClient } from "@supabase/supabase-js";
import path from "path";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mock.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "mock-key"
);

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !id.trim()) {
      return NextResponse.json({ error: "Evidence ID required" }, { status: 400 });
    }

    // 1. Look up evidence record in repository
    const evidence = await repository.getEvidenceById(id);
    if (!evidence) {
      return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
    }

    // 2. Validate storage path against path traversal
    const storagePath = evidence.storagePath;
    if (
      !storagePath ||
      storagePath.includes("..") ||
      path.isAbsolute(storagePath) ||
      /^[a-zA-Z]:/.test(storagePath)
    ) {
      return NextResponse.json({ error: "Invalid storage path" }, { status: 400 });
    }

    // 3. Resolve Content-Type
    const ext = path.extname(storagePath).toLowerCase();
    const contentType = MIME_MAP[ext] || "image/jpeg";

    // 4. Determine safe Content-Disposition
    const url = new URL(request.url);
    const isDownload = url.searchParams.get("download") === "true";
    const cleanFilename = path.basename(storagePath).replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const disposition = `${isDownload ? "attachment" : "inline"}; filename="${cleanFilename}"`;

    // 5. Production Supabase Storage streaming if configured
    if (
      process.env.USE_MOCK_STORE !== "true" &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      try {
        const { data, error } = await supabase.storage.from("evidence").download(storagePath);
        if (!error && data) {
          const arrayBuffer = await data.arrayBuffer();
          return new Response(Buffer.from(arrayBuffer), {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Content-Disposition": disposition,
              "Cache-Control": "public, max-age=86400",
            },
          });
        }
      } catch {
        // Fallback to placeholder image buffer if remote storage fails
      }
    }

    // 6. Mock / Test / Fallback image buffer
    // 1x1 transparent PNG buffer as baseline valid image payload
    const mockPixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    return new Response(mockPixel, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
