import {
  AttestationPosition,
  AgreementStatus,
  DiscrepancyException,
  AttestationRecord,
  ObservationRecord,
} from "../types";

const VALID_POSITIONS: ReadonlySet<string> = new Set([
  "CONFIRM",
  "DISPUTE",
  "NO_KNOWLEDGE",
  "NOT_ASKED",
  "REFUSED_TO_ATTEST",
  "DRIVER_UNAVAILABLE",
]);

/**
 * Validates that an attestation position is one of the valid domain enum values.
 */
export function assertValidPosition(
  pos: unknown,
  partyName: string
): asserts pos is AttestationPosition {
  if (typeof pos !== "string" || !VALID_POSITIONS.has(pos)) {
    throw new TypeError(
      `Invalid ${partyName} attestation position: ${String(pos)}`
    );
  }
}

/**
 * Resolves the receiver's genuine position on an exception from recorded facts.
 * Invariant: Silence is NEVER consent. Only genuine receiver inspection provenance
 * constitutes a CONFIRM position.
 */
export function resolveReceiverPosition(
  exception: DiscrepancyException,
  observations: ObservationRecord[],
  attestations?: AttestationRecord[]
): AttestationPosition;
export function resolveReceiverPosition(
  exception: DiscrepancyException,
  attestations: AttestationRecord[],
  observations: ObservationRecord[]
): AttestationPosition;
export function resolveReceiverPosition(
  exception: DiscrepancyException,
  arg1: ObservationRecord[] | AttestationRecord[],
  arg2?: ObservationRecord[] | AttestationRecord[]
): AttestationPosition {
  let attestations: AttestationRecord[] = [];
  let observations: ObservationRecord[] = [];

  // Disambiguate arguments whether (obs, atts) or (atts, obs) or just (obs)
  if (Array.isArray(arg1) && arg1.length > 0) {
    if ("fieldKey" in arg1[0]) {
      observations = arg1 as ObservationRecord[];
      if (Array.isArray(arg2)) attestations = arg2 as AttestationRecord[];
    } else {
      attestations = arg1 as AttestationRecord[];
      if (Array.isArray(arg2)) observations = arg2 as ObservationRecord[];
    }
  } else if (Array.isArray(arg2) && arg2.length > 0) {
    if ("fieldKey" in arg2[0]) {
      observations = arg2 as ObservationRecord[];
    } else {
      attestations = arg2 as AttestationRecord[];
    }
  }

  // 1. Explicit attestation takes precedence if present
  const explicitRxAtt = attestations
    .filter((a) => a.exceptionId === exception.id && a.partyRole === "RECEIVER")
    .pop();

  if (explicitRxAtt) {
    return explicitRxAtt.position;
  }

  // 2. Reconstruct from genuine inspection observations
  if (exception.type === "SHORTAGE" || exception.type === "OVERAGE") {
    const rxCountObs = observations.find(
      (o) => o.speakerRole === "RECEIVER" && o.fieldKey === "observed_qty"
    );
    if (rxCountObs) {
      return "CONFIRM";
    }
  }

  if (exception.type === "DAMAGE") {
    const rxDamageObs = observations.find(
      (o) =>
        o.speakerRole === "RECEIVER" &&
        (o.fieldKey === "damage_reported" || o.fieldKey === "damage")
    );
    if (rxDamageObs) {
      return "CONFIRM";
    }
  }

  // 3. If no explicit attestation and no receiver observation: NOT_ASKED
  return "NOT_ASKED";
}

/**
 * Pure Deterministic Two-Party Agreement Evaluator
 *
 * Invariants:
 * 1. Silence is NEVER consent (NOT_ASKED cannot contribute to confirmation).
 * 2. Absence is NEVER confirmation (DRIVER_UNAVAILABLE is distinct from CONFIRM/DISPUTE).
 * 3. Refusal is distinct from dispute (REFUSED_TO_ATTEST produces DRIVER_REFUSED, never DISPUTED).
 * 4. If only ONE party has provided a position (the other is NOT_ASKED),
 *    the status is strictly RECEIVER_ONLY or DRIVER_ONLY.
 * 5. An active DISPUTE by either party produces DISPUTED.
 * 6. NO_KNOWLEDGE without a DISPUTE produces DISPUTED_OR_UNCONFIRMED.
 * 7. CONFIRMED_BY_BOTH requires explicit CONFIRM from BOTH parties.
 */
export function evaluateAgreement(
  receiverPos: AttestationPosition,
  driverPos: AttestationPosition
): AgreementStatus {
  assertValidPosition(receiverPos, "Receiver");
  assertValidPosition(driverPos, "Driver");

  // Case 1: Neither party has been asked
  if (receiverPos === "NOT_ASKED" && driverPos === "NOT_ASKED") {
    return "PENDING_REVIEW";
  }

  // Case 2: Driver explicit refusal or unavailability (distinct from dispute)
  if (driverPos === "REFUSED_TO_ATTEST" || receiverPos === "REFUSED_TO_ATTEST") {
    return "DRIVER_REFUSED";
  }
  if (driverPos === "DRIVER_UNAVAILABLE" || receiverPos === "DRIVER_UNAVAILABLE") {
    return "DRIVER_UNAVAILABLE";
  }

  // Case 3: Only one party has provided an attestation
  if (driverPos === "NOT_ASKED") {
    return "RECEIVER_ONLY";
  }
  if (receiverPos === "NOT_ASKED") {
    return "DRIVER_ONLY";
  }

  // Case 4: Both parties have provided an attestation
  if (receiverPos === "CONFIRM" && driverPos === "CONFIRM") {
    return "CONFIRMED_BY_BOTH";
  }

  if (receiverPos === "DISPUTE" || driverPos === "DISPUTE") {
    return "DISPUTED";
  }

  if (receiverPos === "NO_KNOWLEDGE" || driverPos === "NO_KNOWLEDGE") {
    return "DISPUTED_OR_UNCONFIRMED";
  }

  return "PENDING_REVIEW";
}
