export type PartyRole = "RECEIVER" | "DRIVER" | "SYSTEM" | "OPS";

export type AttestationPosition =
  | "CONFIRM"
  | "DISPUTE"
  | "NO_KNOWLEDGE"
  | "NOT_ASKED"
  | "REFUSED_TO_ATTEST"
  | "DRIVER_UNAVAILABLE";

export type AgreementStatus =
  | "CONFIRMED_BY_BOTH"
  | "DISPUTED"
  | "DISPUTED_OR_UNCONFIRMED"
  | "RECEIVER_ONLY"
  | "DRIVER_ONLY"
  | "PENDING_REVIEW"
  | "DRIVER_REFUSED"
  | "DRIVER_UNAVAILABLE";

export type IncidentState =
  | "DRAFT"
  | "CAPTURING"
  | "EXCEPTION_DETECTED"
  | "EVIDENCE_REQUIRED"
  | "PARTY_REVIEW"
  | "READY_FOR_OPS_REVIEW"
  | "CLOSED"
  | "NEEDS_CLARIFICATION"
  | "OPS_ESCALATION_REQUIRED";

export type DockOperatingMode =
  | "SHARED_DOCK"      // Primary default: Rugged tablet/handheld, device mic/cam/speaker, shared
  | "RECEIVER_HEADSET" // Optional: Receiver warehouse headset + tablet, driver uses tablet
  | "MOUNTED_KIOSK"    // Optional: Mounted tablet/terminal, far-field
  | "DEMO";            // Hackathon: Golden audio via real AssemblyAI APIs

export type CleanReceiptPolicy = "FAST_PATH" | "REQUIRE_BILATERAL";

export type ExceptionType = "SHORTAGE" | "OVERAGE" | "DAMAGE";

export interface DiscrepancyResult {
  delta: number;
  type: "SHORTAGE" | "OVERAGE" | null;
  magnitude: number;
  /** The actual observed quantity that was counted (null when not yet recorded). */
  observedQty: number;
  /** The expected quantity from the purchase order manifest. */
  expectedQty: number;
}

export interface ShipmentItem {
  id: string;
  sku: string;
  description: string;
  expectedQty: number;
  unit: string;
}

export interface Shipment {
  id: string;
  poNumber: string;
  bolNumber: string;
  carrierName: string;
  trailerNumber: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  items: ShipmentItem[];
}

export interface Incident {
  id: string;
  shipmentId: string;
  incidentNumber: string;
  status: IncidentState;
  receiverName?: string | null;
  driverName?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

export interface TranscriptTurnRecord {
  id: string;
  incidentId: string;
  speakerRole: PartyRole;
  text: string;
  startMs?: number;
  endMs?: number;
  isFinal?: boolean;
  confidence?: number;
  createdAt: string;
}

export interface DiscrepancyException {
  id: string;
  incidentId: string;
  shipmentItemId?: string;
  type: ExceptionType;
  expectedQty: number;
  observedQty: number;
  delta: number;
  damageDescription?: string | null;
  agreementStatus: AgreementStatus;
  createdAt?: string;
}

export interface ObservationRecord {
  id: string;
  incidentId: string;
  fieldKey: string;
  valueJson: Record<string, unknown> | unknown;
  sourceTurnId?: string | null;
  sourceQuote: string;
  speakerRole: PartyRole;
  confidence: number;
  confirmed?: boolean;
  createdAt?: string;
}

export interface EvidenceRecord {
  id: string;
  incidentId: string;
  type: "PHOTO" | "AUDIO" | "DOCUMENT";
  storagePath: string;
  description?: string | null;
  capturedBy: string;
  createdAt?: string;
}

export interface AttestationRecord {
  id: string;
  incidentId: string;
  exceptionId: string;
  partyRole: PartyRole;
  position: AttestationPosition;
  sourceTurnId?: string | null;
  createdAt?: string;
}

export interface AuditEventRecord {
  id: string;
  incidentId: string;
  actor: string;
  eventType: string;
  payloadJson: Record<string, unknown>;
  createdAt?: string;
}

