import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Volume2, 
  Play, 
  Pause, 
  RotateCcw, 
  Loader2,
  
  AlertCircle, 
  Headphones,
  Check
} from 'lucide-react';
import { Course } from '../types/academic';
import { geminiClient } from '../services/geminiClient';

interface AudioBriefingModalProps {
  course: Course | null;
  isOpen: boolean;
  onClose: () => void;
}

const VOICES = [
  { id: 'Kore', name: 'Kore (Calm & Clear)' },
  { id: 'Zephyr', name: 'Zephyr (Bright & Friendly)' },
  { id: 'Fenrir', name: 'Fenrir (Deep & Steady)' },
  { id: 'Puck', name: 'Puck (Lively & Dynamic)' },
];

export const AudioBriefingModal: React.FC<AudioBriefingModalProps> = ({
  course,
  isOpen,
  onClose,
}) => {
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDeviceVoice, setIsDeviceVoice] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isSpeechSynthesisRef = useRef(false);
  const speechTimerRef = useRef<any>(null);

  // Stop any playback on unmount
  useEffect(() => {
    return () => {
      handleStop();
    };
  }, []);

  // Generate audio when modal opens with a course
  useEffect(() => {
    if (isOpen && course) {
      generateAudio();
    } else {
      handleStop();
      setAudioUrl(null);
      setTranscript('');
      setIsDeviceVoice(false);
      setErrorMessage(null);
    }
  }, [isOpen, course?.id]);

  const startSpeechUtterance = (textToSpeak: string, startFromBeginning = false) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (speechTimerRef.current) clearInterval(speechTimerRef.current);

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 1.0;
    utterance.pitch = selectedVoice === 'Fenrir' ? 0.85 : selectedVoice === 'Puck' ? 1.15 : 1.0;

    utterance.onstart = () => {
      setIsPlaying(true);
      if (startFromBeginning) setCurrentTime(0);
      speechTimerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (duration > 0 && prev >= duration) {
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (speechTimerRef.current) clearInterval(speechTimerRef.current);
    };

    utterance.onerror = () => {
      setIsPlaying(false);
      if (speechTimerRef.current) clearInterval(speechTimerRef.current);
    };

    window.speechSynthesis.speak(utterance);
  };

  const generateAudio = async (voiceToUse = selectedVoice) => {
    if (!course) return;
    setIsLoading(true);
    setErrorMessage(null);
    handleStop();

    try {
      const data = await geminiClient.generateCourseAudioBriefing(course, voiceToUse);
      const text = data.transcript || '';
      setTranscript(text);

      if (data.audio) {
        isSpeechSynthesisRef.current = false;
        setIsDeviceVoice(false);
        const url = `data:${data.mimeType || 'audio/wav'};base64,${data.audio}`;
        setAudioUrl(url);

        // Setup audio element
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.load();
        }
      } else {
        // Fallback to Web Speech API
        isSpeechSynthesisRef.current = true;
        setIsDeviceVoice(true);
        setAudioUrl(null);
        const words = text.trim().split(/\s+/).filter(Boolean).length;
        const estDuration = Math.max(8, Math.round(words / 2.5));
        setDuration(estDuration);
      }
    } catch (err: any) {
      console.warn('Audio briefing failed:', err?.message || err);
      setErrorMessage(err.message || 'Failed to synthesize speech briefing.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePlay = () => {
    if (isSpeechSynthesisRef.current) {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      if (isPlaying) {
        window.speechSynthesis.pause();
        setIsPlaying(false);
        if (speechTimerRef.current) clearInterval(speechTimerRef.current);
      } else {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
          setIsPlaying(true);
          speechTimerRef.current = setInterval(() => {
            setCurrentTime((prev) => (duration > 0 && prev >= duration ? prev : prev + 1));
          }, 1000);
        } else {
          startSpeechUtterance(transcript, currentTime === 0);
        }
      }
      return;
    }

    if (!audioRef.current || !audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.error('Playback error:', e));
    }
  };

  const handleStop = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (speechTimerRef.current) {
      clearInterval(speechTimerRef.current);
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleRestart = () => {
    if (isSpeechSynthesisRef.current) {
      setCurrentTime(0);
      startSpeechUtterance(transcript, true);
      return;
    }

    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().then(() => setIsPlaying(true));
    }
  };

  const handleVoiceChange = (voice: string) => {
    setSelectedVoice(voice);
    generateAudio(voice);
  };

  if (!isOpen || !course) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="audio-briefing-title"
        className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8"
      >
        {/* Hidden Audio Element */}
        <audio
          ref={audioRef}
          onTimeUpdate={() => {
            if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
          }}
          onLoadedMetadata={() => {
            if (audioRef.current) setDuration(audioRef.current.duration);
          }}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="audio-briefing-title" className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Audio Course Briefing
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs sm:max-w-md">
                {course.name}
              </p>
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

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Voice selector */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50/60 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Advisor Voice:</span>
              {isDeviceVoice && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  device speech
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {VOICES.map((v) => (
                <button
                  key={v.id}
                  onClick={() => handleVoiceChange(v.id)}
                  disabled={isLoading}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    selectedVoice === v.id
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {v.id}
                </button>
              ))}
            </div>
          </div>

          {/* Player controls */}
          <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-50 dark:from-slate-950 to-white dark:to-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4">
            {isLoading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Synthesizing Course Overview...</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  This usually takes a few seconds.
                </div>
              </div>
            ) : errorMessage ? (
              <div className="py-6 flex flex-col items-center justify-center gap-2 text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                <div className="text-xs font-medium">{errorMessage}</div>
                <button
                  onClick={() => generateAudio()}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs text-slate-900 dark:text-white"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <>
                {/* Visualizer Waveform mockup */}
                <div className="flex items-center justify-center gap-1.5 h-12 px-4">
                  {[24, 40, 16, 32, 48, 20, 36, 44, 28, 52, 38, 22, 46, 30, 42, 18, 34, 48, 26, 38].map(
                    (height, i) => (
                      <div
                        key={i}
                        className={`w-1 rounded-full transition-all duration-150 ${
                          isPlaying
                            ? 'bg-indigo-400 animate-pulse'
                            : 'bg-slate-200 dark:bg-slate-700'
                        }`}
                        style={{
                          height: isPlaying ? `${Math.max(12, (height * (i % 3 + 1)) % 48)}px` : '10px',
                        }}
                      />
                    )
                  )}
                </div>

                {/* Scrubber progress */}
                <div className="space-y-1">
                  <div className="w-full bg-[#dbe6f5] dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full transition-all"
                      style={{
                        width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%',
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    <span>{Math.floor(currentTime)}s</span>
                    <span>{Math.floor(duration)}s</span>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex items-center justify-center gap-4 pt-2">
                  <button
                    onClick={handleRestart}
                    className="p-2.5 rounded-full text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Rewind"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>

                  <button
                    onClick={handleTogglePlay}
                    className="w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/40 transition-transform hover:scale-105 active:scale-95"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Transcript Section */}
          {transcript && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Spoken Transcript
              </span>
              <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800/80 text-xs text-slate-700 dark:text-slate-300 leading-relaxed max-h-36 overflow-y-auto">
                {transcript}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};