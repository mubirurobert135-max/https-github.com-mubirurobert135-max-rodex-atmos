import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Mic, MicOff, Send, Sparkles, X, MessageSquare, Volume2, 
  Radio, AlertCircle, Compass, CheckCircle2, ChevronRight, Loader2, ArrowUpRight
} from 'lucide-react';
import { WeatherData } from '../types';
import { floatTo16BitPCM, arrayBufferToBase64, base64ToFloat32Array } from '../utils/audioUtils';
import { getWeatherCondition } from '../utils/weatherUtils';

interface AssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  weatherData: WeatherData | null;
  onSelectCityWeather: (data: WeatherData) => void;
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

export const AssistantModal: React.FC<AssistantModalProps> = ({
  isOpen,
  onClose,
  weatherData,
  onSelectCityWeather
}) => {
  const [activeTab, setActiveTab] = useState<'voice' | 'chat'>('voice');

  // Text Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I am RODEX AI. I can answer questions about current conditions in ${weatherData?.location.name || 'your location'}, advise what to wear, suggest outdoor plans, or look up weather anywhere in the world. How can I help you today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Live Voice State
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [liveTranscripts, setLiveTranscripts] = useState<Array<{ sender: 'user' | 'assistant'; text: string; id: string }>>([]);
  const [currentAssistantSpoken, setCurrentAssistantSpoken] = useState('');

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

  // Audio refs
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const isMutedRef = useRef(false);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatLoading]);

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
    // 1. Stop mic hardware tracks immediately
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // 2. Disconnect processor
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
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

    // 5. Close WebSocket connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setVoiceState(targetState);
    setCurrentAssistantSpoken('');
  }, []);

  // Stop voice if modal closes
  useEffect(() => {
    if (!isOpen) {
      stopVoiceSession('idle');
    }
  }, [isOpen, stopVoiceSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVoiceSession('idle');
    };
  }, [stopVoiceSession]);

  // Start Live Voice Session: explicitly requested on user click
  const startVoiceSession = async () => {
    setVoiceError(null);
    // Explicitly show requesting permission state before invoking browser prompt
    setVoiceState('requesting_permission');

    try {
      // Check browser MediaDevices support
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone capture is not supported in this browser context (navigator.mediaDevices is unavailable).');
      }

      // Check browser AudioContext support
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('Web Audio API is not supported in this browser.');
      }

      // 1. Request microphone access strictly upon user action (shows browser permission prompt)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;
      setPermissionStatus('granted');

      // 2. Switch to connecting state once mic permission is granted
      setVoiceState('connecting');

      // Request short-lived, single-use ephemeral token from server (never client key)
      const tokenRes = await fetch('/api/ai/live-token', { method: 'POST' });
      if (!tokenRes.ok) {
        const errJson = await tokenRes.json();
        throw new Error(errJson.message || 'Unable to obtain Live voice security token from server.');
      }
      const { token } = await tokenRes.json();

      // 3. Initialize Audio Contexts
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      const outputCtx = new AudioCtx({ sampleRate: 24000 });
      if (inputCtx.state === 'suspended') {
        await inputCtx.resume();
      }
      if (outputCtx.state === 'suspended') {
        await outputCtx.resume();
      }
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      // 4. Connect to Gemini Live Constrained WebSocket endpoint with ephemeral token
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setVoiceState('connecting');

        // Send Initial Setup with Weather Grounding
        const location = weatherData?.location;
        const current = weatherData?.weather?.current;
        const daily = weatherData?.weather?.daily;

        const systemPrompt = `You are RODEX AI, the real-time spoken voice meteorologist for the RODEX Atmos app.
CURRENT DASHBOARD LOCATION:
- City: ${location?.name || 'Local'}, ${location?.country || ''}
- Temperature: ${current?.temperature_2m != null ? Math.round(current.temperature_2m) + '°C' : '20°C'}
- Condition Code: ${current?.weather_code ?? 0}
- Humidity: ${current?.relative_humidity_2m ?? 50}%

MANDATORY CITY LOOKUP RULE:
Whenever the user asks about the weather in any city (e.g., "What's the weather in Kampala?", "How is it in Tokyo?", "Tell me the weather in Paris"), you MUST immediately call the tool 'getCityWeather' with the exact city name.
DO NOT guess or invent coordinates or temperatures. Wait for the tool result.
Once you receive the tool response, speak a concise 1-to-2 sentence answer stating:
1. The city name and country.
2. The current temperature, weather condition, humidity, and wind.
3. The city's local time (from localTime field).
Only use real fields returned by the tool. If the tool reports that the city could not be found, explain that clearly and ask for the country or spelling.`;

        const setupMessage = {
          setup: {
            model: 'models/gemini-3.8-live',
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: 'Zephyr'
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
                        city: { type: 'STRING', description: 'City name to look up' }
                      },
                      required: ['city']
                    }
                  }
                ]
              }
            ]
          }
        };

        ws.send(JSON.stringify(setupMessage));

        // Start streaming microphone PCM chunks (16kHz)
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        scriptProcessorRef.current = processor;

        source.connect(processor);
        processor.connect(inputCtx.destination);

        processor.onaudioprocess = (e) => {
          if (isMutedRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmBuffer = floatTo16BitPCM(inputData);
          const base64Audio = arrayBufferToBase64(pcmBuffer);

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
        };
      };

      ws.onmessage = async (event) => {
        try {
          const rawData = typeof event.data === 'string' ? event.data : await event.data.text();
          const msg = JSON.parse(rawData);

          // Handle Setup Completion -> Switch to active listening state
          if (msg.setupComplete) {
            setVoiceState('listening');
          }

          // Handle Model Interruption
          if (msg.serverContent?.interrupted) {
            setVoiceState('listening');
            activeSourcesRef.current.forEach((src) => {
              try {
                src.stop();
                src.disconnect();
              } catch (e) {}
            });
            activeSourcesRef.current = [];
            nextStartTimeRef.current = 0;
            return;
          }

          // Handle Function Tool Call from Live API
          if (msg.toolCall?.functionCalls) {
            setVoiceState('thinking');
            for (const call of msg.toolCall.functionCalls) {
              if (call.name === 'getCityWeather') {
                const cityName = call.args?.city || 'London';
                try {
                  const searchRes = await fetch(`/api/weather/search?query=${encodeURIComponent(cityName)}`);
                  if (!searchRes.ok) {
                    const errJson = await searchRes.json();
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

                  // Add live spoken captions for the lookup and result
                  setLiveTranscripts((t) => [
                    ...t,
                    {
                      sender: 'user',
                      text: `What's the weather in ${cityName}?`,
                      id: Date.now().toString()
                    },
                    {
                      sender: 'assistant',
                      text: `In ${data.location.name}, ${data.location.country}, the local time is ${localTime}. Current conditions are ${conditionText.toLowerCase()} at ${Math.round(data.weather.current.temperature_2m)}°C (feels like ${Math.round(data.weather.current.apparent_temperature)}°C) with ${data.weather.current.relative_humidity_2m}% humidity and wind at ${Math.round(data.weather.current.wind_speed_10m)} km/h.`,
                      id: (Date.now() + 1).toString()
                    }
                  ]);

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
                  setLiveTranscripts((t) => [
                    ...t,
                    {
                      sender: 'assistant',
                      text: `I could not locate "${cityName}" via our geocoding service. Please check the spelling or specify the country.`,
                      id: Date.now().toString()
                    }
                  ]);

                  ws.send(JSON.stringify({
                    toolResponse: {
                      functionResponses: [
                        {
                          id: call.id,
                          name: call.name,
                          response: {
                            output: {
                              error: `City "${cityName}" could not be resolved or found. Please ask the user to check the spelling or provide the country name.`
                            }
                          }
                        }
                      ]
                    }
                  }));
                }
              }
            }
          }

          // Handle Model Audio Output
          const parts = msg.serverContent?.modelTurn?.parts;
          if (parts && parts.length > 0) {
            for (const part of parts) {
              if (part.inlineData?.data) {
                setVoiceState('speaking');
                play24kPcmChunk(part.inlineData.data, outputCtx);
              }
              if (part.text) {
                setCurrentAssistantSpoken((prev) => {
                  const next = prev + ' ' + part.text;
                  return next.trim();
                });
              }
            }
          }

          // Handle Turn Complete
          if (msg.serverContent?.turnComplete) {
            setCurrentAssistantSpoken((prev) => {
              if (prev.trim()) {
                setLiveTranscripts((t) => [
                  ...t,
                  { sender: 'assistant', text: prev.trim(), id: Date.now().toString() }
                ]);
              }
              return '';
            });
            setVoiceState('listening');
          }
        } catch (parseErr) {
          console.warn('Live message parsing error:', parseErr);
        }
      };

      ws.onerror = (err) => {
        console.warn('Live voice socket notice:', err);
        setVoiceError('Live voice connection interrupted. Please tap "Start Voice" to reconnect or switch to text chat.');
        stopVoiceSession('error');
      };

      ws.onclose = () => {
        stopVoiceSession('ended');
      };
    } catch (err: any) {
      const isDenied = err.name === 'NotAllowedError' || 
                       err.name === 'PermissionDeniedError' || 
                       err.message?.toLowerCase().includes('permission denied') ||
                       err.message?.toLowerCase().includes('not allowed');

      const isNoDevice = err.name === 'NotFoundError' || 
                         err.name === 'DevicesNotFoundError' ||
                         err.message?.toLowerCase().includes('requested device not found');

      if (isDenied) {
        setPermissionStatus('denied');
        setVoiceError('Microphone permission was denied. To enable real-time voice, please allow microphone access in your browser address bar (lock/site settings icon) and tap Start Voice again, or switch to Text Chat.');
      } else if (isNoDevice) {
        setVoiceError('No microphone was detected on your system. Please connect an audio input device or switch to Text Chat.');
      } else {
        setVoiceError(err.message || 'Live voice session encountered a temporary issue. Please check your connection or switch to Text Chat.');
      }
      stopVoiceSession('error');
    }
  };

  // Play 24kHz audio chunk gaplessly
  const play24kPcmChunk = (base64Audio: string, ctx: AudioContext) => {
    if (isMutedRef.current || ctx.state === 'closed') return;

    try {
      const float32Data = base64ToFloat32Array(base64Audio);
      const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(ctx.destination);

      const now = ctx.currentTime;
      if (nextStartTimeRef.current < now) {
        nextStartTimeRef.current = now;
      }

      sourceNode.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;

      activeSourcesRef.current.push(sourceNode);
      sourceNode.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== sourceNode);
        if (activeSourcesRef.current.length === 0 && voiceState === 'speaking') {
          setVoiceState('listening');
        }
      };
    } catch (err) {
      console.warn('Audio playback error:', err);
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
          weatherData
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
                  {voiceState === 'connecting' && 'Connecting to Gemini Live...'}
                  {voiceState === 'listening' && 'Listening to your speech...'}
                  {voiceState === 'speaking' && 'RODEX AI is speaking...'}
                  {voiceState === 'thinking' && 'Analyzing weather forecast...'}
                  {voiceState === 'ended' && 'Voice chat ended • Tap Start Voice to resume'}
                  {voiceState === 'idle' && (permissionStatus === 'denied' ? 'Microphone Permission Needed' : 'Voice Ready • Tap Start Voice')}
                  {voiceState === 'error' && 'Session Interrupted'}
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
                  onClick={
                    voiceState === 'idle' || voiceState === 'error' || voiceState === 'ended'
                      ? startVoiceSession
                      : () => stopVoiceSession('ended')
                  }
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
                      ? 'Connecting...'
                      : voiceState === 'idle' || voiceState === 'error' || voiceState === 'ended'
                      ? 'Start Voice'
                      : 'End Session'}
                  </span>
                </button>

                <p className="text-[11px] text-white/50 mt-3 max-w-xs">
                  {voiceState === 'requesting_permission'
                    ? 'Please allow microphone access in your browser prompt'
                    : voiceState === 'connecting'
                    ? 'Setting up secure live audio stream...'
                    : voiceState === 'listening'
                    ? 'Speak naturally: ask about any city or forecast'
                    : voiceState === 'speaking'
                    ? 'Speaking live meteorological answer'
                    : voiceState === 'ended'
                    ? 'Voice chat ended. Tap Start Voice to resume anytime'
                    : 'Tap Start Voice to begin real-time conversation'}
                </p>
              </div>

              {/* Error Message if Mic access failed or session encountered an error */}
              {voiceError && (
                <div className="w-full max-w-md p-3.5 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs text-left flex items-start gap-2.5 mb-3 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold mb-0.5 text-white">Voice Notice</p>
                    <p className="leading-relaxed">{voiceError}</p>
                    <div className="flex items-center gap-3 mt-2.5">
                      <button
                        onClick={startVoiceSession}
                        className="text-[11px] font-bold px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-white transition shadow"
                      >
                        Try Again
                      </button>
                      <button
                        onClick={() => setActiveTab('chat')}
                        className="text-[11px] font-semibold text-sky-300 hover:text-white transition"
                      >
                        Switch to Text Chat →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Real-Time Live Transcripts & Spoken Captions */}
              <div className="w-full max-w-lg bg-black/30 border border-white/10 rounded-2xl p-4 text-left flex flex-col h-44 overflow-y-auto text-xs space-y-2">
                <div className="text-[10px] uppercase font-bold text-sky-400 tracking-wider">
                  Live Spoken Captions
                </div>
                {liveTranscripts.length === 0 && !currentAssistantSpoken && (
                  <p className="text-white/40 italic my-auto text-center">
                    Click "Start Voice" to speak with RODEX AI. Live captions will display here in real time.
                  </p>
                )}
                {liveTranscripts.map((t) => (
                  <div key={t.id} className="text-white/80">
                    <strong className="text-sky-300 font-semibold">{t.sender === 'assistant' ? 'RODEX AI: ' : 'You: '}</strong>
                    {t.text}
                  </div>
                ))}
                {currentAssistantSpoken && (
                  <div className="text-sky-200 animate-pulse">
                    <strong className="text-sky-400 font-semibold">RODEX AI: </strong>
                    {currentAssistantSpoken}
                  </div>
                )}
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
