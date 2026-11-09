import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, PersonalityMode } from '../types';
import { PERSONALITY_MODES } from '../constants/modes';
import {
  Send,
  Mic,
  Copy,
  Trash2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Square,
  Check,
  User,
  RotateCw,
  AlertCircle,
} from 'lucide-react';
import { PlaybackStatus } from '../services/speechService';

interface ChatViewProps {
  messages: ChatMessage[];
  currentMode: PersonalityMode;
  isGenerating: boolean;
  onSendMessage: (text: string) => void;
  onClearChat: () => void;
  onRegenerateLast: () => void;
  onPlayMessageVoice: (msg: ChatMessage) => void;
  onPauseMessageVoice: () => void;
  onResumeMessageVoice: () => void;
  onStopMessageVoice: () => void;
  playbackStatus: PlaybackStatus;
  currentlySpeakingId: string | null;
  voiceError: string | null;
  onStartMic: () => void;
  language: string;
  onSelectLanguage: (lang: any) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  currentMode,
  isGenerating,
  onSendMessage,
  onClearChat,
  onRegenerateLast,
  onPlayMessageVoice,
  onPauseMessageVoice,
  onResumeMessageVoice,
  onStopMessageVoice,
  playbackStatus,
  currentlySpeakingId,
  voiceError,
  onStartMic,
  language,
  onSelectLanguage,
}) => {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const modeConfig = PERSONALITY_MODES[currentMode];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating, currentlySpeakingId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isGenerating) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const languages = ['auto', 'Hindi', 'English', 'Hinglish', 'Bhojpuri'];

  return (
    <div className="w-full max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col px-3 sm:px-6 py-2">
      {/* Top Bar: Languages & Clear Chat */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 gap-2 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto py-1 no-scrollbar text-xs">
          <span className="text-[11px] text-slate-400 font-medium mr-1 shrink-0">
            Language:
          </span>
          {languages.map((lang) => (
            <button
              key={lang}
              onClick={() => onSelectLanguage(lang)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                language === lang
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              {lang === 'auto' ? 'Auto-Detect' : lang}
            </button>
          ))}
        </div>

        {messages.length > 0 && (
          <button
            onClick={onClearChat}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-red-950/60 text-slate-400 hover:text-red-300 border border-slate-800 text-xs transition-colors shrink-0"
            title="Clear Chat History"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        )}
      </div>

      {/* Voice Error Notification */}
      {voiceError && (
        <div className="my-2 p-2.5 rounded-xl bg-red-950/80 border border-red-500/40 text-xs text-red-200 flex items-center gap-2 shadow-md">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="truncate">{voiceError}</span>
        </div>
      )}

      {/* Messages Scrollable Area */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-xl border border-white/10"
              style={{ backgroundColor: `${modeConfig.accentColor}25` }}
            >
              <span>{modeConfig.emoji}</span>
            </div>
            <h3 className="text-lg font-bold text-white font-display">
              Chat with JIYA ({modeConfig.name})
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md">
              Ask any question in Hindi, English, Hinglish or Bhojpuri. Every query connects directly to Gemini for fresh, context-aware intelligence!
            </p>
            <div className="flex flex-wrap gap-2 justify-center pt-2 max-w-lg">
              {modeConfig.samplePrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage(prompt)}
                  className="text-xs px-3 py-1.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
                >
                  "{prompt}"
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            const msgMode = PERSONALITY_MODES[msg.mode] || modeConfig;
            const isTargetMessage = currentlySpeakingId === msg.id;
            const isPlayingThis = isTargetMessage && playbackStatus === 'playing';
            const isPausedThis = isTargetMessage && playbackStatus === 'paused';
            const isLoadingThis = isTargetMessage && playbackStatus === 'loading';

            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 border border-white/10 shadow-md"
                    style={{ backgroundColor: `${msgMode.accentColor}25` }}
                  >
                    <span>{msgMode.emoji}</span>
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-purple-600 text-white rounded-tr-xs shadow-lg shadow-purple-950/20'
                      : 'glass-panel text-slate-100 rounded-tl-xs border border-slate-800 shadow-xl'
                  }`}
                >
                  {/* Assistant Message Header */}
                  {!isUser && (
                    <div className="flex items-center justify-between gap-3 mb-2 pb-1.5 border-b border-slate-800/60 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-200">
                          JIYA · {msgMode.name}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-900 text-purple-300 border border-slate-800">
                          {msgMode.voiceName.split(' ')[0]}
                        </span>
                        {msg.isStreaming && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 animate-pulse flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                            <span>LIVE STREAMING</span>
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[10px]">{msg.timestamp}</span>
                    </div>
                  )}

                  {/* Content with progressive streaming cursor */}
                  <div className="whitespace-pre-wrap break-words">
                    {msg.content ? (
                      <>
                        {msg.content}
                        {msg.isStreaming && (
                          <span className="inline-block w-1.5 h-4 ml-1 bg-cyan-400 animate-pulse align-middle" />
                        )}
                      </>
                    ) : msg.isStreaming ? (
                      <span className="text-slate-400 italic flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                        <span>JIYA is connecting live & formulating real-time thoughts...</span>
                      </span>
                    ) : null}
                  </div>

                  {/* Actions for Assistant Messages */}
                  {!isUser && (
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-800/60 text-xs">
                      {/* Audio Controls */}
                      <div className="flex items-center gap-1.5">
                        {/* Play / Pause button */}
                        {isLoadingThis ? (
                          <div className="flex items-center gap-1.5 text-xs text-cyan-300 px-2.5 py-1 rounded-lg bg-cyan-950/60 border border-cyan-500/40 animate-pulse">
                            <RotateCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                            <span>Generating Voice...</span>
                          </div>
                        ) : isPlayingThis ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={onPauseMessageVoice}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 text-white font-semibold text-xs shadow-sm hover:bg-purple-500"
                              title="Pause Voice"
                            >
                              <Pause className="w-3.5 h-3.5" />
                              <span>Pause</span>
                            </button>
                            <button
                              onClick={onStopMessageVoice}
                              className="p-1 rounded-lg bg-slate-800 hover:bg-red-950/70 text-slate-300 hover:text-red-300 border border-slate-700"
                              title="Stop Voice"
                            >
                              <Square className="w-3 h-3" />
                            </button>
                            {/* Animated speaking waveform */}
                            <div className="flex items-center gap-0.5 ml-1">
                              <span className="w-1 h-3 bg-cyan-400 rounded-full animate-bounce" />
                              <span className="w-1 h-4 bg-purple-400 rounded-full animate-bounce [animation-delay:0.15s]" />
                              <span className="w-1 h-2 bg-pink-400 rounded-full animate-bounce [animation-delay:0.3s]" />
                            </div>
                          </div>
                        ) : isPausedThis ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={onResumeMessageVoice}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-500"
                              title="Resume Voice"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Resume</span>
                            </button>
                            <button
                              onClick={onStopMessageVoice}
                              className="p-1 rounded-lg bg-slate-800 text-slate-300 hover:text-red-300 border border-slate-700"
                              title="Stop Voice"
                            >
                              <Square className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => onPlayMessageVoice(msg)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60 transition-colors"
                            title="Generate & Play Natural AI Voice"
                          >
                            <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Play Voice</span>
                          </button>
                        )}
                      </div>

                      {/* Copy Text button */}
                      <button
                        onClick={() => handleCopy(msg.content, msg.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-400 hover:text-white transition-colors"
                        title="Copy to Clipboard"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 shadow-md">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Loading Indicator (only shown while awaiting first streaming token) */}
        {isGenerating && !messages.some((m) => m.isStreaming) && (
          <div className="flex gap-3 justify-start">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 border border-white/10 animate-pulse"
              style={{ backgroundColor: `${modeConfig.accentColor}30` }}
            >
              <span>{modeConfig.emoji}</span>
            </div>
            <div className="glass-panel p-3.5 rounded-2xl rounded-tl-xs border border-slate-800 flex items-center gap-2 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Connecting to Gemini Live for streaming response...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box Bar */}
      <form
        onSubmit={handleSubmit}
        className="pt-2 pb-1 shrink-0 flex items-center gap-2"
      >
        <button
          type="button"
          onClick={onStartMic}
          className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500/50 text-purple-400 hover:text-white transition-all shadow-md shrink-0 active:scale-95"
          title="Speak via Microphone"
        >
          <Mic className="w-5 h-5" />
        </button>

        <div className="relative flex-1">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Ask JIYA anything in ${modeConfig.name} (English, Hindi, Bhojpuri)...`}
            disabled={isGenerating}
            className="w-full h-11 px-4 rounded-xl bg-slate-900/90 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 text-sm text-white placeholder-slate-500 outline-none transition-all shadow-inner"
          />
        </div>

        <button
          type="submit"
          disabled={!inputText.trim() || isGenerating}
          className="h-11 px-4 rounded-xl text-white font-medium text-sm flex items-center justify-center gap-1.5 transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          style={{ backgroundColor: modeConfig.accentColor }}
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
    </div>
  );
};
