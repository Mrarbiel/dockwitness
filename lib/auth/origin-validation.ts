import { NextResponse } from "next/server";

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // Max 30 token requests per minute per IP

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

/**
 * Clean up stale rate limit entries periodically
 */
function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}

/**
 * Checks in-memory sliding window rate limit for anonymous demo caller
 */
export function isRateLimited(clientIp: string): boolean {
  cleanupRateLimits();
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  entry.count++;
  return false;
}

/**
 * Validates that requests originate from the genuine DockWitness web app
 * (Same-origin / Same-site demo boundary protection)
 */
export function validateSameOrigin(request: Request): { isValid: boolean; error?: string } {
  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");

  // Determine incoming origin host (in lowercase)
  let incomingHost: string | null = null;
  if (originHeader) {
    try {
      incomingHost = new URL(originHeader).host.toLowerCase();
    } catch {
      return { isValid: false, error: "Invalid Origin header format" };
    }
  } else if (refererHeader) {
    try {
      incomingHost = new URL(refererHeader).host.toLowerCase();
    } catch {
      return { isValid: false, error: "Invalid Referer header format" };
    }
  }

  // Determine expected application host (from request.url)
  let expectedHost = "";
  try {
    expectedHost = new URL(request.url).host.toLowerCase();
  } catch {
    expectedHost = "localhost:3000";
  }

  // Determine configured application host (from NEXT_PUBLIC_APP_URL)
  let configuredHost = "";
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      configuredHost = new URL(process.env.NEXT_PUBLIC_APP_URL).host.toLowerCase();
    } catch {
      configuredHost = "";
    }
  }

  // Only actual test environment (NODE_ENV=test) allows bypass when NO origin/referer is specified
  // (e.g. direct programmatic handler calls in unit tests without HTTP client simulation)
  if (process.env.NODE_ENV === "test" && !incomingHost && !request.headers.get("x-test-enforce-origin")) {
    return { isValid: true };
  }

  // If an Origin or Referer is present, it MUST match the authorized application domain
  if (incomingHost) {
    const matchesExpected = incomingHost === expectedHost;
    const matchesConfigured = configuredHost ? incomingHost === configuredHost : false;

    // Exact localhost / 127.0.0.1 check for local development / test servers
    // Requires exact match on hostname and matching port, preventing localhost.attacker.example
    const [incomingHostname, incomingPort] = incomingHost.split(":");
    const [expectedHostname, expectedPort] = expectedHost.split(":");
    const isDevOrTest = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
    const isExactLocalhost =
      isDevOrTest &&
      (incomingHostname === "localhost" || incomingHostname === "127.0.0.1") &&
      (expectedHostname === "localhost" || expectedHostname === "127.0.0.1") &&
      (incomingPort === expectedPort || !incomingPort || !expectedPort);

    if (matchesExpected || matchesConfigured || isExactLocalhost) {
      return { isValid: true };
    }

    return { isValid: false, error: `Forbidden: Request origin '${incomingHost}' does not match authorized application domain.` };
  }

  // If no Origin or Referer is present on mutating methods (POST, PUT, PATCH, DELETE), reject
  const isMutatingMethod = ["POST", "PUT", "PATCH", "DELETE"].includes((request.method || "").toUpperCase());
  if (isMutatingMethod) {
    return { isValid: false, error: "Forbidden: Missing Origin or Referer header for mutating request." };
  }

  // If no Origin or Referer is present on read requests, block if marked cross-site by browser
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    return { isValid: false, error: "Forbidden: Cross-site request rejected by Sec-Fetch-Site policy." };
  }

  return { isValid: true };
}

/**
 * Standard forbidden response for origin violation
 */
export function createOriginForbiddenResponse<T = { error: string }>(error = "Forbidden: Invalid cross-origin request"): NextResponse<T> {
  return NextResponse.json(
    { error } as unknown as T,
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

/**
 * Standard rate limit response
 */
export function createRateLimitResponse<T = { error: string }>(): NextResponse<T> {
  return NextResponse.json(
    { error: "Too many token minting requests. Please wait a moment before reconnecting." } as unknown as T,
    {
      status: 429,
      headers: {
        "Retry-After": "60",
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
