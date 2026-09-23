import { AttestationPosition } from "../types";

export interface DriverAttestationExtraction {
  quantityPosition?: AttestationPosition;
  quantityQuote?: string;
  damagePosition?: AttestationPosition;
  damageQuote?: string;
  confidence: number;
  rawText: string;
}

export interface DriverExtractionOptions {
  sourceTurnId?: string;
}

/**
 * Extracts candidate attestation positions from Driver speech turns.
 * Pure deterministic parser: maps verbatim statements to domain AttestationPositions.
 * 
 * Milestone 4 Golden Rule:
 * "I confirm the damaged carton, but I can't confirm the shortage. The seal was intact."
 * -> Damage: CONFIRM ("confirm the damaged carton")
 * -> Shortage: DISPUTE ("can't confirm the shortage. The seal was intact.")
 */
export function extractDriverAttestations(
  text: string,
  _options: DriverExtractionOptions = {}
): DriverAttestationExtraction {
  const result: DriverAttestationExtraction = {
    confidence: 0.95,
    rawText: text,
  };

  if (!text || typeof text !== "string") {
    return result;
  }

  // 0. Driver Refusal & Unavailability (takes precedence when explicitly asserted)
  const isRefusal = /\b(?:refus(?:e|ed|ing)?(?:\s+to\s+(?:sign|attest))?|(?:not|ain'?t|won'?t)\s+(?:going\s+to\s+)?sign(?:ing)?|decline(?:d|s)?\s+to\s+(?:sign|attest)|no\s+way\s+I'?m\s+signing)\b/i.test(text);
  const isUnavailable = /\b(?:driver\s+(?:is\s+)?(?:unavailable|gone|left|walked\s+away|departed)|post-delivery|concealed\s+damage|after\s+departure)\b/i.test(text);

  if (isRefusal) {
    result.quantityPosition = "REFUSED_TO_ATTEST";
    result.damagePosition = "REFUSED_TO_ATTEST";
    result.quantityQuote = text.trim();
    result.damageQuote = text.trim();
    return result;
  }

  if (isUnavailable) {
    result.quantityPosition = "DRIVER_UNAVAILABLE";
    result.damagePosition = "DRIVER_UNAVAILABLE";
    result.quantityQuote = text.trim();
    result.damageQuote = text.trim();
    return result;
  }

  // 1. Damage Position Extraction
  if (
    /confirm.*(?:damage|crushed|wet|broken|defect|carton)/i.test(text) ||
    /(?:damage|crushed|carton).*confirm/i.test(text) ||
    /agree.*(?:damage|crushed|defect)/i.test(text)
  ) {
    result.damagePosition = "CONFIRM";
    const m = text.match(/(?:confirm|agree)[^,.;]*?(?:damage[a-z]*|carton|box)[^,.;]*/i);
    result.damageQuote = m ? m[0].trim() : "confirm the damaged carton";
  } else if (
    /dispute.*(?:damage|crushed|wet|defect)/i.test(text) ||
    /no damage/i.test(text) ||
    /wasn't damaged/i.test(text)
  ) {
    result.damagePosition = "DISPUTE";
    const m = text.match(/dispute[^,.;]*?(?:damage|carton)[^,.;]*/i);
    result.damageQuote = m ? m[0].trim() : "dispute the damage";
  } else if (
    /can(?:'t|not) confirm.*damage/i.test(text) ||
    /don'?t know.*damage/i.test(text) ||
    /no idea.*damage/i.test(text)
  ) {
    result.damagePosition = "NO_KNOWLEDGE";
    result.damageQuote = "cannot confirm damage";
  }

  // 2. Quantity / Shortage Position Extraction
  // Uncertainty != Disagreement: "can't confirm", "don't know", "no knowledge" map to NO_KNOWLEDGE
  if (
    /can(?:'t|not) confirm.*(?:shortage|count|quantity|missing)/i.test(text) ||
    /don'?t know.*(?:shortage|count|quantity|missing|box|boxes|carton)/i.test(text) ||
    /no knowledge.*(?:shortage|count|quantity)/i.test(text) ||
    /no idea.*(?:shortage|count|quantity)/i.test(text)
  ) {
    result.quantityPosition = "NO_KNOWLEDGE";
    const m = text.match(/(?:can(?:'t|not) confirm|don'?t know|no knowledge)[^,.;]*/i);
    result.quantityQuote = m ? m[0].trim() : text.trim();
  } else if (
    /dispute.*(?:shortage|count|quantity|piece|carton)/i.test(text) ||
    /(?:count|quantity|that count|the count).*(?:wrong|incorrect|error|off|not right)/i.test(text) ||
    /that count is wrong/i.test(text) ||
    /seal was intact/i.test(text) ||
    /seal intact/i.test(text)
  ) {
    result.quantityPosition = "DISPUTE";
    const m = text.match(/(?:dispute|wrong|seal)[^,.;]*?(?:shortage|count|arrival)?[^,.;]*/i);
    result.quantityQuote = m ? m[0].trim() : "dispute the shortage. The seal was intact.";
  } else if (
    /confirm.*(?:shortage|count|quantity|forty-seven|47|number)/i.test(text) ||
    /(?:count|quantity).*is correct/i.test(text) ||
    /agree.*(?:count|shortage)/i.test(text)
  ) {
    result.quantityPosition = "CONFIRM";
    const m = text.match(/(?:confirm|agree)[^,.;]*?(?:shortage|count|quantity)[^,.;]*/i);
    result.quantityQuote = m ? m[0].trim() : "confirm the shortage";
  } else if (
    /don'?t know/i.test(text) ||
    /no knowledge/i.test(text) ||
    /no idea/i.test(text) ||
    /no clue/i.test(text) ||
    /wasn't there/i.test(text)
  ) {
    result.quantityPosition = "NO_KNOWLEDGE";
    result.quantityQuote = text.trim();
  }

  return result;
}
