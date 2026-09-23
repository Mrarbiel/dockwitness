export * from "./number-words";
export * from "./quantity-extractor";
export * from "./driver-attestation-extractor";

import {
  extractCandidateQuantity,
  extractCandidateDamage,
  CandidateQuantity,
  CandidateDamage,
  ExtractionOptions,
} from "./quantity-extractor";

export interface CandidateExtractionResult {
  observedQty?: number;
  unit?: string;
  damageReported?: boolean;
  damageDescription?: string;
  sourceQuote?: string;
  quantityCandidate?: CandidateQuantity | null;
  damageCandidate?: CandidateDamage | null;
}

export const EXTRACTION_VERSION = "0.3.0";

/**
 * Unified entry point to extract all freight candidate facts from transcript turns.
 * INVARIANT: Never computes discrepancy or delta math.
 */
export function extractCandidates(
  text: string,
  options: ExtractionOptions = {}
): CandidateExtractionResult {
  const quantityCandidate = extractCandidateQuantity(text, options);
  const damageCandidate = extractCandidateDamage(text, options);

  return {
    observedQty: quantityCandidate?.observedQty,
    unit: quantityCandidate?.unit,
    damageReported: Boolean(damageCandidate),
    damageDescription: damageCandidate?.condition,
    sourceQuote: quantityCandidate?.sourceQuote || damageCandidate?.sourceQuote,
    quantityCandidate,
    damageCandidate,
  };
}
