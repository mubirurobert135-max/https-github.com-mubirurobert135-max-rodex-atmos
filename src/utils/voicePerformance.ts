/**
 * RODEX Atmos Voice Performance & Latency Instrumentation
 * Comprehensive End-to-End Latency Tracking across all 8 pipeline milestones:
 * - T0: Speech recognition commits final transcript
 * - T1: Client dispatches assistant request
 * - T2: Server-side processing duration
 * - T3: Client receives assistant text response
 * - T4: Text appears in conversation interface
 * - T5: Voice synthesis begins
 * - T6: Approved voice audio payload available
 * - T7: Audio playback actually begins
 */

export interface VoiceTurnMetrics {
  turnId: string;
  // Stage timestamps (ms)
  t0SpeechFinalized: number;
  t1RequestDispatched: number;
  t2ServerDurationMs: number;
  t3TextReceived: number;
  t4TextRendered: number;
  t5SynthesisRequested: number;
  t6AudioAvailable: number;
  t7AudioPlaybackStarted: number;

  // Calculated intervals (ms)
  recognitionToDispatchMs: number; // T1 - T0
  clientToServerMs: number;        // T3 - T1
  serverProcessingMs: number;      // T2
  timeToVisibleTextMs: number;     // T4 - T0
  synthesisDurationMs: number;     // T6 - T5
  audioDeliveryToPlayMs: number;   // T7 - T6
  totalEndToEndMs: number;         // T7 - T0 (or T7 - T1 if T0 not present)

  // Backward-compatible properties
  speechFinalizedAt: number;
  requestDispatchedAt: number;
  textReceivedAt: number;
  audioPlaybackStartedAt: number;
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
  private t0: number = 0;
  private t1: number = 0;
  private t2ServerMs: number = 0;
  private t3: number = 0;
  private t4: number = 0;
  private t5: number = 0;
  private t6: number = 0;
  private t7: number = 0;
  private serverTimings?: VoiceTurnMetrics['serverTimings'];

  constructor(turnId?: string) {
    this.turnId = turnId || `turn-${Date.now()}`;
  }

  // T0: Final transcript finalized
  markSpeechFinalized(timeMs: number = Date.now()): void {
    this.t0 = timeMs;
  }

  // T1: Client sends request
  markRequestDispatched(timeMs: number = Date.now()): void {
    this.t1 = timeMs;
  }

  // T3: Client receives text
  markTextReceived(timeMs: number = Date.now(), serverTimings?: VoiceTurnMetrics['serverTimings']): void {
    this.t3 = timeMs;
    if (serverTimings) {
      this.serverTimings = serverTimings;
      this.t2ServerMs = serverTimings.totalMs || 0;
    }
  }

  // T4: Text rendered to UI
  markTextRendered(timeMs: number = Date.now()): void {
    this.t4 = timeMs;
  }

  // T5: Voice synthesis initiated
  markSynthesisRequested(timeMs: number = Date.now()): void {
    this.t5 = timeMs;
  }

  // T6: Audio ready/decoded
  markAudioAvailable(timeMs: number = Date.now()): void {
    this.t6 = timeMs;
  }

  // T7: Spoken audio playing
  markAudioPlaybackStarted(timeMs: number = Date.now()): void {
    this.t7 = timeMs;
  }

  getMetrics(): VoiceTurnMetrics {
    const t0 = this.t0 || this.t1;
    const t1 = this.t1 || this.t0;
    const t3 = this.t3 || t1;
    const t4 = this.t4 || t3;
    const t5 = this.t5 || t3;
    const t6 = this.t6 || t5;
    const t7 = this.t7 || t6;

    const recognitionToDispatchMs = Math.max(0, t1 - t0);
    const clientToServerMs = Math.max(0, t3 - t1);
    const serverProcessingMs = this.t2ServerMs || 0;
    const timeToVisibleTextMs = Math.max(0, t4 - t0);
    const synthesisDurationMs = Math.max(0, t6 - t5);
    const audioDeliveryToPlayMs = Math.max(0, t7 - t6);
    const totalEndToEndMs = Math.max(0, t7 - t0);

    const dispatchToTextMs = clientToServerMs;
    const textToAudioMs = Math.max(0, t7 - t3);
    const totalToAudioMs = totalEndToEndMs;

    return {
      turnId: this.turnId,
      t0SpeechFinalized: t0,
      t1RequestDispatched: t1,
      t2ServerDurationMs: serverProcessingMs,
      t3TextReceived: t3,
      t4TextRendered: t4,
      t5SynthesisRequested: t5,
      t6AudioAvailable: t6,
      t7AudioPlaybackStarted: t7,

      recognitionToDispatchMs,
      clientToServerMs,
      serverProcessingMs,
      timeToVisibleTextMs,
      synthesisDurationMs,
      audioDeliveryToPlayMs,
      totalEndToEndMs,

      speechFinalizedAt: t0,
      requestDispatchedAt: t1,
      textReceivedAt: t3,
      audioPlaybackStartedAt: t7,
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
    `Speech->Text: ${metrics.clientToServerMs}ms`,
    `Text Visible: ${metrics.timeToVisibleTextMs}ms`,
    `Audio Delivery: ${metrics.audioDeliveryToPlayMs}ms`,
    `Total to Ear: ${metrics.totalEndToEndMs}ms`
  ];

  if (metrics.serverTimings) {
    const st = metrics.serverTimings;
    const sParts = [];
    if (st.weatherMs != null) sParts.push(`Weather: ${st.weatherMs}ms`);
    if (st.aiMs != null) sParts.push(`AI: ${st.aiMs}ms`);
    if (st.ttsMs != null) sParts.push(`TTS: ${st.ttsMs}ms`);
    if (st.totalMs != null) sParts.push(`Total Server: ${st.totalMs}ms`);
    if (sParts.length > 0) parts.push(`(Server: ${sParts.join(', ')})`);
  }

  return parts.join(' | ');
}
