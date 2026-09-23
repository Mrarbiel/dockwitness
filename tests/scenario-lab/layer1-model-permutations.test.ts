import { describe, it, expect } from "vitest";
import { calculateDiscrepancy } from "@/lib/domain/quantity-engine";
import { evaluateAgreement } from "@/lib/domain/agreement-engine";
import { evaluateReadiness, ReadinessInput } from "@/lib/domain/readiness-engine";
import { transitionState } from "@/lib/domain/state-machine";
import { AttestationPosition, AgreementStatus } from "@/lib/types";

describe("Layer 1: Exhaustive Model-Based Permutation Suite", () => {
  describe("Invariant 1: Deterministic Delta Arithmetic & Quantity Classifications", () => {
    const expectedQuantities = [1, 10, 48, 100, 500];
    const observedQuantities = [0, 1, 10, 47, 48, 49, 100, 501];

    let count = 0;
    for (const exp of expectedQuantities) {
      for (const obs of observedQuantities) {
        count++;
        const result = calculateDiscrepancy(exp, obs);
        it(`[Permutation ${count}] exp=${exp}, obs=${obs} => delta=${obs - exp}`, () => {
          expect(result.delta).toBe(obs - exp);
          expect(result.expectedQty).toBe(exp);
          expect(result.observedQty).toBe(obs);

          if (obs < exp) {
            expect(result.type).toBe("SHORTAGE");
            expect(result.magnitude).toBe(exp - obs);
          } else if (obs > exp) {
            expect(result.type).toBe("OVERAGE");
            expect(result.magnitude).toBe(obs - exp);
          } else {
            expect(result.type).toBeNull();
            expect(result.magnitude).toBe(0);
          }
        });
      }
    }
  });

  describe("Invariant 2: Full Two-Party Attestation Agreement Truth Matrix", () => {
    const allPositions: AttestationPosition[] = [
      "CONFIRM",
      "DISPUTE",
      "NO_KNOWLEDGE",
      "NOT_ASKED",
      "REFUSED_TO_ATTEST",
      "DRIVER_UNAVAILABLE",
    ];

    allPositions.forEach((rx) => {
      allPositions.forEach((dr) => {
        it(`Evaluates rx=${rx} + dr=${dr} deterministically without heuristic guessing`, () => {
          const status = evaluateAgreement(rx, dr);

          // Invariant: Silence is NEVER consent
          if (dr === "NOT_ASKED" && rx !== "CONFIRM" && rx !== "REFUSED_TO_ATTEST" && rx !== "DRIVER_UNAVAILABLE") {
            expect(status).not.toBe("CONFIRMED_BY_BOTH");
          }
          if (rx === "NOT_ASKED" && dr !== "CONFIRM" && dr !== "REFUSED_TO_ATTEST" && dr !== "DRIVER_UNAVAILABLE") {
            expect(status).not.toBe("CONFIRMED_BY_BOTH");
          }

          // Invariant: Refusal is distinct from dispute
          if (dr === "REFUSED_TO_ATTEST" || rx === "REFUSED_TO_ATTEST") {
            expect(status).toBe("DRIVER_REFUSED");
            expect(status).not.toBe("DISPUTED");
          }

          // Invariant: Absence is distinct from dispute and confirmation
          if ((dr === "DRIVER_UNAVAILABLE" || rx === "DRIVER_UNAVAILABLE") && dr !== "REFUSED_TO_ATTEST" && rx !== "REFUSED_TO_ATTEST") {
            expect(status).toBe("DRIVER_UNAVAILABLE");
            expect(status).not.toBe("DISPUTED");
            expect(status).not.toBe("CONFIRMED_BY_BOTH");
          }

          // Invariant: CONFIRMED_BY_BOTH requires BOTH parties to confirm
          if (rx === "CONFIRM" && dr === "CONFIRM") {
            expect(status).toBe("CONFIRMED_BY_BOTH");
          } else if (rx !== "CONFIRM" || dr !== "CONFIRM") {
            expect(status).not.toBe("CONFIRMED_BY_BOTH");
          }
        });
      });
    });
  });

  describe("Invariant 3: Readiness State Permutation Invariants", () => {
    const booleanOptions = [true, false];
    const observedOptions: (number | null)[] = [null, 47, 48];
    const cleanPolicies: ("FAST_PATH" | "REQUIRE_BILATERAL")[] = ["FAST_PATH", "REQUIRE_BILATERAL"];

    let permutationIndex = 0;

    for (const observedQty of observedOptions) {
      for (const hasQuoteProvenance of booleanOptions) {
        for (const hasDamage of booleanOptions) {
          for (const hasPhotos of booleanOptions) {
            for (const driverAttested of booleanOptions) {
              for (const driverRefused of booleanOptions) {
                for (const policy of cleanPolicies) {
                  permutationIndex++;
                  const hasDiscrepancy = observedQty !== null && observedQty !== 48;
                  const isInspected = observedQty !== null;

                  const input: ReadinessInput = {
                    hasDamage,
                    hasPhotos,
                    hasDiscrepancy,
                    driverAttested,
                    driverRefused,
                    receiverInspected: isInspected,
                    observedQuantity: observedQty,
                    hasQuoteProvenance,
                    cleanReceiptPolicy: policy,
                  };

                  const result = evaluateReadiness(input);

                  it(`[Readiness Permutation ${permutationIndex}] obs=${observedQty}, prov=${hasQuoteProvenance}, dmg=${hasDamage}, photos=${hasPhotos}, drvAtt=${driverAttested}, drvRef=${driverRefused}, policy=${policy}`, () => {
                    // Invariant: Uninspected or unprovenanced receipts can NEVER be ready
                    if (!isInspected || !hasQuoteProvenance) {
                      expect(result.readyForReview).toBe(false);
                      expect(result.status).toBe("AWAITING_INSPECTION");
                    }

                    // Invariant: Damage without photos can NEVER be ready
                    if (isInspected && hasQuoteProvenance && hasDamage && !hasPhotos) {
                      expect(result.readyForReview).toBe(false);
                      expect(result.status).toBe("BLOCKED_PHOTO_REQUIRED");
                    }

                    // Invariant: Discrepancy without driver attestation or refusal can NEVER be ready
                    if (
                      isInspected &&
                      hasQuoteProvenance &&
                      (!hasDamage || hasPhotos) &&
                      hasDiscrepancy &&
                      !driverAttested &&
                      !driverRefused
                    ) {
                      expect(result.readyForReview).toBe(false);
                      expect(result.status).toBe("PENDING_DRIVER_ATTESTATION");
                    }

                    // Invariant: Clean receipt fast-path allows immediate review when zero damage and count matches
                    if (
                      isInspected &&
                      hasQuoteProvenance &&
                      !hasDamage &&
                      !hasDiscrepancy &&
                      policy === "FAST_PATH"
                    ) {
                      expect(result.readyForReview).toBe(true);
                      expect(result.status).toBe("READY_FOR_OPS_REVIEW");
                    }
                  });
                }
              }
            }
          }
        }
      }
    }
  });

  describe("Invariant 4: Forbidden Legal Liability States", () => {
    const forbiddenStates = [
      "CLAIM_APPROVED",
      "CARRIER_LIABLE",
      "SHIPPER_LIABLE",
      "FAULT_CONFIRMED",
    ];

    for (const forbidden of forbiddenStates) {
      it(`Strictly throws error if system attempts to transition to forbidden liability state: ${forbidden}`, () => {
        expect(() => {
          transitionState("PARTY_REVIEW", forbidden as any);
        }).toThrow(/Forbidden state transition/);
      });
    }

    it("Transitions safely to OPS_ESCALATION_REQUIRED via ESCALATE_OPS action", () => {
      const state = transitionState("CAPTURING", "ESCALATE_OPS");
      expect(state).toBe("OPS_ESCALATION_REQUIRED");
    });
  });
});
