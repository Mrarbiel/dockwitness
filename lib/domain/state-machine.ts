import { IncidentState } from "../types";

export type IncidentAction =
  | "START_CAPTURE"
  | "DETECT_EXCEPTION"
  | "REQUIRE_EVIDENCE"
  | "START_PARTY_REVIEW"
  | "COMPLETE_EVIDENCE"
  | "CLOSE"
  | "REQUEST_CLARIFICATION"
  | "ESCALATE_OPS";

export interface IncidentContext {
  hasDamage?: boolean;
  hasPhotos?: boolean;
  hasDiscrepancy?: boolean;
  driverAttested?: boolean;
}

const FORBIDDEN_STATES = [
  "CLAIM_APPROVED",
  "CARRIER_LIABLE",
  "SHIPPER_LIABLE",
  "FAULT_CONFIRMED",
];

export function transitionState(
  current: IncidentState,
  action: IncidentAction,
  context: IncidentContext = {}
): IncidentState {
  // Guard against forbidden states
  if (FORBIDDEN_STATES.includes(action as string)) {
    throw new Error(`Forbidden state transition attempted: ${action}`);
  }

  switch (action) {
    case "START_CAPTURE":
      return "CAPTURING";
    case "DETECT_EXCEPTION":
      if (context.hasDamage && !context.hasPhotos) {
        return "EVIDENCE_REQUIRED";
      }
      return "EXCEPTION_DETECTED";
    case "REQUIRE_EVIDENCE":
      return "EVIDENCE_REQUIRED";
    case "START_PARTY_REVIEW":
      return "PARTY_REVIEW";
    case "COMPLETE_EVIDENCE":
      return "READY_FOR_OPS_REVIEW";
    case "REQUEST_CLARIFICATION":
      return "NEEDS_CLARIFICATION";
    case "ESCALATE_OPS":
      return "OPS_ESCALATION_REQUIRED";
    case "CLOSE":
      return "CLOSED";
    default:
      return current;
  }
}
