import React from 'react';
import { PersonalityMode, VoiceStatus, LiveConnectionState } from '../types';
import { PERSONALITY_MODES } from '../constants/modes';
import { Bot, Volume2, VolumeX, LogIn, User as UserIcon, Zap } from 'lucide-react';
import { User } from 'firebase/auth';

interface HeaderProps {
  currentMode: PersonalityMode;
  status: VoiceStatus;
  apiOnline: boolean;
  liveState?: LiveConnectionState;
  currentUser: User | null;
  onOpenModes: () => void;
  onOpenDiagnostics?: () => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onStopSpeech: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentMode,
  status,
  apiOnline,
  liveState = 'disconnected',
  currentUser,
  onOpenModes,
  onOpenDiagnostics,
  onOpenAuth,
  onOpenProfile,
  onStopSpeech,
  isMuted,
  onToggleMute,
}) => {
  const modeConfig = PERSONALITY_MODES[currentMode];

  return (
    <header className="sticky top-0 z-30 w-full glass-panel border-b border-slate-800/80 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
      {/* Zone 1: Brand Title & Creator Identity */}
      <div className="flex items-center gap-3">
        <div
          onClick={onOpenModes}
          className="relative w-9 h-9 rounded-xl flex items-center justify-center p-0.5 cursor-pointer shadow-lg transition-transform active:scale-95"
          style={{
            background: `linear-gradient(135deg, ${modeConfig.accentColor}, #8b5cf6)`,
          }}
          title="Switch Personality Mode"
        >
          <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
            <span className="text-base select-none">{modeConfig.emoji}</span>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold tracking-tight text-white font-display">
              JIYA AI
            </span>
            <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border transition-colors ${
              liveState === 'connected'
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 shadow-sm'
                : 'bg-purple-950/80 text-purple-300 border-purple-500/30'
            }`}>
              {liveState === 'connected' ? 'LIVE WS ⚡' : '3.8 FLASH'}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            Created by <strong className="text-slate-300 font-semibold">Sumit Kumar</strong>
          </span>
        </div>
      </div>

      {/* Zone 2: Status Indicator (API & Engine) */}
      <div className="hidden md:flex items-center gap-4 text-xs">
        <button
          onClick={onOpenDiagnostics}
          className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/60 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors cursor-pointer"
          title="Open System Diagnostics"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              liveState === 'connected'
                ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse'
                : apiOnline
                ? 'bg-emerald-400'
                : 'bg-amber-400'
            }`}
          />
          <span className="font-mono text-[11px]">
            {liveState === 'connected'
              ? '⚡ Gemini Live WebSocket Connected'
              : apiOnline
              ? 'Gemini 3.8 Connected'
              : 'Check API Status'}
          </span>
        </button>

        <button
          onClick={onOpenModes}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border text-slate-200 hover:text-white transition-colors"
          style={{ borderColor: `${modeConfig.accentColor}55` }}
        >
          <Bot className="w-3.5 h-3.5" style={{ color: modeConfig.accentColor }} />
          <span>{modeConfig.name}</span>
        </button>
      </div>

      {/* Zone 3: Actions (Mode Switch & Audio Mute) */}
      <div className="flex items-center gap-2">
        {status === 'speaking' && (
          <button
            onClick={onStopSpeech}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-950/80 border border-red-500/40 text-red-200 animate-pulse flex items-center gap-1"
            title="Stop Speech"
          >
            <span>Interrupt</span>
          </button>
        )}

        <button
          onClick={onToggleMute}
          className={`p-2 rounded-xl border transition-colors ${
            isMuted
              ? 'bg-red-950/50 border-red-500/40 text-red-300'
              : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:text-white'
          }`}
          title={isMuted ? 'Unmute Audio Voice' : 'Mute Voice Output'}
          aria-label="Toggle Audio"
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {/* User Account / Sign In Button */}
        {currentUser ? (
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-xl bg-purple-950/60 hover:bg-purple-900/80 border border-purple-500/40 text-white transition-all shadow-md active:scale-95 cursor-pointer"
            title="Open Account Profile & Settings"
          >
            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt="Avatar"
                className="w-6 h-6 rounded-lg object-cover border border-purple-400/50"
              />
            ) : (
              <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-500 to-cyan-400 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                {currentUser.displayName?.[0] || currentUser.email?.[0] || 'U'}
              </div>
            )}
            <span className="text-xs font-medium max-w-[80px] sm:max-w-[110px] truncate hidden sm:inline">
              {currentUser.displayName || currentUser.email?.split('@')[0]}
            </span>
          </button>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 hover:brightness-110 text-white font-semibold text-xs shadow-md shadow-purple-950/50 transition-all active:scale-95 cursor-pointer"
            title="Sign in with Google or Email"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
        )}

        <button
          onClick={onOpenModes}
          className="md:hidden flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border bg-slate-900/80 text-white"
          style={{ borderColor: `${modeConfig.accentColor}66` }}
        >
          <span>{modeConfig.emoji}</span>
          <span className="truncate max-w-[70px]">{modeConfig.name}</span>
        </button>
      </div>
    </header>
  );
};
