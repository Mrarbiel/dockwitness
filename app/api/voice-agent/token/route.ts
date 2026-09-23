import { NextResponse } from "next/server";
import dns from "dns";
import {
  validateSameOrigin,
  createOriginForbiddenResponse,
  isRateLimited,
  createRateLimitResponse,
} from "@/lib/auth/origin-validation";

dns.setDefaultResultOrder("ipv4first");

export interface VoiceAgentTokenResponseBody {
  token: string;
  expires_at?: number;
}

export interface VoiceAgentTokenErrorBody {
  error: string;
}

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
};

export async function POST(request: Request): Promise<NextResponse<VoiceAgentTokenResponseBody | VoiceAgentTokenErrorBody>> {
  // 1. Validate Origin / Referer (Same-Origin Protection)
  const originCheck = validateSameOrigin(request);
  if (!originCheck.isValid) {
    return createOriginForbiddenResponse<VoiceAgentTokenErrorBody>(originCheck.error);
  }

  // 2. Sliding Window Rate Limiting
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  if (isRateLimited(clientIp)) {
    return createRateLimitResponse<VoiceAgentTokenErrorBody>();
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    return NextResponse.json(
      { error: "Voice Agent provider credentials not configured on server" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  const expiresInSeconds = 60;
  const upstreamUrl = new URL("https://agents.assemblyai.com/v1/token");
  upstreamUrl.searchParams.set("expires_in_seconds", String(expiresInSeconds));

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!upstreamResponse.ok) {
      console.error(`[VoiceAgentTokenMint] Upstream provider error HTTP ${upstreamResponse.status}`);
      return NextResponse.json(
        { error: `Upstream Voice Agent provider rejected token minting (${upstreamResponse.status})` },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    const data = (await upstreamResponse.json()) as { token: string; expires_in_seconds?: number };

    if (!data.token) {
      return NextResponse.json(
        { error: "Upstream Voice Agent provider response missing token" },
        { status: 502, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        token: data.token,
        expires_at: Date.now() + (data.expires_in_seconds || 60) * 1000,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error";
    console.error(`[VoiceAgentTokenMint] Connection error:`, message);
    return NextResponse.json(
      { error: "Failed to connect to Voice Agent token service" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
