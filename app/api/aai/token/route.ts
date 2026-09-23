import { NextResponse } from "next/server";
import dns from "dns";
import {
  validateSameOrigin,
  createOriginForbiddenResponse,
  isRateLimited,
  createRateLimitResponse,
} from "@/lib/auth/origin-validation";

dns.setDefaultResultOrder("ipv4first");

export interface TokenResponseBody {
  token: string;
  expires_at: number;
}

export interface TokenErrorBody {
  error: string;
}

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
};

export async function POST(request: Request): Promise<NextResponse<TokenResponseBody | TokenErrorBody>> {
  // 1. Validate Origin / Referer (Same-Origin Protection)
  const originCheck = validateSameOrigin(request);
  if (!originCheck.isValid) {
    return createOriginForbiddenResponse<TokenErrorBody>(originCheck.error);
  }

  // 2. Sliding Window Rate Limiting
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  if (isRateLimited(clientIp)) {
    return createRateLimitResponse<TokenErrorBody>();
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    return NextResponse.json(
      { error: "Voice streaming provider credentials not configured on server" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  const expiresInSeconds = 60;
  const maxSessionDurationSeconds = 600;

  const upstreamUrl = new URL("https://streaming.assemblyai.com/v3/token");
  upstreamUrl.searchParams.set("expires_in_seconds", String(expiresInSeconds));
  upstreamUrl.searchParams.set("max_session_duration_seconds", String(maxSessionDurationSeconds));

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: apiKey.trim(),
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!upstreamResponse.ok) {
      console.error(`[TokenMint] Upstream provider error HTTP ${upstreamResponse.status}`);
      return NextResponse.json(
        { error: `Upstream speech provider rejected token minting (${upstreamResponse.status})` },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    const data = (await upstreamResponse.json()) as { token: string; expires_in_seconds: number };

    if (!data.token) {
      return NextResponse.json(
        { error: "Upstream speech provider response missing token" },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        token: data.token,
        expires_at: Date.now() + (data.expires_in_seconds || expiresInSeconds) * 1000,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error";
    console.error(`[TokenMint] Connection error:`, message);
    return NextResponse.json(
      { error: "Failed to connect to speech streaming service" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
