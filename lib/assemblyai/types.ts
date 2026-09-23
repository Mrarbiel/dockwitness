export type ClientConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "terminating"
  | "error";

export interface AssemblyAITokenResponse {
  token: string;
  expires_at?: number;
}

export interface WordTiming {
  text: string;
  start: number;
  end: number;
  confidence: number;
  word_is_final?: boolean;
  speaker?: string;
}

export interface TranscriptTurn {
  id: string;
  speakerRole: "RECEIVER" | "DRIVER" | "SYSTEM";
  speakerLabel?: string;
  text: string;
  timestamp: string;
  endOfTurn: boolean;
  words?: WordTiming[];
  confidence?: number;
}

export interface UniversalStreamingTurn {
  type: "Turn";
  text: string;
  end_of_turn: boolean;
  words: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

export interface RealtimeClientOptions {
  keytermsPrompt?: string[];
  /** @deprecated Use keytermsPrompt */
  wordBoost?: string[];
  tokenUrl?: string; // Default: "/api/aai/token"
  token?: string;
  speechModel?: string; // Default: "universal-3-5-pro"
  sampleRate?: number; // Default: 16000
  voiceFocus?: "near-field" | "far-field" | null;
  speakerLabels?: boolean;
  inactivityTimeoutMs?: number; // Default: 120000 (120s)
  onStateChange?: (state: ClientConnectionState) => void;
  onPartialTranscript?: (transcript: string, words?: WordTiming[], latencyMs?: number) => void;
  onFinalTranscript?: (transcript: string, words?: WordTiming[], latencyMs?: number) => void;
  onError?: (error: Error | string) => void;
  onSessionBegin?: (sessionId: string) => void;
  onSessionTerminated?: (stats: { audioDurationSeconds?: number; sessionDurationSeconds?: number }) => void;
}

export const AAI_STREAMING_WS_URL = "wss://streaming.assemblyai.com/v3/ws";
