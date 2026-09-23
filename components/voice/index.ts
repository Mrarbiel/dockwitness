export * from "./voice-capture-panel";
export * from "./live-transcript";
export * from "./audio-visualizer";
export * from "./audio-simulator";
export * from "./use-assemblyai-realtime";
export * from "./voice-agent-cockpit";

export interface VoiceComponentProps {
  onTranscript?: (text: string, isFinal: boolean) => void;
}

export const VOICE_VERSION = "0.2.0";
