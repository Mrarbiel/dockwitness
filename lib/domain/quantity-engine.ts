import { DiscrepancyResult } from "../types";

/**
 * Validates that a quantity represents a valid non-negative discrete carton/pallet count.
 * Guards defensively against NaN, non-finite numbers, non-integers, negative values,
 * and unsafe integer boundaries.
 */
export function validateFreightQuantity(val: unknown, paramName: string): number {
  if (typeof val !== "number" || Number.isNaN(val)) {
    throw new TypeError(`${paramName} must be a valid number, received ${String(val)}`);
  }
  if (!Number.isFinite(val)) {
    throw new TypeError(`${paramName} must be finite, received ${val}`);
  }
  if (!Number.isInteger(val)) {
    throw new TypeError(`${paramName} must be an integer, received ${val}`);
  }
  if (val < 0) {
    throw new RangeError(`${paramName} cannot be negative, received ${val}`);
  }
  if (val > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${paramName} exceeds maximum safe integer, received ${val}`);
  }
  return val;
}

/**
 * Deterministic Quantity Engine
 * Formula: delta = observedQty - expectedQty
 * Invariant: delta < 0 => SHORTAGE; delta > 0 => OVERAGE; delta === 0 => null
 * LLM-proposed deltas are strictly ignored.
 */
export function calculateDiscrepancy(
  expectedQty: number,
  observedQty: number
): DiscrepancyResult {
  const cleanExpected = validateFreightQuantity(expectedQty, "Expected quantity");
  const cleanObserved = validateFreightQuantity(observedQty, "Observed quantity");

  const delta = cleanObserved - cleanExpected;

  if (delta < 0) {
    return {
      delta,
      type: "SHORTAGE",
      magnitude: Math.abs(delta),
      observedQty: cleanObserved,
      expectedQty: cleanExpected,
    };
  }

  if (delta > 0) {
    return {
      delta,
      type: "OVERAGE",
      magnitude: delta,
      observedQty: cleanObserved,
      expectedQty: cleanExpected,
    };
  }

  return {
    delta: 0,
    type: null,
    magnitude: 0,
    observedQty: cleanObserved,
    expectedQty: cleanExpected,
  };
}

