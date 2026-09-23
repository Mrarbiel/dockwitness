import { PartyRole, AttestationPosition, AgreementStatus } from "@/lib/types";

export interface ObservedQuantityState {
  quantity: number | null;
  expectedQuantity: number;
  unit: string;
  sourceQuote: string | null;
  sourceTurnId: string | null;
  speakerRole: PartyRole | null;
  confidence: number;
  isOverridden: boolean;
  originalSpokenQuantity: number | null;
  overrideReason?: string;
  overrideTimestamp?: string;
}

export interface ClericalOverrideEvent {
  previousQty: number | null;
  newQty: number;
  reason: string;
  timestamp: string;
}

export interface ScenarioInfo {
  po: string;
  id: string;
  title: string;
  badge: string;
  expectedQty: number;
}

export interface DriverAttestationState {
  quantityPosition: AttestationPosition;
  damagePosition?: AttestationPosition;
  quantityQuote?: string | null;
  quantityTurnId?: string | null;
  damageQuote?: string | null;
  damageTurnId?: string | null;
  statement?: string | null;
  sourceTurnId?: string | null;
  timestamp?: string;
  isCommitted?: boolean;
}

export interface TwoPartyAgreementState {
  quantityAgreement: AgreementStatus;
  damageAgreement: AgreementStatus | null;
  receiverQuantityPos: AttestationPosition;
  driverQuantityPos: AttestationPosition;
  receiverDamagePos: AttestationPosition;
  driverDamagePos: AttestationPosition;
  receiverTurnId?: string | null;
  driverTurnId?: string | null;
  receiverQuote?: string | null;
  driverQuote?: string | null;
}
