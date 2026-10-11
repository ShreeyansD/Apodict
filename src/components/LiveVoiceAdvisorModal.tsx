import { Course } from '../types/academic';
import { buildAdvisorContext } from '../services/advisorContext';
import { auth } from '../services/firebase';
import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Mic, 
  MicOff,
  
  Volume2, 
  Send, 
  AlertCircle, 
  
  MessageSquare,
  Activity
} from 'lucide-react';

interface LiveVoiceAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: Course[];
}

// Convert Float32 audio buffer from mic to 16kHz 16-bit PCM base64
function float32ToPCM16Base64(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert base64 24kHz 16-bit PCM from Gemini Live to Float32 AudioBuffer
function base64PCM16ToAudioBuffer(
  ctx: AudioContext,
  base64Data: string,
  sampleRate = 24000
): AudioBuffer {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const audioBuffer = ctx.createBuffer(1, int16.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  for (let i = 0; i < int16.length; i++) {
    channelData[i] = int16[i] / 32768.0;
  }
  return audioBuffer;
}

export const LiveVoiceAdvisorModal: React.FC<LiveVoiceAdvisorModalProps> = ({
  isOpen,
  onClose,
  courses,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [statusText, setStatusText] = useState('Connecting...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'model' | 'system'; text: string }>>([
    {
      sender: 'system',
      text: 'Connected to Academic Voice Advisor. Speak into your mic or type questions about your course schedule, midterms, and study strategy.',
    },
  ]);
  const [textInput, setTextInput] = useState('');
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isMicActiveRef = useRef<boolean>(false);

  useEffect(() => {
    isMicActiveRef.current = isMicActive;
  }, [isMicActive]);

  useEffect(() => {
    if (isOpen) {
      connectWebSocket();
    } else {
      cleanupAudioAndWS();
    }

    return () => {
      cleanupAudioAndWS();
    };
  }, [isOpen]);

  const connectWebSocket = async () => {
    cleanupAudioAndWS();
    setErrorMessage(null);
    setStatusText('Connecting to Live Voice Server...');

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setErrorMessage('Please sign in to talk with the Live Voice Advisor.');
        setStatusText('Sign-in required');
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Give the advisor a summary of the student's courses and token before the session starts
        ws.send(JSON.stringify({ type: 'init', token, context: buildAdvisorContext(courses) }));
        setIsConnected(true);
        setStatusText('Live Advisor Ready. Click Start Mic or type below.');
        // Initialize output AudioContext (24kHz for Gemini Live model output)
        if (!outputAudioCtxRef.current) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          outputAudioCtxRef.current = new AudioContextClass({ sampleRate: 24000 });
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'ready') {
            setStatusText('Voice Advisor active. Listening & speaking...');
          } else if (msg.type === 'audio' && msg.audio) {
            playAudioChunk(msg.audio);
          } else if (msg.type === 'interrupted') {
            stopPlayback();
          } else if (msg.type === 'error') {
            setErrorMessage(msg.error || 'Live API error occurred');
            setStatusText('Connection paused');
          }
        } catch (e) {
          console.error('Error parsing live WS message:', e);
        }
      };

      ws.onerror = (e) => {
        console.error('Live WS error:', e);
        setErrorMessage((prev) => prev || 'WebSocket connection error. Please verify server connection.');
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setStatusText('Live session disconnected.');
      };
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to start Live connection.');
    }
  };

  const startMicCapture = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported on this browser.');
      }

      setErrorMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      mediaStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      inputAudioCtxRef.current = inputCtx;

      const source = inputCtx.createMediaStreamSource(stream);
      // Process 4096 samples buffer
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(inputCtx.destination);

      processor.onaudioprocess = (e) => {
        if (!isMicActiveRef.current) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const base64 = float32ToPCM16Base64(inputData);
        wsRef.current.send(JSON.stringify({ audio: base64 }));
      };

      setIsMicActive(true);
      setStatusText('Mic active: Speak naturally with your advisor...');
    } catch (err: any) {
      console.error('Mic error:', err);
      setErrorMessage(err.message || 'Microphone permission denied.');
      setIsMicActive(false);
    }
  };

  const stopMicCapture = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== 'closed') {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    setIsMicActive(false);
    setStatusText('Microphone muted.');
  };

  const playAudioChunk = (base64Audio: string) => {
    const ctx = outputAudioCtxRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      const audioBuffer = base64PCM16ToAudioBuffer(ctx, base64Audio, 24000);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime;
      }

      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;

      activeSourcesRef.current.push(source);
      setIsModelSpeaking(true);

      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
        if (activeSourcesRef.current.length === 0) {
          setIsModelSpeaking(false);
        }
      };
    } catch (e) {
      console.error('Error playing audio chunk:', e);
    }
  };

  const stopPlayback = () => {
    activeSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch (e) {}
    });
    activeSourcesRef.current = [];
    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    }
    setIsModelSpeaking(false);
  };

  const cleanupAudioAndWS = () => {
    stopMicCapture();
    stopPlayback();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (outputAudioCtxRef.current && outputAudioCtxRef.current.state !== 'closed') {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }
    setIsConnected(false);
    setIsMicActive(false);
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const query = textInput.trim();
    setMessages((prev) => [...prev, { sender: 'user', text: query }]);
    setTextInput('');

    wsRef.current.send(JSON.stringify({ text: query }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-advisor-title"
        className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Mic className="w-5 h-5" />
              </div>
              {isMicActive && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-slate-200 dark:ring-slate-900 animate-ping" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="voice-advisor-title" className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Academic Voice Advisor
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{statusText}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Voice Interaction Central Orb */}
          <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-50 dark:from-slate-950 to-white dark:to-slate-900 border border-slate-200 dark:border-slate-800 text-center flex flex-col items-center justify-center gap-4">
            <div className="relative flex items-center justify-center">
              {/* Outer pulsing rings */}
              <div
                className={`w-28 h-28 rounded-full transition-all duration-300 flex items-center justify-center ${
                  isModelSpeaking
                    ? 'bg-indigo-500/20 ring-4 ring-indigo-500/40 animate-pulse scale-110'
                    : isMicActive
                    ? 'bg-emerald-500/20 ring-4 ring-emerald-500/40 scale-105'
                    : 'bg-slate-100/60 dark:bg-slate-800/60'
                }`}
              >
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-transform ${
                    isModelSpeaking
                      ? 'bg-indigo-600 text-white'
                      : isMicActive
                      ? 'bg-emerald-600 text-white animate-pulse'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {isModelSpeaking ? (
                    <Volume2 className="w-8 h-8 animate-bounce" />
                  ) : isMicActive ? (
                    <Mic className="w-8 h-8" />
                  ) : (
                    <MicOff className="w-8 h-8" />
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {isModelSpeaking
                  ? 'Advisor Speaking...'
                  : isMicActive
                  ? 'Listening to you...'
                  : 'Microphone Muted'}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                {isMicActive
                  ? 'Ask about balancing course workloads, midterms prep, or study schedule tips.'
                  : 'Press the microphone button below to talk with your advisor in real time.'}
              </p>
            </div>

            {/* Mic Toggle Button */}
            <div className="flex items-center gap-3 pt-1">
              {!isMicActive ? (
                <button
                  type="button"
                  onClick={startMicCapture}
                  disabled={!isConnected}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 text-white text-xs font-semibold shadow-md shadow-emerald-600/25 transition-all"
                >
                  <Mic className="w-4 h-4" />
                  <span>Unmute Microphone</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopMicCapture}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-600/25 transition-all"
                >
                  <MicOff className="w-4 h-4" />
                  <span>Mute Microphone</span>
                </button>
              )}

              {isModelSpeaking && (
                <button
                  type="button"
                  onClick={stopPlayback}
                  className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium"
                >
                  Interrupt
                </button>
              )}
            </div>
          </div>

          {/* Quick Academic Prompts */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Or tap a question for your advisor:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                'How should I prioritize my study schedule this week?',
                'What is the best way to prepare for a 30% final exam?',
                'How do I handle two exams on the same day?',
              ].map((suggestion, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                      setMessages((prev) => [...prev, { sender: 'user', text: suggestion }]);
                      wsRef.current.send(JSON.stringify({ text: suggestion }));
                    }
                  }}
                  className="text-left text-xs px-2.5 py-1.5 rounded-lg bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-300/60 dark:border-slate-700/60 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* Text Message Fallback Feed */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Conversation Activity</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 max-h-36 overflow-y-auto">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`text-xs p-2 rounded-lg leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-indigo-50/60 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 border border-indigo-200/60 dark:border-indigo-900/60 ml-4'
                      : m.sender === 'model'
                      ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 mr-4'
                      : 'bg-white/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 text-[11px]'
                  }`}
                >
                  {m.text}
                </div>
              ))}
            </div>
          </div>

          {/* Text input form for quiet study areas */}
          <form onSubmit={handleSendText} className="flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type message for Live Advisor (quiet mode)..."
              disabled={!isConnected}
              className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={!isConnected || !textInput.trim()}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold shadow-sm transition-all"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Close Voice Advisor
          </button>
        </div>
      </div>
    </div>
  );
};