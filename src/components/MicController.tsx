import React, { useEffect, useState } from 'react';
import { Mic, MicOff, Square, Volume2, AlertCircle } from 'lucide-react';
import { PersonalityMode, VoiceStatus } from '../types';
import { PERSONALITY_MODES } from '../constants/modes';
import { speechRecManager, audioOutputManager } from '../services/speechService';

interface MicControllerProps {
  mode: PersonalityMode;
  status: VoiceStatus;
  autoResume: boolean;
  onTranscriptCaptured: (text: string) => void;
  onStatusChange: (status: VoiceStatus) => void;
  onManualStop: () => void;
}

export const MicController: React.FC<MicControllerProps> = ({
  mode,
  status,
  autoResume,
  onTranscriptCaptured,
  onStatusChange,
  onManualStop,
}) => {
  const currentMode = PERSONALITY_MODES[mode];
  const [interimText, setInterimText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe once to display live interim speech preview without duplicating final submission
    const unsubscribe = speechRecManager.subscribeResult((transcript: string, isFinal: boolean) => {
      if (isFinal) {
        setInterimText('');
      } else {
        setInterimText(transcript);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status !== 'listening') {
      setInterimText('');
    }
  }, [status]);

  const toggleMic = () => {
    setErrorMessage(null);

    // If currently speaking, stop speech and stop mic
    if (status === 'speaking') {
      audioOutputManager.stopAllSpeech();
      speechRecManager.stop();
      onStatusChange('idle');
      return;
    }

    // If currently listening, user explicitly toggles it OFF
    if (status === 'listening') {
      // If user had pending spoken text when clicking stop, commit it immediately so no words are lost!
      const pending = speechRecManager.getPendingTranscript();
      if (pending && pending.trim().length > 0) {
        speechRecManager.pauseForAI();
        onTranscriptCaptured(pending.trim());
        setInterimText('');
        return;
      }

      speechRecManager.stop();
      onStatusChange('idle');
      setInterimText('');
      return;
    }

    // User is turning the mic ON!
    // Start continuous listening: "bar bar on off na ho hamesha on rahe jab on kare"
    audioOutputManager.stopAllSpeech();
    onStatusChange('listening');
    speechRecManager.start(true);
  };

  return (
    <div className="flex flex-col items-center w-full max-w-sm px-4">
      {/* Interim Live Transcript / Status Alert */}
      {interimText && status === 'listening' && (
        <div className="mb-3 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-purple-500/30 text-xs text-purple-200 animate-pulse flex items-center gap-2 max-w-xs truncate shadow-lg">
          <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
          <span className="truncate">{interimText}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-3 px-3 py-1.5 rounded-lg bg-red-950/80 border border-red-500/40 text-[11px] text-red-200 flex items-center gap-1.5 shadow-md max-w-xs text-center">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
          <span className="truncate">{errorMessage}</span>
        </div>
      )}

      {/* Futuristic Glowing Arc-Reactor Microphone Button */}
      <div className="relative flex items-center justify-center">
        {/* Pulsing Concentric Shockwaves when Listening */}
        {status === 'listening' && (
          <>
            <div
              className="absolute w-28 h-28 rounded-full animate-ping opacity-30 pointer-events-none"
              style={{ backgroundColor: currentMode.accentColor }}
            />
            <div
              className="absolute w-24 h-24 rounded-full animate-pulse opacity-40 pointer-events-none"
              style={{ backgroundColor: currentMode.accentColor }}
            />
          </>
        )}

        {/* Outer Glow Halo */}
        <div
          className="absolute w-20 h-20 rounded-full blur-xl opacity-70 transition-all duration-500 pointer-events-none"
          style={{ backgroundColor: currentMode.accentColor }}
        />

        {/* Main Mic Button */}
        <button
          onClick={toggleMic}
          className={`relative z-10 w-16 h-16 sm:w-18 sm:h-18 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl active:scale-95 cursor-pointer border-2 ${
            status === 'listening'
              ? 'bg-slate-950 text-white scale-105 ring-4 ring-emerald-500/30'
              : status === 'speaking'
              ? 'bg-purple-900/80 text-white hover:bg-purple-800'
              : 'bg-slate-900/90 text-slate-100 hover:scale-105'
          }`}
          style={{
            borderColor: status === 'listening' ? '#10b981' : currentMode.accentColor,
            boxShadow: `0 0 25px ${currentMode.glowColor}, inset 0 0 15px rgba(255,255,255,0.15)`,
          }}
          aria-label={
            status === 'listening'
              ? 'Stop continuous listening'
              : status === 'speaking'
              ? 'Stop speaking'
              : 'Start continuous voice conversation'
          }
        >
          {status === 'listening' ? (
            <Square className="w-6 h-6 text-red-400 fill-current animate-pulse" />
          ) : status === 'speaking' ? (
            <Volume2 className="w-6 h-6 text-cyan-300 animate-bounce" />
          ) : (
            <Mic className="w-7 h-7 transition-transform group-hover:scale-110" style={{ color: currentMode.accentColor }} />
          )}
        </button>
      </div>

      {/* Button Sub-Label & Status Details */}
      <div className="mt-3 flex flex-col items-center gap-1 text-center">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-200">
            {status === 'listening'
              ? '🎙️ Listening... (Speak freely)'
              : status === 'speaking'
              ? '🔊 JIYA AI बोल रही है (Mic Off)'
              : status === 'processing'
              ? '⚡ Thinking... (Mic Paused)'
              : status === 'generating_voice'
              ? '🎵 Preparing voice... (Mic Off)'
              : 'Tap mic to start hands-free conversation'}
          </span>

          {(status === 'listening' || status === 'speaking' || status === 'processing') && (
            <button
              onClick={onManualStop}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-red-950/80 border border-red-500/40 text-red-300 hover:text-white transition-colors"
              title="Stop Continuous Mic"
            >
              <MicOff className="w-3 h-3" />
              <span>Stop</span>
            </button>
          )}
        </div>

        {/* Continuous Hands-Free Badge */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900/90 border border-slate-800 text-[10px] text-slate-400">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              status === 'listening'
                ? 'bg-emerald-400 animate-pulse'
                : status === 'speaking'
                ? 'bg-purple-400'
                : 'bg-slate-500'
            }`}
          />
          <span>
            {status === 'speaking'
              ? 'JIYA बोलते समय Mic बंद रहता है · पूरी बात के बाद तुरंत चालू होगा'
              : 'हमेशा ऑन मोड (बोलते वक्त Mic बंद, जवाब खत्म होते ही स्वतः चालू)'}
          </span>
        </div>
      </div>
    </div>
  );
};
