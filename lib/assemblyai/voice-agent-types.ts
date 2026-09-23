/**
 * AssemblyAI Voice Agent API Types
 * Spec: wss://agents.assemblyai.com/v1/ws
 */

export type VoiceAgentState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "IDLE"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "TOOL_EXECUTING"
  | "ERROR";

export interface VoiceAgentFunctionParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  enum?: string[];
  items?: Record<string, unknown>;
  properties?: Record<string, VoiceAgentFunctionParameter>;
  required?: string[];
}

export interface VoiceAgentFunctionSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, VoiceAgentFunctionParameter>;
    required?: string[];
  };
}

export interface VoiceAgentToolDefinition {
  type: "function";
  name?: string;
  description?: string;
  parameters?: {
    type: "object";
    properties: Record<string, VoiceAgentFunctionParameter>;
    required?: string[];
  };
  function: VoiceAgentFunctionSchema;
}

export interface VoiceAgentToolCall {
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface VoiceAgentToolResult {
  call_id: string;
  result: string;
  is_error?: boolean;
}

export interface VoiceAgentTurn {
  id: string;
  role: "user" | "agent" | "system" | "tool";
  text: string;
  timestamp: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  isSimulated?: boolean;
}

export interface VoiceAgentSessionResume {
  type: "session.resume";
  session_id: string;
}

export interface VoiceAgentSessionUpdate {
  type: "session.update";
  session: {
    system_prompt?: string;
    greeting?: string;
    tools?: Array<
      | VoiceAgentToolDefinition
      | {
          type: "function";
          name: string;
          description: string;
          parameters: {
            type: "object";
            properties: Record<string, VoiceAgentFunctionParameter>;
            required?: string[];
          };
        }
    >;
    input?: {
      format?: { encoding: string; sample_rate?: number };
      turn_detection?: Record<string, unknown>;
    };
    output?: {
      voice?: string;
      format?: { encoding: string; sample_rate?: number };
      volume?: number;
    };
    voice?: {
      provider?: string;
      model?: string;
      name?: string;
    };
    audio_format?: {
      sample_rate: number;
      channels: number;
      encoding: "pcm16";
    };
  };
}

export interface VoiceAgentIncomingMessage {
  type:
    | "session.created"
    | "session.updated"
    | "session.ready"
    | "session.resumed"
    | "session.error"
    | "session.ended"
    | "transcript.user"
    | "transcript.user.delta"
    | "transcript.agent"
    | "audio.chunk"
    | "reply.audio"
    | "reply.started"
    | "reply.done"
    | "input.speech.started"
    | "input.speech.stopped"
    | "tool.call"
    | "error"
    | "interruption";
  text?: string;
  delta?: string;
  is_final?: boolean;
  audio?: string; // base64 pcm16
  data?: string; // base64 pcm16 (AssemblyAI Voice Agent payload)
  session_id?: string;
  session?: Record<string, unknown>;
  call_id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  message?: string;
  code?: number | string;
  status?: "completed" | "interrupted" | string;
  reply_id?: string;
  config?: Record<string, unknown>;
}

