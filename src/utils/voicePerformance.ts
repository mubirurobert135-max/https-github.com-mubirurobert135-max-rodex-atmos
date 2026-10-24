/**
 * RODEX Atmos Voice Performance & Latency Instrumentation
 * Measures each stage of the voice conversation turn:
 * 1. Speech recognition finalization
 * 2. Request transmission & server processing
 * 3. Text response arrival
 * 4. Audio synthesis / transfer & playback start
 */

export interface VoiceTurnMetrics {
  turnId: string;
  speechFinalizedAt: number;
  requestDispatchedAt: number;
  textReceivedAt: number;
  audioPlaybackStartedAt: number;
  recognitionToDispatchMs: number;
  dispatchToTextMs: number;
  textToAudioMs: number;
  totalToAudioMs: number;
  serverTimings?: {
    aiMs?: number;
    ttsMs?: number;
    weatherMs?: number;
    totalMs?: number;
  };
}

export class VoiceTurnTimer {
  private turnId: string;
  private tFinalized: number = 0;
  private tDispatched: number = 0;
  private tTextReceived: number = 0;
  private tAudioStarted: number = 0;
  private serverTimings?: VoiceTurnMetrics['serverTimings'];

  constructor(turnId?: string) {
    this.turnId = turnId || `turn-${Date.now()}`;
  }

  markSpeechFinalized(timeMs: number = Date.now()): void {
    this.tFinalized = timeMs;
  }

  markRequestDispatched(timeMs: number = Date.now()): void {
    this.tDispatched = timeMs;
  }

  markTextReceived(timeMs: number = Date.now(), serverTimings?: VoiceTurnMetrics['serverTimings']): void {
    this.tTextReceived = timeMs;
    if (serverTimings) {
      this.serverTimings = serverTimings;
    }
  }

  markAudioPlaybackStarted(timeMs: number = Date.now()): void {
    this.tAudioStarted = timeMs;
  }

  getMetrics(): VoiceTurnMetrics {
    const recognitionToDispatchMs = Math.max(0, this.tDispatched - this.tFinalized);
    const dispatchToTextMs = Math.max(0, this.tTextReceived - this.tDispatched);
    const textToAudioMs = Math.max(0, this.tAudioStarted - this.tTextReceived);
    const totalToAudioMs = Math.max(0, this.tAudioStarted - this.tFinalized);

    return {
      turnId: this.turnId,
      speechFinalizedAt: this.tFinalized,
      requestDispatchedAt: this.tDispatched,
      textReceivedAt: this.tTextReceived,
      audioPlaybackStartedAt: this.tAudioStarted,
      recognitionToDispatchMs,
      dispatchToTextMs,
      textToAudioMs,
      totalToAudioMs,
      serverTimings: this.serverTimings
    };
  }
}

export function formatDiagnosticTiming(metrics: VoiceTurnMetrics): string {
  const parts = [
    `[RODEX Voice Timing - ${metrics.turnId}]`,
    `STT Finalize: ${metrics.recognitionToDispatchMs}ms`,
    `Speech->Text: ${metrics.dispatchToTextMs}ms`,
    `Text->Audio: ${metrics.textToAudioMs}ms`,
    `Total to Ear: ${metrics.totalToAudioMs}ms`
  ];

  if (metrics.serverTimings) {
    const st = metrics.serverTimings;
    const sParts = [];
    if (st.weatherMs != null) sParts.push(`Weather: ${st.weatherMs}ms`);
    if (st.aiMs != null) sParts.push(`AI: ${st.aiMs}ms`);
    if (st.ttsMs != null) sParts.push(`TTS: ${st.ttsMs}ms`);
    if (sParts.length > 0) parts.push(`(Server breakdown: ${sParts.join(', ')})`);
  }

  return parts.join(' | ');
}
