export interface ReadinessInput {
  hasDamage: boolean;
  hasPhotos: boolean;
  hasDiscrepancy: boolean;
  driverAttested: boolean;
  driverRefused?: boolean;
  driverUnavailable?: boolean;
  receiverInspected?: boolean;
  observedQuantity?: number | null;
  hasQuoteProvenance?: boolean;
  manifestMismatch?: boolean;
  severeDamageEscalation?: boolean;
  cleanReceiptPolicy?: "FAST_PATH" | "REQUIRE_BILATERAL";
}

export type ReadinessStatus =
  | "AWAITING_INSPECTION"
  | "BLOCKED_PHOTO_REQUIRED"
  | "PENDING_DRIVER_ATTESTATION"
  | "READY_FOR_OPS_REVIEW"
  | "OPS_ESCALATION_REQUIRED";

export interface ReadinessResult {
  readyForReview: boolean;
  status: ReadinessStatus;
  missingRequirements: string[];
}

export function evaluateReadiness(input: ReadinessInput): ReadinessResult {
  const missingRequirements: string[] = [];
  const isInspected = input.receiverInspected ?? (input.observedQuantity !== null && input.observedQuantity !== undefined);
  const hasProvenance = input.hasQuoteProvenance ?? false;

  // Manifest Mismatch Invariant: Stop normal workflow and escalate
  if (input.manifestMismatch) {
    missingRequirements.push("Manifest mismatch detected: PO/BOL does not match expected freight manifest");
    return {
      readyForReview: false,
      status: "OPS_ESCALATION_REQUIRED",
      missingRequirements,
    };
  }

  if (!isInspected) {
    missingRequirements.push("Receiver count inspection required before review");
  }

  if (isInspected && !hasProvenance) {
    missingRequirements.push("Verbatim transcript quote provenance required");
  }

  if (input.hasDamage && !input.hasPhotos) {
    missingRequirements.push("Photo evidence required for damaged items");
  }

  // Driver attestation is satisfied if driver confirmed/disputed, or if driver refused to attest, or if driver is unavailable
  const driverPositionRecorded = input.driverAttested || Boolean(input.driverRefused) || Boolean(input.driverUnavailable);

  if (input.hasDiscrepancy && !driverPositionRecorded) {
    missingRequirements.push("Driver attestation required for quantity discrepancy");
  }

  // Bilateral clean receipt policy: if facility mandates bilateral clean-receipt, require driver attestation
  if (
    !input.hasDamage &&
    !input.hasDiscrepancy &&
    input.cleanReceiptPolicy === "REQUIRE_BILATERAL" &&
    !driverPositionRecorded
  ) {
    missingRequirements.push("Bilateral driver sign-off required for clean receipt by facility policy");
  }

  let status: ReadinessStatus = "READY_FOR_OPS_REVIEW";
  if (!isInspected || !hasProvenance) {
    status = "AWAITING_INSPECTION";
  } else if (input.hasDamage && !input.hasPhotos) {
    status = "BLOCKED_PHOTO_REQUIRED";
  } else if (
    (input.hasDiscrepancy && !driverPositionRecorded) ||
    (!input.hasDamage && !input.hasDiscrepancy && input.cleanReceiptPolicy === "REQUIRE_BILATERAL" && !driverPositionRecorded)
  ) {
    status = "PENDING_DRIVER_ATTESTATION";
  }

  return {
    readyForReview: missingRequirements.length === 0,
    status,
    missingRequirements,
  };
}
