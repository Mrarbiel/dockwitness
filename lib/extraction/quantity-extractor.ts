import { parseSpokenNumber } from "./number-words";
import { PartyRole } from "../types";

export interface CandidateQuantity {
  observedQty: number;
  unit: string;
  sourceQuote: string;
  startIndex: number;
  endIndex: number;
  sourceTurnId?: string;
  speakerRole?: PartyRole;
  confidence: number;
  extractor: "regex_spoken_number" | "regex_digit" | "dozen_multiplier";
}

export interface CandidateDamage {
  cartonReference: string | null;
  condition: string;
  sourceQuote: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
  sourceTurnId?: string;
  speakerRole?: PartyRole;
}

export interface ExtractionOptions {
  sourceTurnId?: string;
  speakerRole?: PartyRole;
  words?: Array<{ text: string; confidence?: number; start?: number; end?: number }>;
}

export const PACKAGING_UNITS_REGEX =
  "cartons?|box(?:es)?|pallets?|units?|pieces?|pcs|cases?|packages?|pkgs?|items?|crates?|drums?|totes?";

const COUNT_VERBS_REGEX =
  "counted|count(?:\\s+is)?|have|got|received|unloaded|seeing|see|shows|total\\s+count\\s+is|total\\s+is|count\\s+complete:?";

/**
 * Extracts candidate observed freight quantities from transcript text.
 * INVARIANT: NEVER computes delta, shortage, or overage.
 */
export function extractCandidateQuantity(
  text: string,
  options: ExtractionOptions = {}
): CandidateQuantity | null {
  if (!text || typeof text !== "string") return null;

  // 1. Mask out carton identifiers: "carton thirty-one", "carton 31", "carton AX-17", etc.
  const cartonIdRegex = new RegExp(
    `\\b(?:carton|box|unit|item|case)\\s+(?:#|number\\s+)?([a-z0-9-]+(?:\\s+[a-z0-9-]+)?)(?=[,.;]|\\s+(?:is|was|has|had|with|for|crushed|wet|damaged|torn|broken|dented|punctured)|$)`,
    "gi"
  );
  const excludedRanges: Array<{ start: number; end: number }> = [];
  let idMatch: RegExpExecArray | null;
  while ((idMatch = cartonIdRegex.exec(text)) !== null) {
    const id = idMatch[1].toLowerCase().trim();
    if (["on", "in", "is", "at", "are", "was", "were", "has", "had", "with", "for", "to", "of", "and", "the"].includes(id)) continue;
    excludedRanges.push({ start: idMatch.index, end: idMatch.index + idMatch[0].length });
  }

  // 2. Mask out manifest / total expected references: "manifest is 30", "paperwork says 48"
  const manifestRegex =
    /\b(?:manifest|paperwork|bill\s+of\s+lading|expected)\s+(?:is|was|says|has)?\s*([a-z0-9-]+(?:\s+[a-z0-9-]+)?)\b/gi;
  while ((idMatch = manifestRegex.exec(text)) !== null) {
    const val = idMatch[1].toLowerCase().trim();
    if (["the", "a", "an", "our", "all"].includes(val)) continue;
    excludedRanges.push({ start: idMatch.index, end: idMatch.index + idMatch[0].length });
  }

  // 3. Mask out spoken delta references: "short one carton", "missing two boxes", "shortage of 2", "short one", "shortage is one"
  const deltaRegex =
    /\b(?:short|missing|shortage(?:\s+of|\s+is)?)\s+([a-z0-9-]+(?:\s+[a-z0-9-]+)?)(?=[,.;]|\s+(?:cartons?|boxes?|units?)|$)/gi;
  while ((idMatch = deltaRegex.exec(text)) !== null) {
    excludedRanges.push({ start: idMatch.index, end: idMatch.index + idMatch[0].length });
  }

  const isExcluded = (start: number, end: number) =>
    excludedRanges.some((r) => Math.max(start, r.start) < Math.min(end, r.end));

  const NUMBER_WORDS = "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and|a|half|dozen";
  const STRICT_NUM = `(?:(?:\\d+|(?:${NUMBER_WORDS})(?:-[a-z]+)?)(?:\\s+(?:\\d+|(?:${NUMBER_WORDS})(?:-[a-z]+)?))*)`;

  // Pattern 0: Count verb + number + "of / out of" + expected total
  // e.g. "I received forty-seven of forty-eight.", "Received 47 out of 48"
  const patternFraction = new RegExp(
    `(?<verb>\\b(?:${COUNT_VERBS_REGEX})\\b[:\\s]+)(?<num>${STRICT_NUM})\\s+(?:of|out\\s+of)\\s+(?<denom>${STRICT_NUM})`,
    "gi"
  );
  let match: RegExpExecArray | null;
  while ((match = patternFraction.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    if (isExcluded(matchStart, matchEnd)) continue;

    const numStr = match.groups?.num ?? "";
    const parsed = parseSpokenNumber(numStr);
    if (parsed !== null && parsed > 0) {
      return {
        observedQty: parsed,
        unit: "cartons",
        sourceQuote: text.slice(matchStart, matchEnd).trim(),
        startIndex: matchStart,
        endIndex: matchEnd,
        sourceTurnId: options.sourceTurnId,
        speakerRole: options.speakerRole,
        confidence: computeConfidence(match[0], 0.95, options),
        extractor: /^\d+$/.test(numStr.trim()) ? "regex_digit" : "regex_spoken_number",
      };
    }
  }

  // Pattern 1: Count verb + number phrase + packaging unit
  // e.g., "I counted forty-seven cartons", "Count complete: fifty cartons received"
  const pattern1 = new RegExp(
    `(?<verb>\\b(?:${COUNT_VERBS_REGEX})\\b[:\\s]+)(?<num>${STRICT_NUM})\\s+(?<unit>${PACKAGING_UNITS_REGEX})\\b`,
    "gi"
  );

  while ((match = pattern1.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    if (isExcluded(matchStart, matchEnd)) continue;

    const numStr = match.groups?.num ?? "";
    const unitStr = match.groups?.unit ?? "cartons";
    const parsed = parseSpokenNumber(numStr);

    if (parsed !== null) {
      return {
        observedQty: parsed,
        unit: unitStr.toLowerCase(),
        sourceQuote: text.slice(matchStart, matchEnd),
        startIndex: matchStart,
        endIndex: matchEnd,
        sourceTurnId: options.sourceTurnId,
        speakerRole: options.speakerRole,
        confidence: computeConfidence(match[0], 0.95, options),
        extractor: numStr.includes("dozen")
          ? "dozen_multiplier"
          : /^\d+$/.test(numStr.trim())
          ? "regex_digit"
          : "regex_spoken_number",
      };
    }
  }

  // Pattern 2: Direct Number phrase + packaging unit (without explicit verb)
  // e.g. "forty-seven cartons", "32 boxes", "two dozen pallets"
  const pattern2 = new RegExp(
    `\\b(?<num>${STRICT_NUM})\\s+(?<unit>${PACKAGING_UNITS_REGEX})\\b`,
    "gi"
  );

  while ((match = pattern2.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    if (isExcluded(matchStart, matchEnd)) continue;

    const numStr = match.groups?.num ?? "";
    const unitStr = match.groups?.unit ?? "cartons";
    const parsed = parseSpokenNumber(numStr);

    if (parsed !== null) {
      return {
        observedQty: parsed,
        unit: unitStr.toLowerCase(),
        sourceQuote: text.slice(matchStart, matchEnd),
        startIndex: matchStart,
        endIndex: matchEnd,
        sourceTurnId: options.sourceTurnId,
        speakerRole: options.speakerRole,
        confidence: computeConfidence(match[0], 0.90, options),
        extractor: numStr.includes("dozen")
          ? "dozen_multiplier"
          : /^\d+$/.test(numStr.trim())
          ? "regex_digit"
          : "regex_spoken_number",
      };
    }
  }

  // Pattern 3: Count verb + number phrase (unit omitted or implicit)
  // e.g., "My count is forty-seven.", "I have 47, we're short one.", "I counted forty-seven."
  const pattern3 = new RegExp(
    `(?<verb>\\b(?:${COUNT_VERBS_REGEX})\\b[:\\s]+)(?<num>${STRICT_NUM})(?=[,.;:\\s]|$)`,
    "gi"
  );

  while ((match = pattern3.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    if (isExcluded(matchStart, matchEnd)) continue;

    const numStr = match.groups?.num ?? "";
    const parsed = parseSpokenNumber(numStr);

    if (parsed !== null && parsed > 0) {
      return {
        observedQty: parsed,
        unit: "cartons",
        sourceQuote: text.slice(matchStart, matchEnd).trim(),
        startIndex: matchStart,
        endIndex: matchEnd,
        sourceTurnId: options.sourceTurnId,
        speakerRole: options.speakerRole,
        confidence: computeConfidence(match[0], 0.90, options),
        extractor: /^\d+$/.test(numStr.trim()) ? "regex_digit" : "regex_spoken_number",
      };
    }
  }

  return null;
}

/**
 * Extracts candidate damage reports from transcript text.
 */
export function extractCandidateDamage(
  text: string,
  options: ExtractionOptions = {}
): CandidateDamage | null {
  if (!text || typeof text !== "string") return null;

  const damageKeywords = "crushed|punctured|torn|wet|damaged|broken|dented|leaking|smashed";

  // First attempt: match carton reference followed by damage condition in the same clause
  const cartonNearRegex = new RegExp(
    `\\b(?<carton>(?:carton|box|unit|item|case)\\s+(?:#|number\\s+)?[a-z0-9-]+(?:\\s+[a-z0-9-]+)?)\\b(?:[^.;]*?)\\b(?<condition>${damageKeywords})\\b`,
    "i"
  );
  let match = cartonNearRegex.exec(text);

  // Second attempt: match standalone damage condition keyword
  if (!match) {
    const fallbackRegex = new RegExp(`\\b(?<condition>${damageKeywords})\\b`, "i");
    match = fallbackRegex.exec(text);
  }

  if (!match) return null;

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;
  const cartonReference = match.groups?.carton?.trim() || null;
  const condition = match.groups?.condition?.toLowerCase() || "damaged";

  return {
    cartonReference,
    condition,
    sourceQuote: text.slice(startIndex, endIndex),
    startIndex,
    endIndex,
    confidence: 0.9,
    sourceTurnId: options.sourceTurnId,
    speakerRole: options.speakerRole,
  };
}

function computeConfidence(
  quote: string,
  baseScore: number,
  options: ExtractionOptions
): number {
  let score = baseScore;
  if (/maybe|guess|approx|around|think/i.test(quote)) score -= 0.15;
  if (options.words && options.words.length > 0) {
    const confs = options.words
      .map((w) => w.confidence)
      .filter((c): c is number => typeof c === "number");
    if (confs.length > 0) {
      const avg = confs.reduce((a, b) => a + b, 0) / confs.length;
      score = score * 0.8 + avg * 0.2;
    }
  }
  return Math.min(1.0, Math.max(0.1, Number(score.toFixed(2))));
}
