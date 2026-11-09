import React, { useState } from 'react';
import { PersonalityMode, VoiceStatus, LiveConnectionState } from '../types';
import { PERSONALITY_MODES } from '../constants/modes';
import { Avatar3D } from './Avatar3D';
import { VoiceWaveform } from './VoiceWaveform';
import { MicController } from './MicController';
import {
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Square,
  MessageSquare,
  Wrench,
  Sliders,
  RotateCw,
  KeyRound,
  Activity,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PlaybackStatus } from '../services/speechService';
import { connectWebLiveApiKey } from '../services/geminiService';

interface HomeViewProps {
  currentMode: PersonalityMode;
  status: VoiceStatus;
  liveState?: LiveConnectionState;
  viewMode: '3d-canvas' | 'portrait';
  onToggleViewMode: () => void;
  autoResume: boolean;
  onTranscriptCaptured: (text: string) => void;
  onStatusChange: (status: VoiceStatus) => void;
  onManualStop: () => void;
  onSendTextMessage: (text: string) => void;
  lastAssistantMessage: string | null;
  onPlayLastSpeech: () => void;
  onPauseLastSpeech: () => void;
  onResumeLastSpeech: () => void;
  onStopSpeech: () => void;
  playbackStatus: PlaybackStatus;
  apiKeyConfigured: boolean;
  onNavigateToTab: (tab: any) => void;
  onOpenModesModal: () => void;
  borderLightMode?: 'spectrum-bokeh' | 'persona-sync' | 'off';
  onChangeBorderLightMode?: (mode: 'spectrum-bokeh' | 'persona-sync' | 'off') => void;
  voiceEngine?: 'gemini' | 'browser';
  onToggleVoiceEngine?: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  currentMode,
  status,
  liveState = 'disconnected',
  viewMode,
  onToggleViewMode,
  autoResume,
  onTranscriptCaptured,
  onStatusChange,
  onManualStop,
  onSendTextMessage,
  lastAssistantMessage,
  onPlayLastSpeech,
  onPauseLastSpeech,
  onResumeLastSpeech,
  onStopSpeech,
  playbackStatus,
  apiKeyConfigured,
  onNavigateToTab,
  onOpenModesModal,
  borderLightMode = 'spectrum-bokeh',
  onChangeBorderLightMode,
  voiceEngine = 'browser',
  onToggleVoiceEngine,
}) => {
  const [quickInput, setQuickInput] = useState('');
  const [isConnectingLive, setIsConnectingLive] = useState(false);
  const [liveToast, setLiveToast] = useState<string | null>(null);
  const modeConfig = PERSONALITY_MODES[currentMode];

  const handleQuickConnectWeb = async () => {
    setIsConnectingLive(true);
    setLiveToast(null);
    try {
      const res = await connectWebLiveApiKey();
      setLiveToast(res.message);
      setTimeout(() => setLiveToast(null), 5000);
    } catch {
      onNavigateToTab('settings');
    } finally {
      setIsConnectingLive(false);
    }
  };

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim() || status === 'processing') return;
    onSendTextMessage(quickInput.trim());
    setQuickInput('');
  };

  const triggerCelebration = () => {
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
      colors: [modeConfig.accentColor, '#38bdf8', '#c084fc'],
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-4 pb-28 flex flex-col items-center space-y-5">
      {/* Gemini Live API Web Status / Quick Connect Banner */}
      {!apiKeyConfigured ? (
        <div className="w-full max-w-md p-3.5 rounded-2xl bg-purple-950/70 border border-purple-500/40 text-xs text-purple-200 flex items-center justify-between shadow-xl gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-purple-400 shrink-0" />
            <span>Connect Gemini Live API Key via Web to activate AI & Voice.</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleQuickConnectWeb}
              disabled={isConnectingLive}
              className="px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-600 to-purple-600 hover:brightness-110 text-white font-semibold text-xs shadow-md flex items-center gap-1"
            >
              <Zap className="w-3 h-3 text-yellow-300" />
              <span>{isConnectingLive ? 'Connecting...' : 'Web Connect'}</span>
            </button>
            <button
              onClick={() => onNavigateToTab('settings')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs"
            >
              Settings
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div className={`inline-flex items-center gap-2 px-3.5 py-1 rounded-full border text-[11px] font-medium shadow-md transition-colors ${
            liveState === 'connected'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
              : liveState === 'connecting'
              ? 'bg-amber-950/70 border-amber-500/40 text-amber-300'
              : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              liveState === 'connected'
                ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse'
                : liveState === 'connecting'
                ? 'bg-amber-400 animate-ping'
                : 'bg-emerald-400'
            }`} />
            <span>
              {liveState === 'connected'
                ? '⚡ Gemini Live WebSocket Connected · Ultra-Fast Voice & Stream'
                : liveState === 'connecting'
                ? 'Connecting to Gemini Live WebSocket...'
                : 'Gemini 3.8 Live Web Connected · Studio Voice Active'}
            </span>
          </div>

          {onChangeBorderLightMode && (
            <button
              type="button"
              onClick={() => {
                const order: Array<'spectrum-bokeh' | 'persona-sync' | 'off'> = [
                  'spectrum-bokeh',
                  'persona-sync',
                  'off',
                ];
                const next = order[(order.indexOf(borderLightMode) + 1) % order.length];
                onChangeBorderLightMode(next);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-orange-500/50 text-amber-200 text-[11px] font-semibold shadow-md transition-all"
              title="Click to switch Edge Border Light Animation mode"
            >
              <Sparkles className="w-3 h-3 text-orange-400" />
              <span>
                Border Light:{' '}
                {borderLightMode === 'spectrum-bokeh'
                  ? 'Rainbow Bokeh'
                  : borderLightMode === 'persona-sync'
                  ? 'Persona Sync'
                  : 'Off'}
              </span>
            </button>
          )}

          {onToggleVoiceEngine && (
            <button
              type="button"
              onClick={onToggleVoiceEngine}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-semibold shadow-md transition-all ${
                voiceEngine === 'browser'
                  ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200'
                  : 'bg-purple-950/80 border-purple-400 text-purple-200'
              }`}
              title="Click to switch Voice Speed Mode"
            >
              <Zap className="w-3 h-3 text-yellow-300" />
              <span>{voiceEngine === 'browser' ? '⚡ Fast Voice (तुरंत)' : '🎙️ Studio Voice'}</span>
            </button>
          )}
        </div>
      )}

      {liveToast && (
        <div className="w-full max-w-md p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs text-center">
          {liveToast}
        </div>
      )}

      {/* Welcome Banner Card */}
      <div className="w-full text-center space-y-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-slate-300 text-xs backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5" style={{ color: modeConfig.accentColor }} />
          <span>Active Persona: <strong className="text-white">{modeConfig.name}</strong></span>
          <button
            onClick={onOpenModesModal}
            className="text-[11px] underline underline-offset-2 hover:text-white ml-1 font-semibold"
            style={{ color: modeConfig.accentColor }}
          >
            Change
          </button>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-display">
          Welcome to <span style={{ color: modeConfig.accentColor }}>JIYA AI</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
          {modeConfig.tagline} · Speak naturally or type below
        </p>
      </div>

      {/* 3D Animated Female AI Avatar & Headphones */}
      <Avatar3D
        mode={currentMode}
        status={status}
        viewMode={viewMode}
        onToggleViewMode={onToggleViewMode}
      />

      {/* Real-time Glowing Voice Waveform */}
      <VoiceWaveform status={status} mode={currentMode} />

      {/* Last Assistant Message Bubble / Live Voice Player */}
      {lastAssistantMessage && (
        <div
          className={`w-full max-w-md p-4 rounded-2xl glass-panel-glow border text-xs text-slate-200 transition-all duration-300 shadow-xl relative space-y-2 ${
            borderLightMode === 'spectrum-bokeh' ? 'border-light-card' : ''
          }`}
          style={
            borderLightMode === 'spectrum-bokeh'
              ? undefined
              : { borderColor: `${modeConfig.accentColor}44` }
          }
        >
          <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1.5 border-b border-slate-800/60">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <span>{modeConfig.emoji}</span>
              <span>JIYA Response ({modeConfig.voiceName.split(' ')[0]})</span>
            </span>

            {/* Play / Pause / Stop Audio Controls */}
            <div className="flex items-center gap-1.5">
              {playbackStatus === 'loading' ? (
                <div className="flex items-center gap-1 text-cyan-300 animate-pulse text-[11px]">
                  <RotateCw className="w-3 h-3 animate-spin" />
                  <span>Generating Voice...</span>
                </div>
              ) : playbackStatus === 'playing' ? (
                <>
                  <button
                    onClick={onPauseLastSpeech}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-[11px]"
                    title="Pause Voice"
                  >
                    <Pause className="w-3 h-3" />
                    <span>Pause</span>
                  </button>
                  <button
                    onClick={onStopSpeech}
                    className="p-1 rounded-lg bg-slate-800 hover:bg-red-950/70 text-slate-300 hover:text-red-300 border border-slate-700"
                    title="Stop Voice"
                  >
                    <Square className="w-3 h-3" />
                  </button>
                </>
              ) : playbackStatus === 'paused' ? (
                <>
                  <button
                    onClick={onResumeLastSpeech}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px]"
                    title="Resume Voice"
                  >
                    <Play className="w-3 h-3" />
                    <span>Resume</span>
                  </button>
                  <button
                    onClick={onStopSpeech}
                    className="p-1 rounded-lg bg-slate-800 text-slate-300 hover:text-red-300 border border-slate-700"
                    title="Stop Voice"
                  >
                    <Square className="w-3 h-3" />
                  </button>
                </>
              ) : (
                <button
                  onClick={onPlayLastSpeech}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white border border-slate-700 text-[11px]"
                  title="Play Natural Generated Audio"
                >
                  <Volume2 className="w-3 h-3" />
                  <span>Play Voice</span>
                </button>
              )}
            </div>
          </div>

          <p className="line-clamp-3 leading-relaxed">{lastAssistantMessage}</p>
        </div>
      )}

      {/* Large Glowing Arc-Reactor Microphone Button */}
      <MicController
        mode={currentMode}
        status={status}
        autoResume={autoResume}
        onTranscriptCaptured={onTranscriptCaptured}
        onStatusChange={onStatusChange}
        onManualStop={onManualStop}
      />

      {/* Quick Text Input Bar */}
      <form
        onSubmit={handleQuickSubmit}
        className="w-full max-w-md flex items-center gap-2 pt-1"
      >
        <div className="relative flex-1">
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder={`Ask JIYA anything in ${modeConfig.name}...`}
            disabled={status === 'processing'}
            className="w-full h-11 px-4 rounded-xl bg-slate-900/90 border border-slate-800 focus:border-purple-500 text-sm text-white placeholder-slate-500 outline-none transition-all shadow-inner"
          />
        </div>

        <button
          type="submit"
          disabled={!quickInput.trim() || status === 'processing'}
          className="h-11 px-4 rounded-xl text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg disabled:opacity-40 shrink-0"
          style={{ backgroundColor: modeConfig.accentColor }}
        >
          <Send className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Ask</span>
        </button>
      </form>

      {/* Sample Voice Queries Chips */}
      <div className="w-full max-w-md space-y-2 pt-1">
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
          <span>Suggested Questions:</span>
          <button
            onClick={triggerCelebration}
            className="text-purple-400 hover:text-purple-300"
          >
            Say Hello ✨
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {modeConfig.samplePrompts.slice(0, 3).map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => onSendTextMessage(prompt)}
              className="text-left text-xs px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800/80 transition-all truncate max-w-full"
            >
              "{prompt}"
            </button>
          ))}
        </div>
      </div>

      {/* Quick Action Navigation Buttons */}
      <div className="w-full max-w-md grid grid-cols-4 gap-2 pt-2">
        <button
          onClick={() => onNavigateToTab('modes')}
          className="p-2.5 rounded-xl glass-panel hover:bg-slate-800/80 border border-slate-800 text-center transition-colors flex flex-col items-center justify-center gap-1 text-slate-300 hover:text-white"
        >
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-[10px] font-medium">5 Modes</span>
        </button>

        <button
          onClick={() => onNavigateToTab('chat')}
          className="p-2.5 rounded-xl glass-panel hover:bg-slate-800/80 border border-slate-800 text-center transition-colors flex flex-col items-center justify-center gap-1 text-slate-300 hover:text-white"
        >
          <MessageSquare className="w-4 h-4 text-cyan-400" />
          <span className="text-[10px] font-medium">Full Chat</span>
        </button>

        <button
          onClick={() => onNavigateToTab('tools')}
          className="p-2.5 rounded-xl glass-panel hover:bg-slate-800/80 border border-slate-800 text-center transition-colors flex flex-col items-center justify-center gap-1 text-slate-300 hover:text-white"
        >
          <Wrench className="w-4 h-4 text-pink-400" />
          <span className="text-[10px] font-medium">Tools</span>
        </button>

        <button
          onClick={() => onNavigateToTab('diagnostics')}
          className="p-2.5 rounded-xl glass-panel hover:bg-slate-800/80 border border-slate-800 text-center transition-colors flex flex-col items-center justify-center gap-1 text-slate-300 hover:text-white"
        >
          <Activity className="w-4 h-4 text-emerald-400" />
          <span className="text-[10px] font-medium">Diagnostics</span>
        </button>
      </div>
    </div>
  );
};
