import { PartyRole } from "@/lib/types";

export interface DamageReport {
  cartonReference?: string | null;
  condition: string;
  sourceQuote: string;
  sourceTurnId?: string | null;
  speakerRole?: PartyRole;
  confidence?: number;
}

export interface EvidenceItem {
  id: string;
  incidentId: string;
  type: "PHOTO" | "AUDIO" | "DOCUMENT";
  storagePath: string;
  description?: string | null;
  capturedBy: string;
  createdAt: string;
  previewUrl?: string;
}

export interface DomainReadiness {
  readyForReview: boolean;
  missingRequirements: string[];
}

export interface EvidenceEvaluationState {
  incidentId: string;
  readiness: DomainReadiness;
  hasDamage: boolean;
  hasPhotos: boolean;
  hasDiscrepancy: boolean;
  driverAttested: boolean;
  timestamp?: string;
}
