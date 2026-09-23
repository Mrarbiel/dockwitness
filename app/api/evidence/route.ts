import { processEvidenceUpload } from "@/lib/domain/evidence-upload";

export async function POST(request: Request) {
  return processEvidenceUpload(request);
}
