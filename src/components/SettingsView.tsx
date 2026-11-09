import React, { useState } from 'react';
import { AppSettings, PersonalityMode, ApiStatus, LiveConnectionState } from '../types';
import { PERSONALITY_MODES } from '../constants/modes';
import { liveWebSocketService } from '../services/liveWebSocketService';
import {
  KeyRound,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  Trash2,
  Cpu,
  Volume2,
  Mic,
  Languages,
  Palette,
  Sliders,
  CheckCircle2,
  XCircle,
  Activity,
  AlertCircle,
  Sparkles,
  User as UserIcon,
  LogOut,
  LogIn,
  Fingerprint,
  Database,
  Zap,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  saveUserApiKey,
  removeUserApiKey,
  testApiConnection,
  cleanApiKey,
  connectWebLiveApiKey,
} from '../services/geminiService';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  currentMode: PersonalityMode;
  onSelectMode: (mode: PersonalityMode) => void;
  onClearChatHistory: () => void;
  apiStatus: ApiStatus;
  liveState?: LiveConnectionState;
  onRefreshApiStatus: () => void;
  onOpenDiagnostics: () => void;
  currentUser: User | null;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  currentMode,
  onSelectMode,
  onClearChatHistory,
  apiStatus,
  liveState = 'disconnected',
  onRefreshApiStatus,
  onOpenDiagnostics,
  currentUser,
  onOpenAuth,
  onOpenProfile,
}) => {
  // 1. Gemini API Key Input state
  const [inputKey, setInputKey] = useState('');
  // 2. Show/Hide API Key state
  const [showKey, setShowKey] = useState(false);
  // Status & action states
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isConnectingWeb, setIsConnectingWeb] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const modeConfig = PERSONALITY_MODES[currentMode];

  // 1-Click Connect Gemini Live API from Web
  const handleConnectWebLive = async () => {
    setIsConnectingWeb(true);
    setStatusMessage(null);
    try {
      const res = await connectWebLiveApiKey(inputKey.trim() ? cleanApiKey(inputKey) : undefined);
      setStatusMessage({ type: 'success', text: res.message });
      setInputKey('');
      onUpdateSettings({ geminiModel: 'gemini-3.8-live' });
      onRefreshApiStatus();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Could not connect Gemini Live API Key.',
      });
    } finally {
      setIsConnectingWeb(false);
    }
  };

  // 3 & 4. Save / Update API Key
  const handleSaveOrUpdateKey = async () => {
    const sanitizedKey = cleanApiKey(inputKey);
    if (!sanitizedKey || sanitizedKey.length < 8) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid Gemini API Key (starts with AIzaSy... or AQ...).' });
      return;
    }

    setIsSavingKey(true);
    setStatusMessage(null);

    try {
      const res = await saveUserApiKey(sanitizedKey);
      setStatusMessage({ type: 'success', text: res.message });
      setInputKey('');
      onRefreshApiStatus();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Key validation failed.' });
    } finally {
      setIsSavingKey(false);
    }
  };

  // 5. Test Connection
  const handleTestConnection = async () => {
    setIsTesting(true);
    setStatusMessage(null);

    try {
      const res = await testApiConnection(settings.geminiModel);
      setStatusMessage({
        type: 'success',
        text: `Verified! Gemini ${res.model} responded in ${res.latencyMs}ms.`,
      });
      onRefreshApiStatus();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Test failed: ${err.message || 'Could not reach Gemini API.'}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  // 8. Remove API Key
  const handleRemoveKey = async () => {
    try {
      const res = await removeUserApiKey();
      setStatusMessage({ type: 'success', text: res.message || 'Custom API Key removed.' });
      setInputKey('');
      onRefreshApiStatus();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 pb-28 space-y-6">
      {/* Header with Diagnostics shortcut */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-display flex items-center gap-2">
            <span>Settings & Gemini API Config</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Manage your Gemini API Key, model parameters, voice options, and run diagnostics.
          </p>
        </div>

        <button
          onClick={onOpenDiagnostics}
          className="px-4 py-2 rounded-xl bg-purple-900/60 hover:bg-purple-800/80 text-purple-200 border border-purple-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95 shrink-0"
        >
          <Activity className="w-4 h-4 text-cyan-400" />
          <span>System Diagnostics</span>
        </button>
      </div>

      {/* FIREBASE AUTHENTICATION & USER PROFILE SECTION */}
      <div className="rounded-2xl glass-panel-glow p-5 sm:p-6 space-y-4 border border-cyan-500/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Firebase User Account</h3>
              <p className="text-[11px] text-slate-400">Secure Authentication & Private Database Sync</p>
            </div>
          </div>

          <div>
            {currentUser ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/70 border border-emerald-500/40 text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Signed In</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/70 border border-amber-500/40 text-amber-300">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Guest / Offline</span>
              </span>
            )}
          </div>
        </div>

        {currentUser ? (
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'User'}
                    className="w-11 h-11 rounded-xl object-cover border border-purple-500/40"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 p-0.5">
                    <div className="w-full h-full bg-[#080d1a] rounded-[10px] flex items-center justify-center font-bold text-white">
                      {currentUser.displayName?.[0] || currentUser.email?.[0] || 'U'}
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {currentUser.displayName || currentUser.email?.split('@')[0]}
                  </h4>
                  <p className="text-xs text-slate-400 font-mono">{currentUser.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onOpenProfile}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 hover:text-white border border-slate-700 transition-colors"
                >
                  View Details & UID
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
              <div className="flex items-center gap-1.5 truncate">
                <Fingerprint className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate font-mono">UID: {currentUser.uid}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>Firestore Private Sync: <strong className="text-emerald-400">Active</strong></span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <span className="font-semibold text-slate-200 block">Sign in to save chat history permanently</span>
              <p className="text-slate-400 text-[11px]">
                Create a free account or continue with Google to store conversations in your private Firestore database.
              </p>
            </div>
            <button
              onClick={onOpenAuth}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 hover:brightness-110 text-white font-semibold text-xs flex items-center gap-2 shadow-md active:scale-95 shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In / Register</span>
            </button>
          </div>
        )}
      </div>

      {/* BUG 2: GEMINI API KEY MANAGEMENT SECTION */}
      <div className="rounded-2xl glass-panel-glow p-5 sm:p-6 space-y-5 border border-purple-500/30">
        {/* Section Header & 6. API Connection Status */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-950/80 border border-purple-500/40 flex items-center justify-center text-purple-300">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Google Gemini API Key</h3>
              <p className="text-[11px] text-slate-400">Secure server-side storage & verification</p>
            </div>
          </div>

          {/* 6. API Connection Status Badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Status:</span>
            {apiStatus.apiKeyConfigured ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/70 border border-emerald-500/40 text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Connected</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-950/70 border border-red-500/40 text-red-300">
                <XCircle className="w-3.5 h-3.5 text-red-400" />
                <span>Disconnected</span>
              </span>
            )}
          </div>
        </div>

        {/* Masked Key Display if configured */}
        {apiStatus.apiKeyConfigured && (
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Active Saved Key:</span>
              <span className="font-mono text-emerald-300 font-semibold">
                {apiStatus.maskedKey || 'Configured securely'}
              </span>
            </div>
            {/* 8. Remove API Key button */}
            <button
              onClick={handleRemoveKey}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 hover:underline"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove Key</span>
            </button>
          </div>
        )}

        {/* 1. Gemini API Key input field & 2. Show/Hide API Key */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-200 block">
            {apiStatus.apiKeyConfigured ? 'Update Gemini API Key' : 'Enter Your Gemini API Key'}
          </label>
          <div className="relative flex items-center">
            <input
              type={showKey ? 'text' : 'password'}
              value={inputKey}
              onChange={(e) => setInputKey(cleanApiKey(e.target.value))}
              placeholder="Paste Google AI Studio API Key (e.g. AIzaSy...)"
              className="w-full h-11 pl-4 pr-12 rounded-xl bg-slate-950/90 border border-slate-700 focus:border-purple-500 text-sm font-mono text-white placeholder-slate-500 outline-none transition-all shadow-inner"
            />
            {/* 2. Show/Hide API Key button */}
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 p-1.5 text-slate-400 hover:text-white transition-colors"
              title={showKey ? 'Hide API Key' : 'Show API Key'}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Get your free Gemini API key from{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-purple-400 hover:underline"
            >
              Google AI Studio
            </a>
            . Your key is verified on the backend and never exposed in client JavaScript.
          </p>
        </div>

        {/* Action Buttons: 1-Click Connect Live Web, Save/Update, Test Connection */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={handleConnectWebLive}
            disabled={isConnectingWeb}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-purple-600 hover:brightness-110 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-cyan-950/50 transition-all disabled:opacity-40"
          >
            <Zap className={`w-4 h-4 ${isConnectingWeb ? 'animate-spin text-yellow-300' : 'text-yellow-300'}`} />
            <span>
              {isConnectingWeb
                ? 'Connecting Gemini Live Web...'
                : 'Connect Gemini Live API (Web)'}
            </span>
          </button>

          <button
            onClick={handleSaveOrUpdateKey}
            disabled={isSavingKey || !inputKey.trim()}
            className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-purple-950/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className={`w-4 h-4 ${isSavingKey ? 'animate-spin' : ''}`} />
            <span>
              {isSavingKey
                ? 'Verifying with Google...'
                : apiStatus.apiKeyConfigured
                ? 'Update Custom Key'
                : 'Save & Verify Key'}
            </span>
          </button>

          {/* 5. Test Connection button */}
          <button
            onClick={handleTestConnection}
            disabled={isTesting || !apiStatus.apiKeyConfigured}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isTesting ? 'Testing Latency...' : 'Test Connection'}</span>
          </button>
        </div>

        {/* Status Message Toast */}
        {statusMessage && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                : 'bg-red-950/60 border-red-500/40 text-red-200'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* 7. Gemini Model Selection Dropdown */}
      <div className="rounded-2xl glass-panel p-5 space-y-3">
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span>7. Gemini Model Selection</span>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-slate-300 block">
            Select Active Model (Real verified Gemini models only)
          </label>
          <select
            value={settings.geminiModel}
            onChange={(e) => onUpdateSettings({ geminiModel: e.target.value })}
            className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-cyan-500 outline-none font-mono"
          >
            <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Recommended · ⚡ Ultra-Fast &lt;1.5s Response)</option>
            <option value="gemini-3.8-live">gemini-3.8-live (Gemini Live API · 24kHz Human Voice + Chat)</option>
            <option value="gemini-3.8-flash">gemini-3.8-flash (Preview · 20 req/day limit on Free Tier)</option>
          </select>
          <div className="flex items-start gap-1.5 text-[11px] text-cyan-300/90 pt-1">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              <strong>Ultra-Fast Response Mode:</strong> Combined with <em>Instant Voice</em>, answers arrive and speak in under 1.5 seconds with warm emotional laughter and feelings!
            </span>
          </div>
        </div>
      </div>

      {/* Gemini Live API + WebSocket Real-Time Engine Card */}
      <div className="rounded-2xl glass-panel-glow p-5 space-y-3.5 border border-emerald-500/40">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <Zap className="w-4 h-4 text-emerald-400" />
            <span>Gemini Live API + WebSocket Connection</span>
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border flex items-center gap-1.5 ${
              liveState === 'connected'
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                : liveState === 'connecting'
                ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                liveState === 'connected'
                  ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]'
                  : liveState === 'connecting'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-slate-500'
              }`}
            />
            <span className="uppercase font-mono">{liveState}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[11px] block">WebSocket Endpoint:</span>
            <span className="font-mono text-emerald-300 font-medium">/live (WSS Persistent)</span>
            <p className="text-[10px] text-slate-500">Auto-reconnects on network drops with exponential backoff.</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
            <span className="text-slate-400 text-[11px] block">Audio Stream Sample Rates:</span>
            <span className="font-mono text-cyan-300 font-medium">16kHz In · 24kHz Studio Out</span>
            <p className="text-[10px] text-slate-500">Gapless chunk scheduling prevents stutter and delays.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUpdateSettings({ useLiveWebSocket: !settings.useLiveWebSocket })}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                settings.useLiveWebSocket ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  settings.useLiveWebSocket ? 'translate-x-5' : ''
                }`}
              />
            </button>
            <span className="text-xs text-slate-300">
              {settings.useLiveWebSocket
                ? 'Enable Persistent Live WebSocket (Recommended)'
                : 'Using standard HTTP Fallback'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              liveWebSocketService.disconnect();
              setTimeout(() => {
                liveWebSocketService.connect(currentMode, settings.language);
              }, 200);
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-emerald-500/50 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            title="Force reconnect persistent WebSocket connection"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Reconnect Live WS</span>
          </button>
        </div>
      </div>

      {/* Voice & Speech Generation Settings */}
      <div className="rounded-2xl glass-panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          <Volume2 className="w-4 h-4 text-pink-400" />
          <span>Real Human Voice Settings</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-pink-500/30 text-xs space-y-1">
            <span className="font-semibold text-pink-300 block">Active Voice Profile:</span>
            <span className="text-white font-bold text-sm">{modeConfig.voiceName}</span>
            <p className="text-slate-400 text-[11px]">
              Engine: <strong className="text-emerald-300">{settings.voiceEngine === 'browser' ? 'Instant Neural Synthesis' : 'gemini-3.8-live (24kHz WAV)'}</strong>
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-2">
            <span className="font-semibold text-slate-200 block">Voice Speed Mode:</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onUpdateSettings({ voiceEngine: 'browser' })}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition-all ${
                  settings.voiceEngine === 'browser'
                    ? 'bg-cyan-600 text-white border-cyan-400 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                ⚡ Instant (&lt;0.05s)
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ voiceEngine: 'gemini' })}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition-all ${
                  settings.voiceEngine === 'gemini'
                    ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                🎙️ Studio 24kHz
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-1">
            <span className="font-semibold text-slate-300 block">Auto-Play Voice:</span>
            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-400 text-[11px]">Play audio when AI responds</span>
              <button
                onClick={() => onUpdateSettings({ autoPlayVoice: !settings.autoPlayVoice })}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  settings.autoPlayVoice ? 'bg-pink-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    settings.autoPlayVoice ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-emerald-500/30 text-xs space-y-1 sm:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-emerald-300 block">Always-On Mic (Hands-Free Conversation):</span>
                <span className="text-slate-400 text-[11px]">
                  JIYA AI बोलते समय Mic बंद रहता है (नो इको), और जवाब खत्म होते ही स्वतः Mic चालू हो जाता है।
                </span>
              </div>
              <button
                onClick={() => onUpdateSettings({ autoResumeListening: !settings.autoResumeListening })}
                className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                  settings.autoResumeListening ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    settings.autoResumeListening ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Speed slider */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-300">
            <span>Speaking Speed Cadence</span>
            <span className="font-mono text-pink-300">{settings.speechRate}x</span>
          </div>
          <input
            type="range"
            min="0.75"
            max="1.5"
            step="0.05"
            value={settings.speechRate}
            onChange={(e) => onUpdateSettings({ speechRate: parseFloat(e.target.value) })}
            className="w-full accent-pink-500 cursor-pointer"
          />
        </div>
      </div>

      {/* Edge Border Light UI Design Animation Settings */}
      <div className="rounded-2xl glass-panel p-5 space-y-4 border border-orange-500/30">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <Palette className="w-4 h-4 text-orange-400" />
            <span>Edge Border Light UI Animation</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-orange-950/80 border border-orange-500/40 text-orange-300 text-[11px] font-semibold">
            60 FPS Canvas Bokeh
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="w-16 h-24 rounded-xl overflow-hidden border border-orange-500/50 shrink-0 shadow-lg bg-black">
            <img
              src="/assets/aistudio/a85c89af5edd61d43fddda2dd5c20674_b7fc162b.jpg"
              alt="Border Light Reference"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 space-y-2 w-full">
            <p className="text-xs text-slate-300 leading-relaxed">
              Full-screen glowing neon red-orange rim with animated golden-yellow, neon-green, cyan, and sapphire-blue bokeh particles that react to JIYA AI&apos;s voice in real time.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onUpdateSettings({ borderLightMode: 'spectrum-bokeh' })}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  (settings.borderLightMode || 'spectrum-bokeh') === 'spectrum-bokeh'
                    ? 'bg-gradient-to-r from-orange-600 via-amber-500 to-emerald-500 text-slate-950 border-yellow-300 shadow-lg'
                    : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                Rainbow Bokeh
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ borderLightMode: 'persona-sync' })}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  settings.borderLightMode === 'persona-sync'
                    ? 'bg-purple-600 text-white border-purple-400 shadow-lg'
                    : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                Persona Sync
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ borderLightMode: 'off' })}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  settings.borderLightMode === 'off'
                    ? 'bg-slate-700 text-white border-slate-500'
                    : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                Turn Off
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Personality & Language */}
      <div className="rounded-2xl glass-panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          <Languages className="w-4 h-4 text-indigo-400" />
          <span>Personality & Languages</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-200 block">Personality Mode</label>
            <select
              value={currentMode}
              onChange={(e) => onSelectMode(e.target.value as PersonalityMode)}
              className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-indigo-500 outline-none"
            >
              <option value="gf">GF Mode ❤️ (Warm, female, supportive)</option>
              <option value="jarvis">Jarvis Mode 🤖 (Commanding, male, logical)</option>
              <option value="dost">Dost Mode 😎 (Buddy, friendly male, Hindi & Bhojpuri)</option>
              <option value="professional">Professional Mode 🎙️ (Executive, articulate)</option>
              <option value="funny">Funny Mode 😂 (Energetic comedian, witty)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-200 block">Language Preference</label>
            <select
              value={settings.language}
              onChange={(e) => onUpdateSettings({ language: e.target.value as any })}
              className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-indigo-500 outline-none"
            >
              <option value="auto">Auto-Detect (Matches user voice naturally)</option>
              <option value="Hindi">Hindi (हिंदी)</option>
              <option value="English">English</option>
              <option value="Hinglish">Hinglish</option>
              <option value="Bhojpuri">Bhojpuri (भोजपुरी)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Memory & History */}
      <div className="rounded-2xl glass-panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          <Sliders className="w-4 h-4 text-purple-400" />
          <span>Chat Memory & History</span>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
          <div>
            <span className="text-xs font-semibold text-white block">Multi-Turn Context Memory</span>
            <span className="text-[11px] text-slate-400 block">
              Sends previous conversation messages to Gemini for contextual understanding.
            </span>
          </div>
          <button
            onClick={() => onUpdateSettings({ chatMemory: !settings.chatMemory })}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              settings.chatMemory ? 'bg-purple-600' : 'bg-slate-700'
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                settings.chatMemory ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-slate-400">Clear all saved conversation messages:</span>
          {!showClearConfirm ? (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-3.5 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-500/40 text-xs text-red-200 transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Chat History</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onClearChatHistory();
                  setShowClearConfirm(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold"
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Creator Attribution */}
      <div className="p-4 rounded-2xl glass-panel text-center space-y-1 border border-slate-800">
        <div className="text-sm font-bold text-white tracking-wide font-display">
          JIYA AI · Personal Voice Assistant
        </div>
        <p className="text-xs text-slate-400">
          Engineered with pride by <strong className="text-purple-300 font-semibold">Sumit Kumar</strong>
        </p>
      </div>
    </div>
  );
};
