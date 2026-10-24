import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Mic, MicOff, Send, Sparkles, X, MessageSquare, Volume2, 
  Radio, AlertCircle, Compass, CheckCircle2, ChevronRight, Loader2, ArrowUpRight
} from 'lucide-react';
import { WeatherData } from '../types';
import { floatTo16BitPCM, arrayBufferToBase64, base64ToFloat32Array, resampleAudioBuffer } from '../utils/audioUtils';
import { getWeatherCondition } from '../utils/weatherUtils';
import { useAuth } from '../context/AuthContext';
import { 
  sanitizeUserName, 
  getTimeOfDayGreeting, 
  buildPersonalizedGreeting, 
  isFastConversationalQuery 
} from '../utils/greetingUtils';
import { VoiceTurnTimer, formatDiagnosticTiming } from '../utils/voicePerformance';

import { LocationMode } from '../types';

interface AssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  weatherData: WeatherData | null;
  deviceLocationData?: WeatherData | null;
  mapContextData?: WeatherData | null;
  activeMapLayer?: 'temperature' | 'precipitation' | 'wind';
  locationMode?: LocationMode;
  onSelectCityWeather: (data: WeatherData) => void;
  initialPrompt?: string;
  onExecuteAction?: (action: 'SWITCH_TAB' | 'SET_MAP_LAYER' | 'RESET_GPS' | 'SEARCH_CITY', payload?: any) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  cityUpdate?: WeatherData;
}

type VoiceState = 
  | 'idle' 
  | 'requesting_permission' 
  | 'connecting' 
  | 'listening' 
  | 'thinking' 
  | 'speaking' 
  | 'ended' 
  | 'error';

export type LiveConnectionStage =
  | 'idle'
  | 'requesting_permission'
  | 'mic_stream_acquired'
  | 'ephemeral_token_received'
  | 'websocket_created'
  | 'websocket_opened'
  | 'setup_message_sent'
  | 'setup_complete_received'
  | 'server_response_received'
  | 'audio_message_sent'
  | 'model_response_received'
  | 'assistant_audio_played';

const STAGE_LABELS: Record<LiveConnectionStage, string> = {
  idle: 'Session Not Started',
  requesting_permission: '1/10 Requesting Microphone Access',
  mic_stream_acquired: '2/10 Microphone Stream Acquired',
  ephemeral_token_received: '3/10 Ephemeral Security Token Received',
  websocket_created: '4/10 Live WebSocket Instantiated',
  websocket_opened: '5/10 WebSocket Handshake Completed',
  setup_message_sent: '6/10 Gemini Session Setup Sent',
  setup_complete_received: '7/10 Gemini Setup Confirmed (setupComplete)',
  server_response_received: '8/10 Gemini Message Received',
  audio_message_sent: '9/10 Microphone PCM Transmitted',
  model_response_received: '9/10 AI Response Generated',
  assistant_audio_played: '10/10 AI Spoken Audio Playing'
};

function getCloseCodeReason(code: number): string {
  switch (code) {
    case 1000: return 'Normal Session Closure';
    case 1001: return 'Client/Server Navigating Away';
    case 1002: return 'WebSocket Protocol Error';
    case 1003: return 'Unsupported Payload Data';
    case 1005: return 'No Close Status Received';
    case 1006: return 'Abnormal Closure (TCP/TLS Drop or Blocked Handshake)';
    case 1007: return 'Invalid Payload Data';
    case 1008: return 'Policy Violation / Session Auth Rejected';
    case 1009: return 'Message Frame Exceeds Capacity';
    case 1011: return 'Gemini Remote Server Exception';
    case 4000: return 'Ephemeral Token Consumed or Expired';
    case 4001: return 'Invalid Session Configuration';
    case 4003: return 'Model Access Unauthorized';
    default: return `Close Code ${code}`;
  }
}

export const AssistantModal: React.FC<AssistantModalProps> = ({
  isOpen,
  onClose,
  weatherData,
  deviceLocationData,
  mapContextData,
  activeMapLayer = 'temperature',
  locationMode = 'gps',
  onSelectCityWeather,
  initialPrompt,
  onExecuteAction
}) => {
  const { user, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'voice' | 'chat'>('voice');

  // Personalized name from current authenticated profile
  const authenticatedFirstName = sanitizeUserName(userProfile?.displayName || user?.displayName);

  // Text Chat State with personalized initial greeting
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const greeting = authenticatedFirstName ? `Hello ${authenticatedFirstName}!` : 'Hello!';
    return [
      {
        id: 'welcome',
        role: 'assistant',
        content: `${greeting} I am RODEX AI. I can answer questions about current conditions in ${weatherData?.location.name || 'your location'}, explain active weather warnings, or summarize today's briefing. How can I help you today?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
  });
  const [inputQuery, setInputQuery] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto-switch to chat and set initial query when prompt is provided
  useEffect(() => {
    if (isOpen && initialPrompt) {
      setActiveTab('chat');
      setInputQuery(initialPrompt);
    }
  }, [isOpen, initialPrompt]);

  // Live Voice State
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [lastStage, setLastStage] = useState<LiveConnectionStage>('idle');
  const lastStageRef = useRef<LiveConnectionStage>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [liveTranscripts, setLiveTranscripts] = useState<Array<{ sender: 'user' | 'assistant'; text: string; id: string }>>([]);
  const [currentAssistantSpoken, setCurrentAssistantSpoken] = useState('');
  const [interimUserSpeech, setInterimUserSpeech] = useState('');
  const [isAutoRecovering, setIsAutoRecovering] = useState(false);

  // Greet once per active voice session
  const hasGreetedInSessionRef = useRef(false);

  // Session diagnostics metrics tracking
  const sessionDiagnosticsRef = useRef({
    sessionStartTime: 0,
    timeToReadyMs: 0,
    micFramesCaptured: 0,
    audioChunksSent: 0,
    audioChunksReceived: 0,
    inputTranscriptionsReceived: 0,
    outputTranscriptionsReceived: 0,
    interruptionsCount: 0,
    playbackUnderruns: 0
  });

  // Reference for active audio elements (audition or custom synthesized speech)
  const activeAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const [isAuditioning, setIsAuditioning] = useState(false);

  // Stop any active audio element (audition or custom synthesized speech)
  const stopActiveAudioElement = useCallback(() => {
    if (activeAudioElementRef.current) {
      activeAudioElementRef.current.pause();
      activeAudioElementRef.current.currentTime = 0;
      activeAudioElementRef.current = null;
    }
    setIsAuditioning(false);
  }, []);

  // Speak personalized time-aware greeting using RODEX Atmos Signature custom voice (voice_nv4v693k2132)
  const speakGreeting = useCallback(async (text: string, onDone?: () => void) => {
    setCurrentAssistantSpoken(text);
    setLiveTranscripts((prev) => [
      ...prev,
      { sender: 'assistant', text, id: 'greeting-' + Date.now() }
    ]);
    setVoiceState('speaking');

    // Attempt high-fidelity RODEX Atmos Signature voice synthesis first
    let playedWithSignatureVoice = false;
    try {
      const res = await fetch('/api/ai/synthesize-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          style: 'Warm, confident, personable, lightly playful, clear and concise'
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audio) {
          const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audio}`);
          activeAudioElementRef.current = audio;
          audio.onended = () => {
            activeAudioElementRef.current = null;
            setCurrentAssistantSpoken('');
            setVoiceState('listening');
            if (onDone) onDone();
          };
          audio.onerror = () => {
            activeAudioElementRef.current = null;
            setCurrentAssistantSpoken('');
            setVoiceState('listening');
            if (onDone) onDone();
          };
          await audio.play();
          playedWithSignatureVoice = true;
        }
      }
    } catch (synthErr) {
      console.warn('[RODEX Signature Voice Notice] Custom TTS fallback to Web Speech:', synthErr);
    }

    if (playedWithSignatureVoice) return;

    // Fallback to browser warm feminine speech synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.05;

      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find((v) =>
        v.lang.startsWith('en') &&
        (/female|samantha|victoria|karen|moira|fiona|tessa|serena|stephanie|zira|google.*female|google us english|natural/i.test(v.name))
      ) || voices.find((v) => v.lang.startsWith('en')) || voices[0];

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onend = () => {
        setCurrentAssistantSpoken('');
        setVoiceState('listening');
        if (onDone) onDone();
      };

      utterance.onerror = () => {
        setCurrentAssistantSpoken('');
        setVoiceState('listening');
        if (onDone) onDone();
      };

      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => {
        setCurrentAssistantSpoken('');
        setVoiceState('listening');
        if (onDone) onDone();
      }, 1500);
    }
  }, [stopActiveAudioElement]);

  // Audition the official RODEX Atmos Signature voice sample
  const handleAuditionSignatureVoice = useCallback(async () => {
    if (isAuditioning) {
      stopActiveAudioElement();
      return;
    }

    try {
      stopActiveAudioElement();
      setIsAuditioning(true);
      const audio = new Audio('/atmos-signature-audition.wav');
      activeAudioElementRef.current = audio;

      audio.onended = () => {
        setIsAuditioning(false);
        activeAudioElementRef.current = null;
      };

      audio.onerror = () => {
        setIsAuditioning(false);
        activeAudioElementRef.current = null;
      };

      await audio.play();
    } catch (err) {
      console.warn('[Audition Notice] Playback failed:', err);
      setIsAuditioning(false);
    }
  }, [isAuditioning, stopActiveAudioElement]);

  // Read any assistant message aloud using the RODEX Atmos Signature voice
  const handleSpeakChatMessage = useCallback(async (text: string) => {
    stopActiveAudioElement();
    try {
      const res = await fetch('/api/ai/synthesize-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          style: 'Warm, confident, personable, lightly playful, clear and concise'
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audio) {
          const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audio}`);
          activeAudioElementRef.current = audio;
          await audio.play();
          return;
        }
      }
    } catch (err) {
      console.warn('Chat speech synthesis fallback:', err);
    }

    // Fallback to browser speech synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.05;
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find((v) =>
        v.lang.startsWith('en') &&
        (/female|samantha|victoria|karen|moira|fiona|tessa|serena|stephanie|zira|google.*female|google us english|natural/i.test(v.name))
      ) || voices[0];
      if (preferredVoice) utterance.voice = preferredVoice;
      window.speechSynthesis.speak(utterance);
    }
  }, [stopActiveAudioElement]);

  // Helper to safely record sequential diagnostic stages
  const recordStage = useCallback((stage: LiveConnectionStage) => {
    lastStageRef.current = stage;
    setLastStage(stage);
    console.log(`[RODEX Voice Stage Completed] -> ${STAGE_LABELS[stage]}`);
  }, []);

  // Voice readiness and environment checks
  const [serverVoiceStatus, setServerVoiceStatus] = useState<{ checked: boolean; supported: boolean; message?: string }>({
    checked: false,
    supported: true
  });
  const [audioSupport, setAudioSupport] = useState<{ checked: boolean; supported: boolean; reason?: string }>({
    checked: false,
    supported: true
  });
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('prompt');

  // Audio and session refs
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const isMutedRef = useRef(false);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isSetupCompleteRef = useRef(false);
  const sessionIdRef = useRef<number>(0);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptsBottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const isCompatModeRef = useRef<boolean>(false);
  const liveTranscriptsRef = useRef<Array<{ sender: 'user' | 'assistant'; text: string; id: string }>>([]);

  useEffect(() => {
    liveTranscriptsRef.current = liveTranscripts;
  }, [liveTranscripts]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatLoading]);

  // Auto-scroll live voice transcripts as new speech turns arrive
  useEffect(() => {
    if (transcriptsBottomRef.current) {
      transcriptsBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveTranscripts, currentAssistantSpoken, interimUserSpeech]);

  // Check voice environment readiness on modal open (does NOT request mic access)
  useEffect(() => {
    if (!isOpen) return;

    // 1. Check server-side Live API readiness & GEMINI_API_KEY
    fetch('/api/ai/live-status')
      .then((res) => res.json())
      .then((data) => {
        setServerVoiceStatus({
          checked: true,
          supported: data.supported,
          message: data.message
        });
      })
      .catch(() => {
        setServerVoiceStatus({
          checked: true,
          supported: true
        });
      });

    // 2. Check browser audio and mediaDevices support without prompting
    const hasAudioCtx = typeof window !== 'undefined' && !!(window.AudioContext || (window as any).webkitAudioContext);
    const hasMedia = typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    setAudioSupport({
      checked: true,
      supported: hasAudioCtx && hasMedia,
      reason: !hasMedia
        ? 'Your browser or current iframe environment does not provide microphone access (navigator.mediaDevices).'
        : !hasAudioCtx
        ? 'Your browser does not support the Web Audio API needed for real-time speech.'
        : undefined
    });

    // 3. Query existing microphone permission state if Permissions API is available (does not prompt)
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      try {
        navigator.permissions.query({ name: 'microphone' as PermissionName }).then((p) => {
          setPermissionStatus(p.state);
          p.onchange = () => setPermissionStatus(p.state);
        }).catch(() => {});
      } catch (e) {}
    }
  }, [isOpen]);

  // Clean termination of all voice resources - stops mic stream, closes contexts, closes WebSocket
  const stopVoiceSession = useCallback((targetState: 'idle' | 'ended' | 'error' = 'ended') => {
    // Invalidate inflight callbacks and setup state
    sessionIdRef.current += 1;
    isSetupCompleteRef.current = false;
    setIsAutoRecovering(false);

    // Clear connection & setup timer
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    // 1. Stop mic hardware tracks immediately
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // 2. Disconnect processor and silent gain node
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (silentGainRef.current) {
      silentGainRef.current.disconnect();
      silentGainRef.current = null;
    }

    // 3. Stop active audio playing nodes
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch (e) {}
    });
    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;

    // 4. Close Audio Contexts
    if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== 'closed') {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current && outputAudioCtxRef.current.state !== 'closed') {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }

    // 5. Close WebSocket connection cleanly
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }
      } catch (e) {}
      wsRef.current = null;
    }

    // 6. Stop browser SpeechRecognition if active
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
      recognitionRef.current = null;
    }
    isCompatModeRef.current = false;

    // 7. Cancel browser SpeechSynthesis TTS and stop custom voice audio elements
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
    stopActiveAudioElement();

    if (targetState === 'idle' || targetState === 'ended') {
      hasGreetedInSessionRef.current = false;
    }

    setVoiceState(targetState);
    setCurrentAssistantSpoken('');
    setInterimUserSpeech('');
  }, []);

  // Stop voice and reset greeting flag if modal closes
  useEffect(() => {
    if (!isOpen) {
      hasGreetedInSessionRef.current = false;
      stopVoiceSession('idle');
    }
  }, [isOpen, stopVoiceSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVoiceSession('idle');
    };
  }, [stopVoiceSession]);

  // Stop native WebSocket & WebAudio pipeline only (releasing hardware tracks & contexts without stopping the overall voice session)
  const stopNativeVoicePipeline = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }
      } catch (e) {}
      wsRef.current = null;
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (silentGainRef.current) {
      silentGainRef.current.disconnect();
      silentGainRef.current = null;
    }

    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch (e) {}
    });
    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== 'closed') {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
  }, []);

  // Automatic Voice Compatibility Pipeline (Web Speech API STT -> Express Grounded AI -> Feminine Web Speech Synthesis TTS)
  const startSpeechCompatibilitySession = useCallback(() => {
    setVoiceError(null);
    isCompatModeRef.current = true;
    setVoiceState('listening');

    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      setVoiceError("Voice is temporarily unavailable in this browser. Please use Text Chat.");
      setVoiceState('error');
      return;
    }

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
        recognitionRef.current = null;
      }

      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        if (interimText) {
          setInterimUserSpeech(interimText);
        }

        if (finalText.trim()) {
          const userQuery = finalText.trim();
          const turnTimer = new VoiceTurnTimer(`turn-${Date.now()}`);
          turnTimer.markSpeechFinalized();
          setInterimUserSpeech('');
          setLiveTranscripts((t) => [
            ...t,
            { sender: 'user', text: userQuery, id: 'user-' + Date.now() }
          ]);

          try { recognition.stop(); } catch (e) {}
          setVoiceState('thinking');
          turnTimer.markRequestDispatched();

          // Bounded prior conversation history from liveTranscripts to preserve dialogue context
          const historyPayload = liveTranscriptsRef.current.slice(-6).map((t) => ({
            role: t.sender === 'user' ? 'user' : 'assistant',
            content: t.text
          }));

          fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [
                ...historyPayload,
                { role: 'user', content: userQuery }
              ],
              weatherData,
              deviceLocationData,
              mapContextData,
              activeMapLayer,
              synthesizeVoice: true // Single round-trip: Server generates text & synthesizes Atmos Signature audio
            })
          })
            .then((res) => res.json())
            .then(async (data) => {
              turnTimer.markTextReceived(Date.now(), data.timings);

              if (data.updatedCityWeather?.location) {
                onSelectCityWeather(data.updatedCityWeather);
              }

              const replyText = data.reply || "I couldn't process that weather query right now.";
              setCurrentAssistantSpoken(replyText);
              setLiveTranscripts((t) => [
                ...t,
                { sender: 'assistant', text: replyText, id: 'ast-' + Date.now() }
              ]);

              // Play audio directly if synthesized audio arrived with the response
              let playedAudio = false;
              if (data.audio) {
                try {
                  const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audio}`);
                  activeAudioElementRef.current = audio;
                  setVoiceState('speaking');
                  turnTimer.markAudioPlaybackStarted();
                  console.log(formatDiagnosticTiming(turnTimer.getMetrics()));

                  audio.onended = () => {
                    activeAudioElementRef.current = null;
                    setCurrentAssistantSpoken('');
                    if (isCompatModeRef.current) {
                      setVoiceState('listening');
                      try { recognition.start(); } catch (e) {}
                    } else {
                      setVoiceState('idle');
                    }
                  };

                  audio.onerror = () => {
                    activeAudioElementRef.current = null;
                    setCurrentAssistantSpoken('');
                    if (isCompatModeRef.current) {
                      setVoiceState('listening');
                      try { recognition.start(); } catch (e) {}
                    } else {
                      setVoiceState('idle');
                    }
                  };

                  await audio.play();
                  playedAudio = true;
                } catch (playErr) {
                  console.warn('[RODEX Voice Notice] Audio playback error:', playErr);
                }
              }

              if (playedAudio) return;

              // Fallback to browser warm feminine speech synthesis if no server audio was returned
              if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(replyText);
                utterance.rate = 1.0;
                utterance.pitch = 1.05;

                const voices = window.speechSynthesis.getVoices();
                const preferredVoice = voices.find((v) =>
                  v.lang.startsWith('en') &&
                  (/female|samantha|victoria|karen|moira|fiona|tessa|serena|stephanie|zira|google.*female|google us english|natural/i.test(v.name))
                ) || voices.find((v) => v.lang.startsWith('en')) || voices[0];

                if (preferredVoice) {
                  utterance.voice = preferredVoice;
                }

                setVoiceState('speaking');
                turnTimer.markAudioPlaybackStarted();
                console.log(formatDiagnosticTiming(turnTimer.getMetrics()));

                utterance.onend = () => {
                  setCurrentAssistantSpoken('');
                  if (isCompatModeRef.current) {
                    setVoiceState('listening');
                    try { recognition.start(); } catch (e) {}
                  } else {
                    setVoiceState('idle');
                  }
                };

                utterance.onerror = () => {
                  setCurrentAssistantSpoken('');
                  if (isCompatModeRef.current) {
                    setVoiceState('listening');
                    try { recognition.start(); } catch (e) {}
                  } else {
                    setVoiceState('idle');
                  }
                };

                window.speechSynthesis.speak(utterance);
              } else {
                setCurrentAssistantSpoken('');
                setVoiceState('listening');
                if (isCompatModeRef.current) {
                  try { recognition.start(); } catch (e) {}
                }
              }
            })
            .catch((err) => {
              console.warn('[Voice Compatibility Notice]', err);
              setVoiceError('Voice is temporarily unavailable. Tap Retry Voice to try again.');
              setVoiceState('error');
            });
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('[Speech Recognition Error]', event.error);
        if (event.error === 'no-speech') return;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setPermissionStatus('denied');
          setVoiceError('Microphone permission was denied. Please allow microphone access in your browser settings.');
          setVoiceState('error');
        }
      };

      recognition.onend = () => {
        if (isCompatModeRef.current && voiceState === 'listening') {
          try { recognition.start(); } catch (e) {}
        }
      };

      recognitionRef.current = recognition;

      // Ensure user speaks first: Start listening immediately without unprompted greeting
      try {
        recognition.start();
      } catch (e) {}
    } catch (err: any) {
      console.warn('[Speech Recognition Launch Notice]', err);
      setVoiceError('Could not launch voice recognition. Tap Retry Voice to try again.');
      setVoiceState('error');
    }
  }, [weatherData, deviceLocationData, mapContextData, activeMapLayer, onSelectCityWeather, voiceState]);

  // Start Live Voice Session: explicitly requested on user click
  const startVoiceSession = async () => {
    const tStart = performance.now();
    setVoiceError(null);
    setIsAutoRecovering(false);
    sessionIdRef.current += 1;
    const currentSessionId = sessionIdRef.current;
    isSetupCompleteRef.current = false;
    isCompatModeRef.current = false;

    // Helper to automatically recover if native WebSocket Live audio fails
    const triggerVoiceAutoRecovery = (): boolean => {
      const canAutoFallback = typeof window !== 'undefined' &&
        !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

      if (canAutoFallback && !isCompatModeRef.current) {
        console.log('[RODEX Voice] Live connection interrupted or failed. Seamlessly activating Atmos voice auto-recovery pipeline.');
        setIsAutoRecovering(true);
        setVoiceState('connecting');
        stopNativeVoicePipeline();
        startSpeechCompatibilitySession();
        return true;
      }
      return false;
    };

    // Explicitly show requesting permission state before invoking browser prompt
    setVoiceState('requesting_permission');
    recordStage('requesting_permission');

    const isSecure = typeof window !== 'undefined' ? window.isSecureContext : false;
    const inIframe = typeof window !== 'undefined' ? window.self !== window.top : false;
    const hasMedia = typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasAudioCtx = typeof window !== 'undefined' && !!(window.AudioContext || (window as any).webkitAudioContext);

    console.log('[RODEX Voice Context Diagnostic]', {
      isSecureContext: isSecure,
      inIframe,
      hasMediaDevices: typeof navigator !== 'undefined' && !!navigator.mediaDevices,
      hasGetUserMedia: hasMedia,
      hasAudioContext: hasAudioCtx,
      permissionStatus
    });

    try {
      if (!isSecure && typeof location !== 'undefined' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        throw new DOMException('Microphone access requires a Secure Context (HTTPS or localhost).', 'SecurityError');
      }

      // Check browser MediaDevices support
      if (!hasMedia) {
        throw new DOMException('Microphone API is not supported or is blocked in this browser environment (navigator.mediaDevices is unavailable).', 'NotSupportedError');
      }

      // Check browser AudioContext support
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        throw new DOMException('Web Audio API is not supported in this browser.', 'NotSupportedError');
      }

      // 1. Immediately create or reuse AudioContexts in direct user gesture stack
      let inputCtx = inputAudioCtxRef.current;
      let outputCtx = outputAudioCtxRef.current;

      if (!inputCtx || inputCtx.state === 'closed') {
        inputCtx = new AudioCtx();
        inputAudioCtxRef.current = inputCtx;
      }
      if (!outputCtx || outputCtx.state === 'closed') {
        outputCtx = new AudioCtx();
        outputAudioCtxRef.current = outputCtx;
      }

      const audioCtxResumes = [];
      if (inputCtx.state === 'suspended') audioCtxResumes.push(inputCtx.resume());
      if (outputCtx.state === 'suspended') audioCtxResumes.push(outputCtx.resume());
      await Promise.all(audioCtxResumes);
      const tAudioCtxReady = performance.now();

      // 2. PARALLEL EXECUTION: Acquire microphone stream AND fetch ephemeral token concurrently
      const micPromise = (async () => {
        const tMicStart = performance.now();
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
        } catch (firstErr: any) {
          if (
            firstErr.name === 'OverconstrainedError' ||
            firstErr.name === 'TypeError' ||
            firstErr.name === 'ConstraintNotSatisfiedError'
          ) {
            console.warn('[RODEX Voice] Specific audio constraints failed, retrying with basic audio constraint:', firstErr);
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } else {
            throw firstErr;
          }
        }
        const tMicDone = performance.now();
        return { stream, durationMs: Math.round(tMicDone - tMicStart) };
      })();

      const tokenPromise = (async () => {
        const tTokenStart = performance.now();
        const tokenRes = await fetch('/api/ai/live-token', { method: 'POST' });
        if (!tokenRes.ok) {
          const errJson = await tokenRes.json().catch(() => ({}));
          throw new Error(errJson.message || 'Unable to obtain Live voice security token from server.');
        }
        const { token } = await tokenRes.json();
        const tTokenDone = performance.now();
        return { token: token as string, durationMs: Math.round(tTokenDone - tTokenStart) };
      })();

      // Await both operations concurrently
      const [micResult, tokenResult] = await Promise.all([micPromise, tokenPromise]);
      const { stream, durationMs: micMs } = micResult;
      const { token, durationMs: tokenMs } = tokenResult;

      if (sessionIdRef.current !== currentSessionId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      mediaStreamRef.current = stream;
      setPermissionStatus('granted');
      recordStage('mic_stream_acquired');
      recordStage('ephemeral_token_received');

      // 3. Switch to connecting state once parallel prerequisites complete
      setVoiceState('connecting');

      // 4. Instantiate WebSocket connection immediately
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      recordStage('websocket_created');

      // Start 15s session setup timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      connectionTimeoutRef.current = setTimeout(() => {
        if (!isSetupCompleteRef.current && sessionIdRef.current === currentSessionId) {
          if (triggerVoiceAutoRecovery()) {
            return;
          }
          setVoiceError('Voice connection timed out. Tap Retry Voice to try again.');
          stopVoiceSession('error');
        }
      }, 15000);

      ws.onopen = () => {
        if (sessionIdRef.current !== currentSessionId) {
          try { ws.close(); } catch (e) {}
          return;
        }

        recordStage('websocket_opened');

        // Send Initial Setup with Weather Grounding, Map Context, Authenticated User Identity & Concise Speech Rules
        const location = weatherData?.location;
        const current = weatherData?.weather?.current;
        const devLoc = deviceLocationData?.location;
        const mapLoc = mapContextData?.location;
        const mapCurr = mapContextData?.weather?.current;
        const authenticatedName = sanitizeUserName(userProfile?.displayName || user?.displayName);

        const systemPrompt = `You are Hey Atmos, the expert meteorologist and voice assistant for RODEX Atmos.
${authenticatedName ? `The user is authenticated as ${authenticatedName}. Address them naturally as ${authenticatedName}.` : 'Address the user warmly.'}

CONVERSATIONAL SPEECH RULES:
1. Always respond concisely in 1 to 2 short conversational sentences (strictly under 30 spoken words).
2. Never recite capabilities or speak robotic disclaimers. Speak naturally in a warm, friendly feminine tone.
3. If the user simply says hello, thank you, or greets you, respond conversationally in one short sentence without calling tools.

Location Context Hierarchy & Rules:
1. User's Detected Physical Location: ${devLoc?.name || location?.name || 'Local Area'}, ${devLoc?.country || location?.country || ''}. (Use when user asks "What's the weather here?" or "How is my local weather?").
2. Currently Displayed Dashboard Location: ${location?.name || 'Local'}, ${location?.country || ''} (${current?.temperature_2m != null ? Math.round(current.temperature_2m) + '°C' : 'N/A'}).
3. Currently Selected Map Context Location: ${mapLoc?.name || location?.name || 'None'} (${mapCurr?.temperature_2m != null ? Math.round(mapCurr.temperature_2m) + '°C' : 'N/A'}). (Use when user asks "What's the weather at this location?", "How is it on the map?", or "Tell me about this spot").
4. Active Weather Map Layer: ${activeMapLayer || 'temperature'}. (Describe this layer using real metrics when asked to explain the map layer).
5. Explicit City Overrides: If user names a city explicitly (e.g. "What's the weather in Kampala?"), call 'getCityWeather'.
6. Location Comparisons: If user asks to compare two locations (e.g. "Compare Kampala and Entebbe", "Compare my location with Entebbe"), call 'compareWeather'.

Available Function Tools:
- 'getCityWeather': Fetch live weather conditions for a single city.
- 'compareWeather': Compare weather conditions between two cities or locations.`;

        const setupMessage = {
          setup: {
            model: 'models/gemini-3.8-live',
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: 'Aoede'
                  }
                }
              }
            },
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            tools: [
              {
                functionDeclarations: [
                  {
                    name: 'getCityWeather',
                    description: 'Fetch real live weather conditions and forecasts for any city',
                    parameters: {
                      type: 'OBJECT',
                      properties: {
                        city: { type: 'STRING', description: 'City name to look up, e.g. Kampala, Tokyo, Paris' }
                      },
                      required: ['city']
                    }
                  },
                  {
                    name: 'compareWeather',
                    description: 'Compare current weather conditions and forecasts between two cities or locations',
                    parameters: {
                      type: 'OBJECT',
                      properties: {
                        city1: { type: 'STRING', description: 'First city name or location, e.g. Kampala' },
                        city2: { type: 'STRING', description: 'Second city name or location, e.g. Entebbe' }
                      },
                      required: ['city1', 'city2']
                    }
                  }
                ]
              }
            ]
          }
        };

        ws.send(JSON.stringify(setupMessage));
        recordStage('setup_message_sent');

        try {
          if (stream && stream.active) {
            // Connect audio graph with silent gain node to prevent user microphone feedback into speakers
            // Buffer size: 1024 samples at 48kHz is ~21ms (within the 20-40ms chunk streaming window)
            const source = inputCtx.createMediaStreamSource(stream);
            const bufferSize = inputCtx.sampleRate >= 32000 ? 1024 : 512;
            const processor = inputCtx.createScriptProcessor(bufferSize, 1, 1);
            const silentGain = inputCtx.createGain();
            silentGain.gain.setValueAtTime(0, inputCtx.currentTime);

            scriptProcessorRef.current = processor;
            silentGainRef.current = silentGain;

            source.connect(processor);
            processor.connect(silentGain);
            silentGain.connect(inputCtx.destination);

            processor.onaudioprocess = (e) => {
              // Do not transmit audio until session is confirmed ready (setupComplete)
              if (
                !isSetupCompleteRef.current ||
                isMutedRef.current ||
                !wsRef.current ||
                wsRef.current.readyState !== WebSocket.OPEN ||
                sessionIdRef.current !== currentSessionId
              ) {
                return;
              }

              // Do not send mic audio while the assistant is currently speaking the greeting or active audio
              if (activeSourcesRef.current.length > 0) {
                return;
              }

              sessionDiagnosticsRef.current.micFramesCaptured += 1;

              const inputData = e.inputBuffer.getChannelData(0);
              // Resample from hardware rate to exactly 16000Hz mono PCM
              const resampled = resampleAudioBuffer(inputData, inputCtx.sampleRate, 16000);
              const pcmBuffer = floatTo16BitPCM(resampled);
              const base64Audio = arrayBufferToBase64(pcmBuffer);

              sessionDiagnosticsRef.current.audioChunksSent += 1;

              wsRef.current.send(JSON.stringify({
                realtimeInput: {
                  mediaChunks: [
                    {
                      mimeType: 'audio/pcm;rate=16000',
                      data: base64Audio
                    }
                  ]
                }
              }));

              if (lastStageRef.current === 'setup_complete_received' || lastStageRef.current === 'server_response_received') {
                recordStage('audio_message_sent');
              }
            };
          }
        } catch (audioGraphErr: any) {
          console.warn('[RODEX Voice WebAudio Notice] Audio input processing graph warning:', audioGraphErr);
        }
      };

      ws.onmessage = async (event) => {
        if (sessionIdRef.current !== currentSessionId) return;

        try {
          let rawData = '';
          if (typeof event.data === 'string') {
            rawData = event.data;
          } else if (event.data instanceof Blob) {
            rawData = await event.data.text();
          } else if (event.data instanceof ArrayBuffer) {
            rawData = new TextDecoder().decode(event.data);
          } else if (event.data && typeof event.data.text === 'function') {
            rawData = await event.data.text();
          } else {
            rawData = String(event.data || '');
          }

          if (!rawData) return;
          const msg = JSON.parse(rawData);

          // 0. Handle Structured Gemini Errors
          if (msg.error) {
            const errText = `Gemini Error (${msg.error.code || 'API Error'}): ${msg.error.message || msg.error.status || 'Structured setup error'}`;
            console.warn('[RODEX Live Voice Server Notice]', msg.error);
            if (triggerVoiceAutoRecovery()) {
              return;
            }
            setVoiceError('Voice is temporarily unavailable. Tap Retry Voice to try again.');
            stopVoiceSession('error');
            return;
          }

          // Record first server response
          if (lastStageRef.current === 'setup_message_sent' || lastStageRef.current === 'websocket_opened') {
            recordStage('server_response_received');
          }

          // 1. Handle Setup Completion -> Switch to active listening state & clear timeout
          if (msg.setupComplete) {
            const tSetupComplete = performance.now();
            if (connectionTimeoutRef.current) {
              clearTimeout(connectionTimeoutRef.current);
              connectionTimeoutRef.current = null;
            }
            isSetupCompleteRef.current = true;
            recordStage('setup_complete_received');
            sessionDiagnosticsRef.current.timeToReadyMs = Math.round(tSetupComplete - tStart);

            console.log('[RODEX Voice Startup Benchmark]', {
              audioCtxResumeMs: Math.round(tAudioCtxReady - tStart),
              micAcquisitionMs: micMs,
              tokenFetchMs: tokenMs,
              parallelPrerequisitesMs: Math.round(performance.now() - tStart),
              totalTimeToReadyMs: Math.round(tSetupComplete - tStart)
            });

            // Live session ready: enter silent listening state immediately so user speaks first
            setVoiceState('listening');
          }

          // 2. Handle Model Interruption (Barge-in)
          if (msg.serverContent?.interrupted) {
            sessionDiagnosticsRef.current.interruptionsCount += 1;
            stopActiveAudioElement();
            if (typeof window !== 'undefined' && window.speechSynthesis) {
              try { window.speechSynthesis.cancel(); } catch (e) {}
            }
            activeSourcesRef.current.forEach((src) => {
              try {
                src.stop();
                src.disconnect();
              } catch (e) {}
            });
            activeSourcesRef.current = [];
            nextStartTimeRef.current = 0;
            setCurrentAssistantSpoken((prev) => {
              if (prev.trim()) {
                setLiveTranscripts((t) => [
                  ...t,
                  { sender: 'assistant', text: `${prev.trim()} [interrupted]`, id: 'ast-' + Date.now() }
                ]);
              }
              return '';
            });
            setInterimUserSpeech('');
            setVoiceState('listening');
            return;
          }

          // 3. Handle Live Audio Transcriptions from API
          if (msg.serverContent?.interimInputTranscription?.text) {
            setInterimUserSpeech(msg.serverContent.interimInputTranscription.text);
          }

          if (msg.serverContent?.inputTranscription?.text) {
            const userText = msg.serverContent.inputTranscription.text.trim();
            setInterimUserSpeech('');
            if (userText) {
              setLiveTranscripts((t) => [
                ...t,
                { sender: 'user', text: userText, id: 'user-' + Date.now() }
              ]);
            }
          }

          if (msg.serverContent?.outputTranscription?.text) {
            setCurrentAssistantSpoken((prev) => (prev + ' ' + msg.serverContent.outputTranscription.text).trim());
          }

          // 4. Handle Function Tool Call from Live API
          if (msg.toolCall?.functionCalls) {
            setVoiceState('thinking');
            for (const call of msg.toolCall.functionCalls) {
              if (call.name === 'getCityWeather') {
                const rawCity = (call.args?.city || '').trim();
                const invalidCities = ['atmos', 'hey atmos', 'hello', 'hi', 'weather', 'none', 'unknown'];
                const cityName = (!rawCity || invalidCities.includes(rawCity.toLowerCase())) 
                  ? (weatherData?.location.name || 'Kampala')
                  : rawCity;

                try {
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 5000);
                  const searchRes = await fetch(`/api/weather/search?query=${encodeURIComponent(cityName)}`, {
                    signal: controller.signal
                  });
                  clearTimeout(timeoutId);

                  if (!searchRes.ok) {
                    const errJson = await searchRes.json().catch(() => ({}));
                    throw new Error(errJson.message || `City "${cityName}" not found`);
                  }
                  const data: WeatherData = await searchRes.json();
                  if (data?.location) {
                    // Update dashboard city, forecast, and weather-responsive background
                    onSelectCityWeather(data);
                  }

                  let localTime = 'N/A';
                  try {
                    if (data.location?.timezone && data.location.timezone !== 'auto') {
                      localTime = new Date().toLocaleTimeString('en-US', {
                        timeZone: data.location.timezone,
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                    } else {
                      localTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    }
                  } catch (e) {
                    localTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                  }

                  const conditionObj = getWeatherCondition(data.weather.current.weather_code, data.weather.current.is_day);
                  const conditionText = conditionObj.label;

                  // Respond to Live API tool call with real provider fields
                  ws.send(JSON.stringify({
                    toolResponse: {
                      functionResponses: [
                        {
                          id: call.id,
                          name: call.name,
                          response: {
                            output: {
                              city: data.location.name,
                              country: data.location.country,
                              localTime: localTime,
                              condition: conditionText,
                              temperature: `${Math.round(data.weather.current.temperature_2m)}°C`,
                              feelsLike: `${Math.round(data.weather.current.apparent_temperature)}°C`,
                              weatherCode: data.weather.current.weather_code,
                              wind: `${Math.round(data.weather.current.wind_speed_10m)} km/h`,
                              humidity: `${data.weather.current.relative_humidity_2m}%`,
                              precipitation: `${data.weather.current.precipitation} mm`
                            }
                          }
                        }
                      ]
                    }
                  }));
                } catch (err: any) {
                  ws.send(JSON.stringify({
                    toolResponse: {
                      functionResponses: [
                        {
                          id: call.id,
                          name: call.name,
                          response: {
                            output: {
                              error: `City "${cityName}" could not be resolved or weather request timed out.`
                            }
                          }
                        }
                      ]
                    }
                  }));
                }
              } else if (call.name === 'compareWeather') {
                const city1 = call.args?.city1 || 'Kampala';
                const city2 = call.args?.city2 || 'Entebbe';
                try {
                  const controller1 = new AbortController();
                  const controller2 = new AbortController();
                  const tId1 = setTimeout(() => controller1.abort(), 5000);
                  const tId2 = setTimeout(() => controller2.abort(), 5000);

                  const [res1, res2] = await Promise.all([
                    fetch(`/api/weather/search?query=${encodeURIComponent(city1)}`, { signal: controller1.signal }),
                    fetch(`/api/weather/search?query=${encodeURIComponent(city2)}`, { signal: controller2.signal })
                  ]);
                  clearTimeout(tId1);
                  clearTimeout(tId2);

                  const data1: WeatherData = await res1.json();
                  const data2: WeatherData = await res2.json();

                  const formatCityOutput = (data: WeatherData) => ({
                    city: data.location.name,
                    country: data.location.country,
                    condition: getWeatherCondition(data.weather.current.weather_code, data.weather.current.is_day).label,
                    temperature: `${Math.round(data.weather.current.temperature_2m)}°C`,
                    feelsLike: `${Math.round(data.weather.current.apparent_temperature)}°C`,
                    wind: `${Math.round(data.weather.current.wind_speed_10m)} km/h`,
                    humidity: `${data.weather.current.relative_humidity_2m}%`,
                    precipitation: `${data.weather.current.precipitation} mm`
                  });

                  ws.send(JSON.stringify({
                    toolResponse: {
                      functionResponses: [
                        {
                          id: call.id,
                          name: call.name,
                          response: {
                            output: {
                              city1: formatCityOutput(data1),
                              city2: formatCityOutput(data2)
                            }
                          }
                        }
                      ]
                    }
                  }));
                } catch (err: any) {
                  ws.send(JSON.stringify({
                    toolResponse: {
                      functionResponses: [
                        {
                          id: call.id,
                          name: call.name,
                          response: {
                            output: { error: `Could not fetch weather to compare ${city1} and ${city2}.` }
                          }
                        }
                      ]
                    }
                  }));
                }
              }
            }
          }

          // 5. Handle Model Spoken Audio Output
          const parts = msg.serverContent?.modelTurn?.parts;
          if (parts && parts.length > 0) {
            recordStage('model_response_received');
            for (const part of parts) {
              if (part.inlineData?.data) {
                setVoiceState('speaking');
                playPcmAudioChunk(
                  part.inlineData.data,
                  part.inlineData.mimeType || 'audio/pcm;rate=24000',
                  outputCtx
                );
              }
              if (part.text) {
                setCurrentAssistantSpoken((prev) => (prev ? prev + ' ' + part.text : part.text).trim());
              }
            }
          }

          // 6. Handle Turn Complete
          if (msg.serverContent?.turnComplete) {
            setCurrentAssistantSpoken((prev) => {
              if (prev.trim()) {
                setLiveTranscripts((t) => [
                  ...t,
                  { sender: 'assistant', text: prev.trim(), id: 'ast-' + Date.now() }
                ]);
              }
              return '';
            });
            if (activeSourcesRef.current.length === 0) {
              setVoiceState('listening');
            }
          }
        } catch (parseErr) {
          console.warn('Live message parsing error:', parseErr);
        }
      };

      ws.onerror = (event: Event) => {
        const target = (event?.target as WebSocket) || wsRef.current;
        const readyStateNum = target ? target.readyState : -1;
        const stateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
        const stateStr = readyStateNum >= 0 && readyStateNum <= 3 ? stateNames[readyStateNum] : 'CLOSED';
        const rawUrl = target?.url || '';
        const safeUrl = rawUrl ? rawUrl.replace(/access_token=[^&]+/, 'access_token=[REDACTED]') : 'wss://generativelanguage...';

        console.warn('[RODEX Live Voice Socket Notice]', {
          lastSuccessfulStage: STAGE_LABELS[lastStageRef.current],
          type: event.type,
          readyState: stateStr,
          url: safeUrl
        });

        if (triggerVoiceAutoRecovery()) {
          return;
        }

        setVoiceError('Voice is temporarily unavailable. Tap Retry Voice to try again.');
        stopVoiceSession('error');
      };

      ws.onclose = (event: CloseEvent) => {
        const closeCode = event.code;
        const closeReason = event.reason || getCloseCodeReason(closeCode);
        const isClean = event.wasClean;

        console.log('[RODEX Live Voice Socket Closed]', {
          lastSuccessfulStage: STAGE_LABELS[lastStageRef.current],
          code: closeCode,
          reason: closeReason,
          wasClean: isClean
        });

        if (!isClean && lastStageRef.current !== 'assistant_audio_played' && lastStageRef.current !== 'model_response_received') {
          if (triggerVoiceAutoRecovery()) {
            return;
          }
          setVoiceError('Voice is temporarily unavailable. Tap Retry Voice to try again.');
          stopVoiceSession('error');
        } else {
          stopVoiceSession('ended');
        }
      };
    } catch (err: any) {
      const errName = err.name || 'UnknownError';
      const errMsg = err.message || 'No detailed error message provided';
      console.warn(`[RODEX Voice Diagnostic] Name: ${errName} | Message: ${errMsg}`);

      const isPolicyBlocked =
        errName === 'SecurityError' ||
        errMsg.toLowerCase().includes('permissions policy') ||
        errMsg.toLowerCase().includes('permission policy') ||
        errMsg.toLowerCase().includes('disallowed') ||
        (inIframe && errName === 'NotAllowedError' && (permissionStatus === 'granted' || permissionStatus === 'prompt'));

      const isUserDenied =
        !isPolicyBlocked &&
        (errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError' ||
          errMsg.toLowerCase().includes('permission denied') ||
          errMsg.toLowerCase().includes('not allowed'));

      const isNoDevice =
        errName === 'NotFoundError' ||
        errName === 'DevicesNotFoundError' ||
        errMsg.toLowerCase().includes('requested device not found');

      const isDeviceInUse =
        errName === 'NotReadableError' ||
        errName === 'TrackStartError' ||
        errMsg.toLowerCase().includes('could not start audio source');

      const isOverconstrained =
        errName === 'OverconstrainedError' ||
        errName === 'ConstraintNotSatisfiedError';

      if (isPolicyBlocked) {
        setPermissionStatus('denied');
        setVoiceError(
          'Microphone access is restricted by the browser frame policy. Please allow microphone access in your browser settings.'
        );
      } else if (isUserDenied) {
        setPermissionStatus('denied');
        setVoiceError(
          'Microphone permission was denied. Please allow microphone permissions in your browser address bar and tap Retry Voice.'
        );
      } else if (isNoDevice) {
        setVoiceError(
          'No microphone detected on your device. Please connect an audio input device and tap Retry Voice.'
        );
      } else if (isDeviceInUse) {
        setVoiceError(
          'Microphone hardware is in use by another application. Please close competing apps and tap Retry Voice.'
        );
      } else if (isOverconstrained) {
        setVoiceError(
          'Microphone audio constraints failed. Please check your audio settings and tap Retry Voice.'
        );
      } else {
        if (triggerVoiceAutoRecovery()) {
          return;
        }
        setVoiceError(
          'Voice is temporarily unavailable. Tap Retry Voice to try again.'
        );
      }
      stopVoiceSession('error');
    }
  };

  // Single-tap voice toggle for the Atmos orb and retry button
  const handlePrimaryVoiceTap = () => {
    if (voiceState === 'idle' || voiceState === 'error' || voiceState === 'ended') {
      startVoiceSession();
    } else {
      stopVoiceSession('ended');
    }
  };

  // Diagnostics metrics tracking ref
  const playbackMetricsRef = useRef({
    receivedChunks: 0,
    decodedChunks: 0,
    totalDurationSec: 0,
    sampleRate: 24000,
    underruns: 0,
    discardedChunks: 0
  });

  // Play PCM audio chunk gaplessly with jitter buffer lead-time
  const playPcmAudioChunk = (base64Audio: string, mimeType: string = 'audio/pcm;rate=24000', ctx: AudioContext) => {
    if (isMutedRef.current || !ctx || ctx.state === 'closed') {
      playbackMetricsRef.current.discardedChunks += 1;
      return;
    }

    try {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      playbackMetricsRef.current.receivedChunks += 1;

      // Extract sample rate from MIME type if specified (e.g. rate=24000 or rate=16000), default 24000
      const rateMatch = mimeType ? mimeType.match(/rate=(\d+)/) : null;
      const targetSampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
      playbackMetricsRef.current.sampleRate = targetSampleRate;

      const float32Data = base64ToFloat32Array(base64Audio);
      if (float32Data.length === 0) return;

      playbackMetricsRef.current.decodedChunks += 1;

      // Create mono AudioBuffer matching exact PCM sample rate
      const audioBuffer = ctx.createBuffer(1, float32Data.length, targetSampleRate);
      audioBuffer.getChannelData(0).set(float32Data);

      const chunkDuration = audioBuffer.duration;
      playbackMetricsRef.current.totalDurationSec += chunkDuration;

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(ctx.destination);

      const now = ctx.currentTime;
      const INITIAL_JITTER_BUFFER_LEAD = 0.080; // 80ms initial lead time to absorb network packet arrival jitter

      // If playback cursor is behind current time (first chunk or after a gap/underrun), set lead buffer
      if (nextStartTimeRef.current < now) {
        if (nextStartTimeRef.current > 0) {
          playbackMetricsRef.current.underruns += 1;
        }
        nextStartTimeRef.current = now + INITIAL_JITTER_BUFFER_LEAD;
      }

      const scheduledStartTime = nextStartTimeRef.current;
      sourceNode.start(scheduledStartTime);
      nextStartTimeRef.current += chunkDuration;

      recordStage('assistant_audio_played');
      activeSourcesRef.current.push(sourceNode);

      sourceNode.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== sourceNode);
        // Only switch state to listening if all queued sources have finished playing
        setVoiceState((current) => {
          if (current === 'speaking' && activeSourcesRef.current.length === 0) {
            return 'listening';
          }
          return current;
        });
      };
    } catch (err) {
      console.warn('[RODEX Playback Scheduling Error]', err);
    }
  };

  // Text Chat Submit Handler
  const handleSendTextMessage = async (textToSend?: string) => {
    const text = (textToSend || inputQuery).trim();
    if (!text || isChatLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputQuery('');
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory.map((m) => ({ role: m.role, content: m.content })),
          weatherData,
          deviceLocationData,
          mapContextData,
          activeMapLayer
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Chat service encountered an error.');
      }

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        cityUpdate: data.updatedCityWeather
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // If assistant retrieved a new city weather, notify user or update
      if (data.updatedCityWeather?.location) {
        onSelectCityWeather(data.updatedCityWeather);
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Notice: ${err.message || 'Unable to connect to RODEX AI. Please check your network or server configuration.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xl animate-fade-in">
      <div className="w-full max-w-2xl bg-slate-900/90 border border-sky-400/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[85vh] max-h-[750px] relative transition-all">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center shadow-md shadow-sky-500/30 text-white">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  RODEX AI Assistant
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-semibold uppercase tracking-wider border border-sky-400/30">
                  Live & Grounded
                </span>
              </div>
              <p className="text-xs text-sky-200/70">
                Atmospheric intelligence for <span className="text-white font-medium">{weatherData?.location.name || 'Selected City'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab Switcher */}
            <div className="flex items-center p-1 bg-white/10 rounded-xl border border-white/10 text-xs font-semibold">
              <button
                onClick={() => setActiveTab('voice')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                  activeTab === 'voice'
                    ? 'bg-sky-500 text-white shadow'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Live Voice</span>
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition ${
                  activeTab === 'chat'
                    ? 'bg-sky-500 text-white shadow'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Text Chat</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition"
              title="Close Assistant"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col">
          
          {/* TAB 1: LIVE VOICE CONVERSATION */}
          {activeTab === 'voice' && (
            <div className="flex-1 flex flex-col justify-between items-center text-center py-4">
              
              {/* Voice State Badge */}
              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-md">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  voiceState === 'listening' ? 'bg-emerald-400 animate-ping' :
                  voiceState === 'speaking' ? 'bg-sky-400 animate-pulse' :
                  voiceState === 'thinking' ? 'bg-amber-400 animate-spin' :
                  voiceState === 'connecting' ? 'bg-indigo-400 animate-pulse' :
                  voiceState === 'requesting_permission' ? 'bg-amber-400 animate-pulse' :
                  voiceState === 'ended' ? 'bg-slate-400' :
                  voiceState === 'error' ? 'bg-rose-400' :
                  'bg-sky-400'
                }`} />
                <span className="text-xs font-medium text-white capitalize">
                  {voiceState === 'requesting_permission' && 'Requesting microphone permission...'}
                  {voiceState === 'connecting' && (isAutoRecovering ? 'Reconnecting Atmos voice...' : 'Connecting Atmos voice...')}
                  {voiceState === 'listening' && 'Listening to your speech...'}
                  {voiceState === 'speaking' && 'RODEX Atmos is speaking...'}
                  {voiceState === 'thinking' && 'Analyzing atmospheric data...'}
                  {voiceState === 'ended' && 'Voice ended • Tap orb to resume'}
                  {voiceState === 'idle' && (permissionStatus === 'denied' ? 'Microphone Permission Needed' : 'Tap orb to start conversation')}
                  {voiceState === 'error' && 'Voice Temporarily Unavailable'}
                </span>
              </div>

              {/* Server Setup Notice if GEMINI_API_KEY is not configured on server */}
              {serverVoiceStatus.checked && !serverVoiceStatus.supported && (
                <div className="w-full max-w-md p-3.5 mt-3 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs text-left flex items-start gap-2.5 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-white mb-0.5">GEMINI_API_KEY Setup Needed</p>
                    <p>{serverVoiceStatus.message || 'GEMINI_API_KEY is not configured in server secrets. Please add your key to server secrets to enable live voice conversation.'}</p>
                    <button
                      onClick={() => setActiveTab('chat')}
                      className="mt-2 text-[11px] font-bold text-amber-300 underline hover:text-white"
                    >
                      Use Text Chat instead →
                    </button>
                  </div>
                </div>
              )}

              {/* Browser Audio Support Notice if Web Audio or MediaDevices is unavailable */}
              {audioSupport.checked && !audioSupport.supported && (
                <div className="w-full max-w-md p-3.5 mt-3 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs text-left flex items-start gap-2.5 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-white mb-0.5">Browser Audio Notice</p>
                    <p>{audioSupport.reason || 'Audio capture is not supported in this browser context.'}</p>
                    <button
                      onClick={() => setActiveTab('chat')}
                      className="mt-2 text-[11px] font-bold text-amber-300 underline hover:text-white"
                    >
                      Use Text Chat instead →
                    </button>
                  </div>
                </div>
              )}

              {/* Central Interactive Voice Pulse Orb */}
              <div className="my-6 relative flex flex-col items-center justify-center">
                {/* Ambient glowing wave ripples */}
                {voiceState === 'listening' && (
                  <>
                    <div className="absolute w-44 h-44 rounded-full bg-emerald-500/20 animate-ping duration-1000" />
                    <div className="absolute w-36 h-36 rounded-full bg-sky-500/20 animate-pulse duration-700" />
                  </>
                )}
                {voiceState === 'speaking' && (
                  <>
                    <div className="absolute w-48 h-48 rounded-full bg-sky-400/25 animate-pulse duration-500" />
                    <div className="absolute w-40 h-40 rounded-full bg-indigo-500/30 animate-ping duration-1000" />
                  </>
                )}

                {/* Primary Mic Trigger Button */}
                <button
                  onClick={handlePrimaryVoiceTap}
                  className={`w-28 h-28 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-300 z-10 ${
                    voiceState === 'listening'
                      ? 'bg-gradient-to-tr from-emerald-500 to-sky-500 text-white shadow-emerald-500/50 scale-105 ring-4 ring-emerald-400/50'
                      : voiceState === 'speaking'
                      ? 'bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-sky-500/50 scale-105 ring-4 ring-sky-400/50'
                      : voiceState === 'thinking'
                      ? 'bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-amber-500/50 scale-95'
                      : voiceState === 'connecting'
                      ? 'bg-slate-700 text-slate-300 animate-pulse'
                      : voiceState === 'requesting_permission'
                      ? 'bg-amber-600/80 text-amber-100 animate-pulse ring-4 ring-amber-400/40'
                      : voiceState === 'ended'
                      ? 'bg-slate-700 hover:bg-slate-600 text-white shadow-slate-700/40 hover:scale-105 cursor-pointer ring-2 ring-white/20'
                      : 'bg-gradient-to-tr from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-sky-500/30 hover:scale-105 cursor-pointer'
                  }`}
                  title={
                    voiceState === 'idle' || voiceState === 'error' || voiceState === 'ended'
                      ? 'Tap to start live voice session'
                      : 'Tap to end voice session'
                  }
                >
                  {voiceState === 'connecting' || voiceState === 'requesting_permission' ? (
                    <Loader2 className="w-10 h-10 animate-spin" />
                  ) : voiceState === 'speaking' ? (
                    <Volume2 className="w-10 h-10 animate-bounce" />
                  ) : (
                    <Mic className="w-10 h-10" />
                  )}
                  <span className="text-[11px] font-bold mt-1 tracking-wide">
                    {voiceState === 'requesting_permission'
                      ? 'Prompting...'
                      : voiceState === 'connecting'
                      ? (isAutoRecovering ? 'Reconnecting...' : 'Connecting...')
                      : voiceState === 'idle' || voiceState === 'error' || voiceState === 'ended'
                      ? 'Start Voice'
                      : 'End Session'}
                  </span>
                </button>

                <p className="text-[11px] text-white/50 mt-3 max-w-xs">
                  {voiceState === 'requesting_permission'
                    ? 'Please allow microphone access in your browser prompt'
                    : voiceState === 'connecting'
                    ? (isAutoRecovering ? 'Reconnecting Atmos voice...' : 'Connecting Atmos voice...')
                    : voiceState === 'listening'
                    ? 'Speak naturally: ask about any city or forecast'
                    : voiceState === 'speaking'
                    ? 'Speaking live meteorological answer'
                    : voiceState === 'ended'
                    ? 'Voice ended • Tap orb to resume'
                    : 'Tap orb to speak with Atmos'}
                </p>
              </div>

              {/* Error Message if all voice paths fail or microphone permission is denied */}
              {voiceError && (
                <div className="w-full max-w-md p-3.5 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs text-left flex items-start gap-2.5 mb-3 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold mb-0.5 text-white">Voice Notice</p>
                    <p className="leading-relaxed">{voiceError}</p>
                    <div className="mt-2.5">
                      <button
                        onClick={handlePrimaryVoiceTap}
                        className="text-xs font-bold px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white transition shadow cursor-pointer"
                      >
                        Retry Voice
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* RODEX Atmos Signature Voice Identity & Audition Pill */}
              <div className="w-full max-w-lg mx-auto mb-3 px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-purple-500/10 border border-sky-400/25 backdrop-blur-md flex items-center justify-between text-left">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center text-white shadow-sm shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-white tracking-wide">RODEX Atmos Signature</span>
                      <span className="px-1.5 py-0.5 rounded bg-sky-400/20 text-sky-300 text-[9px] font-semibold border border-sky-400/30">
                        Original Voice
                      </span>
                    </div>
                    <p className="text-[10px] text-sky-200/70 leading-tight">
                      Warm, confident feminine voice • Gemini TTS Engine
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAuditionSignatureVoice}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                    isAuditioning
                      ? 'bg-rose-500 text-white shadow-rose-500/30 animate-pulse'
                      : 'bg-white/10 hover:bg-white/20 text-sky-200 hover:text-white border border-white/15'
                  }`}
                  title="Audition RODEX Atmos Signature Voice"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{isAuditioning ? 'Stop Audition' : 'Audition Voice'}</span>
                </button>
              </div>

              {/* Real-Time Live Transcripts & Spoken Captions */}
              <div className="w-full max-w-lg bg-black/40 border border-white/10 rounded-2xl p-4 text-left flex flex-col h-44 overflow-y-auto text-xs space-y-2.5">
                <div className="text-[10px] uppercase font-bold text-sky-400 tracking-wider flex items-center justify-between">
                  <span>Live Spoken Conversation</span>
                  {voiceState === 'speaking' && (
                    <span className="text-[9px] text-sky-300 font-medium animate-pulse flex items-center gap-1">
                      <Volume2 className="w-3 h-3" /> Speaking 24kHz
                    </span>
                  )}
                  {voiceState === 'listening' && (
                    <span className="text-[9px] text-emerald-400 font-medium flex items-center gap-1">
                      <Mic className="w-3 h-3 animate-pulse" /> 16kHz Mono Stream
                    </span>
                  )}
                </div>

                {liveTranscripts.length === 0 && !currentAssistantSpoken && !interimUserSpeech && (
                  <p className="text-white/40 italic my-auto text-center leading-relaxed">
                    Click <strong className="text-white/70">"Start Voice"</strong> to talk with RODEX Atmos.<br />
                    Ask: <em>"What's the weather in Kampala?"</em>, <em>"Is it raining in Tokyo?"</em>, or <em>"What should I wear?"</em>
                  </p>
                )}

                {liveTranscripts.map((t) => (
                  <div key={t.id} className="text-white/80 leading-relaxed">
                    <strong className={t.sender === 'assistant' ? 'text-sky-300 font-semibold' : 'text-emerald-400 font-semibold'}>
                      {t.sender === 'assistant' ? 'RODEX Atmos: ' : 'You: '}
                    </strong>
                    <span>{t.text}</span>
                  </div>
                ))}

                {/* Real-time Interim User Speech */}
                {interimUserSpeech && (
                  <div className="text-amber-300/90 italic flex items-start gap-1.5 animate-pulse">
                    <strong className="text-amber-400 font-semibold not-italic shrink-0">You (speaking): </strong>
                    <span>"{interimUserSpeech}"</span>
                  </div>
                )}

                {/* Tool execution thinking indicator */}
                {voiceState === 'thinking' && (
                  <div className="text-indigo-300 italic flex items-center gap-2 py-0.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400 shrink-0" />
                    <span>Retrieving verified weather forecast from router...</span>
                  </div>
                )}

                {/* Real-time Streaming Model Speech */}
                {currentAssistantSpoken && (
                  <div className="text-sky-200 animate-pulse leading-relaxed">
                    <strong className="text-sky-400 font-semibold">RODEX Atmos: </strong>
                    <span>{currentAssistantSpoken}</span>
                  </div>
                )}

                <div ref={transcriptsBottomRef} />
              </div>

              {/* Voice Controls: Mute and End Session */}
              {voiceState !== 'idle' && voiceState !== 'ended' && (
                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={() => setIsMuted((m) => !m)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition ${
                      isMuted
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-200'
                        : 'bg-white/10 hover:bg-white/20 border-white/20 text-white'
                    }`}
                  >
                    {isMuted ? <MicOff className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4 text-sky-300" />}
                    <span>{isMuted ? 'Muted' : 'Mute Mic'}</span>
                  </button>

                  <button
                    onClick={() => stopVoiceSession('ended')}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-rose-500/20 hover:border-rose-500/40 border border-white/20 text-white text-xs font-semibold transition"
                  >
                    End Voice
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: INTERACTIVE TEXT CHAT */}
          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col justify-between">
              
              {/* Message History */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-sky-500 text-white rounded-br-none shadow-md'
                          : 'bg-white/10 border border-white/15 text-white/95 rounded-bl-none shadow-md backdrop-blur-md'
                      }`}
                    >
                      <p>{m.content}</p>

                      {/* Speak with RODEX Atmos Signature Voice button */}
                      {m.role === 'assistant' && (
                        <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => handleSpeakChatMessage(m.content)}
                            className="text-[11px] text-sky-300 hover:text-white flex items-center gap-1.5 transition cursor-pointer font-medium"
                            title="Listen with RODEX Atmos Signature Voice"
                          >
                            <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                            <span>Listen with Atmos Signature Voice</span>
                          </button>
                        </div>
                      )}

                      {/* Attached City Update Button if tool was invoked */}
                      {m.cityUpdate && (
                        <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between gap-3">
                          <div className="text-xs text-sky-200">
                            Loaded <strong className="text-white">{m.cityUpdate.location.name}</strong> live weather
                          </div>
                          <button
                            onClick={() => {
                              onSelectCityWeather(m.cityUpdate!);
                              onClose();
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/30 hover:bg-sky-500 text-white text-xs font-semibold transition"
                          >
                            <span>View on App</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-white/40 mt-1 px-1">
                      {m.timestamp}
                    </span>
                  </div>
                ))}

                {isChatLoading && (
                  <div className="flex items-center gap-2 text-sky-300 text-xs py-2 px-3 rounded-xl bg-white/5 w-fit border border-white/10">
                    <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                    <span>RODEX AI is analyzing atmospheric data...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* In-App Interactive Action Triggers */}
              {onExecuteAction && (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none text-xs border-b border-white/10 mb-2">
                  <span className="text-[10px] font-bold text-sky-300 uppercase tracking-wider shrink-0 self-center mr-1">
                    In-App Actions:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onExecuteAction('SWITCH_TAB', 'map');
                      onClose();
                    }}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500 text-sky-200 hover:text-white border border-sky-400/30 transition flex items-center gap-1 font-semibold"
                  >
                    <span>🗺️ Switch to Weather Map</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onExecuteAction('SET_MAP_LAYER', 'precipitation');
                      onClose();
                    }}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500 text-blue-200 hover:text-white border border-blue-400/30 transition flex items-center gap-1 font-semibold"
                  >
                    <span>🌧️ Rain Layer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onExecuteAction('SET_MAP_LAYER', 'wind');
                      onClose();
                    }}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500 text-teal-200 hover:text-white border border-teal-400/30 transition flex items-center gap-1 font-semibold"
                  >
                    <span>💨 Wind Layer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onExecuteAction('RESET_GPS');
                      onClose();
                    }}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-200 hover:text-white border border-emerald-400/30 transition flex items-center gap-1 font-semibold"
                  >
                    <span>📍 Recenter to My Location</span>
                  </button>
                </div>
              )}

              {/* Quick Prompt Chips */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none text-xs">
                {[
                  'What should I wear today?',
                  'Any rain expected soon?',
                  'How is the weather in Tokyo?',
                  'Best outdoor time today?'
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSendTextMessage(prompt)}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-white/80 hover:text-white border border-white/10 transition"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendTextMessage();
                }}
                className="mt-2 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  placeholder={`Ask anything about ${weatherData?.location.name || 'weather'}...`}
                  disabled={isChatLoading}
                  className="flex-1 bg-white/10 hover:bg-white/15 focus:bg-white/20 text-white placeholder-white/50 text-sm rounded-xl px-4 py-3 border border-white/20 focus:outline-none focus:ring-2 focus:ring-sky-400/50 backdrop-blur-md transition disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!inputQuery.trim() || isChatLoading}
                  className="p-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold shadow-lg transition disabled:opacity-40"
                  title="Send message"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>

            </div>
          )}

        </div>

        {/* Modal Footer Note */}
        <div className="px-6 py-2.5 border-t border-white/10 bg-black/30 flex items-center justify-between text-[11px] text-white/50">
          <span>Grounded in live atmospheric data from Open-Meteo & WeatherAPI</span>
          <span>Single-use Ephemeral Tokens • Server-side Secrets</span>
        </div>

      </div>
    </div>
  );
};
