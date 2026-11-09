import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PersonalityMode, VoiceStatus, ChatMessage, AppSettings, ApiStatus, LiveConnectionState } from './types';
import { PERSONALITY_MODES } from './constants/modes';
import { Header } from './components/Header';
import { BottomNav, TabId } from './components/BottomNav';
import { HomeView } from './components/HomeView';
import { ModesView } from './components/ModesView';
import { ChatView } from './components/ChatView';
import { ToolsView } from './components/ToolsView';
import { SettingsView } from './components/SettingsView';
import { DiagnosticsView } from './components/DiagnosticsView';
import { AuthModal } from './components/AuthModal';
import { UserProfileModal } from './components/UserProfileModal';
import { BorderLightFrame } from './components/BorderLightFrame';
import { CrystalPrismBackground } from './components/CrystalPrismBackground';
import { checkApiHealth, sendChatMessage, synthesizeSpeech } from './services/geminiService';
import { audioOutputManager, speechRecManager, PlaybackStatus } from './services/speechService';
import { liveWebSocketService } from './services/liveWebSocketService';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  auth,
  testConnection,
  fetchUserMessages,
  saveUserMessageToFirestore,
  clearUserMessagesFromFirestore,
} from './services/firebase';

const DEFAULT_SETTINGS: AppSettings = {
  geminiModel: 'gemini-3.8-live',
  language: 'auto',
  voiceEngine: 'gemini', // Real 24kHz human voice via Gemini Live API
  useLiveWebSocket: true, // Persistent real-time WebSocket connection to Gemini Live
  speechRate: 1.05,
  speechPitch: 1.0,
  autoResumeListening: true, // Continuous hands-free conversation active by default
  autoPlayVoice: true,
  chatMemory: true,
  themeAccent: 'violet',
  avatarViewMode: '3d-canvas',
  borderLightMode: 'spectrum-bokeh',
};

export default function App() {
  // Current Mode with localStorage persistence
  const [currentMode, setCurrentMode] = useState<PersonalityMode>(() => {
    const saved = localStorage.getItem('jiya_selected_mode');
    return (saved as PersonalityMode) || 'gf';
  });

  // Settings with localStorage persistence
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('jiya_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          geminiModel: parsed.geminiModel || 'gemini-3.8-live',
          voiceEngine: parsed.voiceEngine || 'gemini',
          useLiveWebSocket: parsed.useLiveWebSocket !== undefined ? parsed.useLiveWebSocket : true,
          borderLightMode: parsed.borderLightMode || 'spectrum-bokeh',
          autoResumeListening: parsed.autoResumeListening !== undefined ? parsed.autoResumeListening : true,
        };
      }
      return DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<TabId>('home');

  // Voice Interaction Status
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Gemini Live WebSocket State & Message Reference
  const [liveState, setLiveState] = useState<LiveConnectionState>('disconnected');
  const liveStreamingMessageIdRef = useRef<string | null>(null);

  // API Status
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    online: false,
    apiKeyConfigured: false,
    model: 'gemini-3.8-live',
  });

  // Firebase Authentication State & Modals
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // Chat Messages
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('jiya_chat_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Clean out any legacy heavy audioBase64 strings from past turns to free storage
          return parsed.map(({ audioBase64, ...rest }) => rest);
        }
      }
    } catch {}

    const initialModeConfig = PERSONALITY_MODES[currentMode] || PERSONALITY_MODES.gf;
    return [
      {
        id: 'msg_welcome',
        role: 'assistant',
        content: initialModeConfig.welcomeMessage,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: currentMode,
      },
    ];
  });

  const [isGenerating, setIsGenerating] = useState(false);

  // Monitor Firebase Auth State & Test Connection (SKILL CRITICAL REQUIREMENT)
  useEffect(() => {
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Load user's private messages from Firestore
        try {
          const userMessages = await fetchUserMessages(user.uid);
          if (userMessages && userMessages.length > 0) {
            setMessages(userMessages);
          }
        } catch (e) {
          console.warn('Could not load Firestore chat history:', e);
        }
      }
    });

    return unsubscribe;
  }, []);

  // Show authentication prompt to new users on first visit
  useEffect(() => {
    try {
      const hasVisited = localStorage.getItem('jiya_has_visited_auth');
      if (!hasVisited) {
        const timer = setTimeout(() => {
          if (!auth.currentUser) {
            setAuthModalOpen(true);
          }
          localStorage.setItem('jiya_has_visited_auth', 'true');
        }, 1200);
        return () => clearTimeout(timer);
      }
    } catch {}
  }, []);

  // Synchronized Refs to prevent stale closures and avoid re-registering listeners on state changes
  const statusRef = useRef<VoiceStatus>(status);
  statusRef.current = status;
  const isGeneratingRef = useRef<boolean>(isGenerating);
  isGeneratingRef.current = isGenerating;
  const settingsRef = useRef<AppSettings>(settings);
  settingsRef.current = settings;
  const currentUserRef = useRef<User | null>(currentUser);
  currentUserRef.current = currentUser;
  const isMutedRef = useRef<boolean>(isMuted);
  isMutedRef.current = isMuted;
  const lastActiveLiveMsgIdRef = useRef<string | null>(null);

  // Sync mute state with LiveWebSocketService
  useEffect(() => {
    liveWebSocketService.setMuted(isMuted);
  }, [isMuted]);

  // Helper to resume mic or return to idle ONLY after AI response & voice playback are 100% finished
  const finishAiTurnAndSyncMic = useCallback(() => {
    setCurrentlySpeakingId(null);
    if (speechRecManager.isMicSessionEnabled() && settingsRef.current.autoResumeListening) {
      speechRecManager.resumeAfterAI(420);
    } else {
      speechRecManager.pauseForAI('idle');
      setStatus('idle');
    }
  }, []);

  // Subscribe once to Audio Output Manager state (for fallback / manual message playback)
  useEffect(() => {
    const unsubscribe = audioOutputManager.subscribeStatus((newStatus) => {
      setPlaybackStatus(newStatus);
      if (newStatus === 'playing') {
        speechRecManager.pauseForAI('speaking');
        setStatus('speaking');
      } else if (newStatus === 'loading') {
        speechRecManager.pauseForAI('processing');
        setStatus('generating_voice');
      } else if (newStatus === 'paused') {
        setStatus('paused');
      } else if (newStatus === 'idle') {
        // Do not overwrite speaking/processing if Gemini Live WebSocket is currently streaming or speaking
        if (liveWebSocketService.isCurrentlySpeaking() || isGeneratingRef.current) {
          return;
        }
        if (
          statusRef.current === 'speaking' ||
          statusRef.current === 'generating_voice' ||
          statusRef.current === 'paused'
        ) {
          setStatus('idle');
        }
      }
    });
    return unsubscribe;
  }, []);

  // Sync mode changes with localStorage and speech recognition language
  useEffect(() => {
    try {
      localStorage.setItem('jiya_selected_mode', currentMode);
    } catch {}
    speechRecManager.setLanguage(settings.language);
  }, [currentMode, settings.language]);

  // Sync settings with localStorage
  useEffect(() => {
    try {
      localStorage.setItem('jiya_settings', JSON.stringify(settings));
    } catch {}
  }, [settings]);

  // Sync chat history with localStorage if memory is enabled (strip heavy audioBase64 to prevent QuotaExceededError)
  useEffect(() => {
    if (settings.chatMemory) {
      try {
        const lightweightMessages = messages.slice(-30).map(({ audioBase64, ...rest }) => rest);
        localStorage.setItem('jiya_chat_history', JSON.stringify(lightweightMessages));
      } catch (err: any) {
        console.warn('Quota notice saving chat history, trimming...', err);
        try {
          const minimalMessages = messages.slice(-10).map(({ audioBase64, ...rest }) => rest);
          localStorage.setItem('jiya_chat_history', JSON.stringify(minimalMessages));
        } catch {
          try {
            localStorage.removeItem('jiya_chat_history');
          } catch {}
        }
      }
    }
  }, [messages, settings.chatMemory]);

  // Initial API health check
  const refreshApiHealth = useCallback(async () => {
    const res = await checkApiHealth();
    setApiStatus({
      online: res.status === 'online',
      apiKeyConfigured: Boolean(res.apiKeyConfigured),
      maskedKey: res.maskedKey,
      model: res.defaultModel || 'gemini-3.8-flash',
      checkedAt: new Date().toLocaleTimeString(),
    });
  }, []);

  useEffect(() => {
    refreshApiHealth();
  }, [refreshApiHealth]);

  // Register Gemini Live WebSocket callbacks once and maintain persistent connection
  useEffect(() => {
    liveWebSocketService.registerCallbacks({
      onStatusChange: (newState) => {
        setLiveState(newState);
      },
      onTextChunk: (_chunk, accumulated) => {
        const msgId = liveStreamingMessageIdRef.current;
        if (!msgId) return;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === msgId ? { ...msg, content: accumulated, isStreaming: true } : msg
          )
        );
      },
      onTurnComplete: (fullText) => {
        const msgId = liveStreamingMessageIdRef.current;
        setIsGenerating(false);
        isGeneratingRef.current = false;

        if (msgId) {
          setMessages((prev) => {
            const updated = prev.map((msg) =>
              msg.id === msgId
                ? { ...msg, content: fullText || msg.content, isStreaming: false }
                : msg
            );
            const activeUser = currentUserRef.current;
            if (activeUser) {
              const target = updated.find((m) => m.id === msgId);
              if (target) {
                const { audioBase64: _, ...safeMsg } = target;
                saveUserMessageToFirestore(activeUser.uid, safeMsg).catch(() => {});
              }
            }
            return updated;
          });
          liveStreamingMessageIdRef.current = null;
        }

        // If audio is NOT currently playing (e.g. muted or text-only), finish turn now.
        // Otherwise, wait for onSpeakingStateChange(false) when all audio buffers finish playing!
        if (!liveWebSocketService.isCurrentlySpeaking()) {
          finishAiTurnAndSyncMic();
        }
      },
      onInterrupted: () => {
        setIsGenerating(false);
        isGeneratingRef.current = false;
        const msgId = liveStreamingMessageIdRef.current;
        if (msgId) {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === msgId ? { ...msg, isStreaming: false } : msg))
          );
          liveStreamingMessageIdRef.current = null;
        }
        finishAiTurnAndSyncMic();
      },
      onSpeakingStateChange: (isSpeaking) => {
        if (isSpeaking) {
          // Strictly mute mic while Jiya AI is speaking so her voice is never interrupted
          speechRecManager.pauseForAI('speaking');
          setStatus('speaking');
          const activeId = liveStreamingMessageIdRef.current || lastActiveLiveMsgIdRef.current;
          if (activeId) {
            setCurrentlySpeakingId(activeId);
          }
        } else {
          // Jiya AI has completely finished speaking her entire response
          finishAiTurnAndSyncMic();
        }
      },
      onError: (err) => {
        setVoiceError(err);
        setTimeout(() => setVoiceError(null), 5000);
      },
    });
  }, [finishAiTurnAndSyncMic]);

  // Connect or update mode on persistent Live WebSocket only when mode, language, or toggle changes
  useEffect(() => {
    if (settings.useLiveWebSocket) {
      liveWebSocketService.connect(currentMode, settings.language);
    }
  }, [currentMode, settings.language, settings.useLiveWebSocket]);

  // Update Settings handler
  const handleUpdateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  // Vocalize response using Genuine Gemini 24kHz Audio (TTS) or Instant Browser Synthesis
  const speakResponse = useCallback(
    async (text: string, mode: PersonalityMode, messageId?: string, cachedAudio?: string) => {
      if (isMutedRef.current) {
        finishAiTurnAndSyncMic();
        return;
      }

      // Strictly pause mic before and during AI speech so it NEVER records JIYA's own voice
      speechRecManager.pauseForAI('speaking');
      audioOutputManager.stopAllSpeech();
      setVoiceError(null);
      if (messageId) setCurrentlySpeakingId(messageId);

      const onFinished = () => {
        finishAiTurnAndSyncMic();
      };

      // 1. If Gemini Live audio was returned and user wants cloud audio, play it directly
      if (cachedAudio && settingsRef.current.voiceEngine !== 'browser') {
        try {
          await audioOutputManager.playBase64Wav(cachedAudio, messageId, onFinished);
          return;
        } catch (e: any) {
          console.warn('Playback of cached audio failed, switching to instant speech:', e);
        }
      }

      // 2. Instant Zero-Latency Voice Output (< 0.05s)
      const modeConfig = PERSONALITY_MODES[mode];
      const rate = modeConfig.speechRate * settingsRef.current.speechRate;
      const pitch = modeConfig.pitch * settingsRef.current.speechPitch;
      setCurrentlySpeakingId(messageId || null);
      setStatus('speaking');
      audioOutputManager.speakBrowserSynthesis(text, mode, rate, pitch, onFinished);
    },
    [finishAiTurnAndSyncMic]
  );

  // Stop speech playback (explicit user interruption)
  const handleStopSpeech = () => {
    audioOutputManager.stopAllSpeech();
    liveWebSocketService.stopPlayback();
    setCurrentlySpeakingId(null);
    if (speechRecManager.isMicSessionEnabled()) {
      speechRecManager.stop();
    }
    setStatus('idle');
  };

  const handlePauseSpeech = () => {
    audioOutputManager.pause();
  };

  const handleResumeSpeech = () => {
    audioOutputManager.resume();
  };

  // Mode Selection with automatic voice and greeting change
  const handleSelectMode = (newMode: PersonalityMode) => {
    if (newMode === currentMode) return;

    // Stop current speech immediately
    audioOutputManager.stopAllSpeech();
    liveWebSocketService.stopPlayback();
    speechRecManager.stop();

    setCurrentMode(newMode);
    const newConfig = PERSONALITY_MODES[newMode];

    // Inform persistent WebSocket of mode switch
    if (liveWebSocketService.isConnected()) {
      liveWebSocketService.switchMode(newMode, settings.language);
    }

    // Add mode switch announcement to chat
    const switchMsg: ChatMessage = {
      id: `msg_mode_${Date.now()}`,
      role: 'assistant',
      content: newConfig.welcomeMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode: newMode,
    };

    setMessages((prev) => [...prev, switchMsg]);

    // Speak mode greeting with the new persona voice if configured
    if (apiStatus.apiKeyConfigured && settings.autoPlayVoice) {
      speakResponse(newConfig.welcomeMessage, newMode, switchMsg.id);
    }
  };

  // Send message to Gemini (NO FAKE RESPONSES)
  const handleSendMessage = async (text: string, fromVoiceMic = false) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // If triggered by automatic microphone capture while Jiya AI is already processing or speaking,
    // strictly ignore it so microphone events NEVER interrupt Jiya AI's voice playback!
    if (
      fromVoiceMic &&
      (isGeneratingRef.current ||
        statusRef.current === 'speaking' ||
        statusRef.current === 'processing' ||
        liveWebSocketService.isCurrentlySpeaking() ||
        audioOutputManager.getPlaybackStatus() === 'playing')
    ) {
      return;
    }

    if (isGeneratingRef.current) return;

    // Strictly pause mic while generating and speaking response
    speechRecManager.pauseForAI('processing');
    audioOutputManager.stopAllSpeech();
    liveWebSocketService.stopPlayback();
    setVoiceError(null);

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode: currentMode,
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    // Save user message to Firestore if authenticated
    if (currentUser) {
      saveUserMessageToFirestore(currentUser.uid, userMessage).catch((e) =>
        console.warn('Could not sync user message to Firestore:', e)
      );
    }

    // If API key is not configured, give clear message pointing to Settings
    if (!apiStatus.apiKeyConfigured) {
      const promptKeyMsg: ChatMessage = {
        id: `assistant_prompt_key_${Date.now()}`,
        role: 'assistant',
        content: `Gemini API Key is not configured yet! Please open the Settings tab to enter your Google Gemini API key. Once entered, JIYA AI will connect directly via Gemini Live WebSocket for real-time voice and streaming intelligence.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: currentMode,
      };
      setMessages([...updatedMessages, promptKeyMsg]);
      setStatus('idle');
      return;
    }

    setIsGenerating(true);
    isGeneratingRef.current = true;
    setStatus('processing');

    // 1. PRIMARY ENGINE: Real-Time Persistent Gemini Live API over WebSocket with progressive text streaming & gapless 24kHz audio!
    if (settings.useLiveWebSocket && liveWebSocketService.isConnected()) {
      const liveMsgId = `assistant_live_${Date.now()}`;
      liveStreamingMessageIdRef.current = liveMsgId;
      lastActiveLiveMsgIdRef.current = liveMsgId;
      setCurrentlySpeakingId(liveMsgId);

      const placeholderAssistantMsg: ChatMessage = {
        id: liveMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: currentMode,
        isStreaming: true,
      };

      setMessages((prev) => [...prev, placeholderAssistantMsg]);
      liveWebSocketService.sendTextMessage(trimmed, currentMode);
      return;
    }

    // 2. RESILIENT FALLBACK: High-speed HTTP API with candidate model routing
    try {
      const response = await sendChatMessage(
        settings.chatMemory ? updatedMessages : [userMessage],
        currentMode,
        settings.language,
        settings.geminiModel,
        settings.voiceEngine
      );

      const assistantMsg: ChatMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: response.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: currentMode,
        audioBase64: response.audioBase64,
        audioVoiceName: response.voiceName,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setIsGenerating(false);
      isGeneratingRef.current = false;

      // Save assistant response to Firestore if authenticated (strip heavy audioBase64)
      if (currentUser) {
        const { audioBase64: _unusedAudio, ...firestoreSafeMsg } = assistantMsg;
        saveUserMessageToFirestore(currentUser.uid, firestoreSafeMsg).catch((e) =>
          console.warn('Could not sync assistant message to Firestore:', e)
        );
      }

      // Automatically play natural human voice (uses inline Gemini Live 24kHz WAV immediately if present!)
      if (settings.autoPlayVoice && !isMuted) {
        speakResponse(response.text, currentMode, assistantMsg.id, response.audioBase64);
      } else {
        finishAiTurnAndSyncMic();
      }
    } catch (error: any) {
      console.error('Send message error:', error);
      setIsGenerating(false);
      isGeneratingRef.current = false;
      setStatus('error');

      const errorMsg: ChatMessage = {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: `Gemini API Error: ${error.message || 'Failed to generate response. Please verify your API Key in Settings.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: currentMode,
      };
      setMessages((prev) => [...prev, errorMsg]);

      setTimeout(() => {
        finishAiTurnAndSyncMic();
      }, 3000);
    }
  };

  const handleSendMessageRef = useRef(handleSendMessage);
  handleSendMessageRef.current = handleSendMessage;

  // Single Unified Global Subscription for Microphone Speech Recognition & State Synchronization
  useEffect(() => {
    const unsubscribeResult = speechRecManager.subscribeResult((transcript: string, isFinal: boolean) => {
      if (isFinal && transcript.trim().length > 0) {
        handleSendMessageRef.current(transcript.trim(), true);
      }
    });

    speechRecManager.onStateChangeCallback = (isListening: boolean) => {
      if (isListening) {
        if (
          !isGeneratingRef.current &&
          !liveWebSocketService.isCurrentlySpeaking() &&
          audioOutputManager.getPlaybackStatus() !== 'playing'
        ) {
          setStatus('listening');
        }
      } else {
        if (statusRef.current === 'listening' && !speechRecManager.isMicSessionEnabled()) {
          setStatus('idle');
        }
      }
    };

    speechRecManager.onErrorCallback = (err: string) => {
      setVoiceError(err);
      if (!speechRecManager.isMicSessionEnabled()) {
        setStatus('idle');
      }
      setTimeout(() => setVoiceError(null), 5000);
    };

    return () => {
      unsubscribeResult();
    };
  }, []);

  // Trigger speech on individual message
  const handlePlayMessageVoice = (msg: ChatMessage) => {
    speakResponse(msg.content, msg.mode, msg.id, msg.audioBase64);
  };

  // Clear Chat History
  const handleClearChat = () => {
    audioOutputManager.stopAllSpeech();
    liveWebSocketService.stopPlayback();
    localStorage.removeItem('jiya_chat_history');
    if (currentUser) {
      clearUserMessagesFromFirestore(currentUser.uid).catch((e) =>
        console.warn('Could not clear Firestore messages:', e)
      );
    }
    const resetMsg: ChatMessage = {
      id: `msg_welcome_${Date.now()}`,
      role: 'assistant',
      content: PERSONALITY_MODES[currentMode].welcomeMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode: currentMode,
    };
    setMessages([resetMsg]);
  };

  // Logout reset handler
  const handleLogoutSuccess = () => {
    localStorage.removeItem('jiya_chat_history');
    const resetMsg: ChatMessage = {
      id: `msg_welcome_${Date.now()}`,
      role: 'assistant',
      content: PERSONALITY_MODES[currentMode].welcomeMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode: currentMode,
    };
    setMessages([resetMsg]);
  };

  // Regenerate last response
  const handleRegenerateLast = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      handleSendMessage(lastUserMsg.content);
    }
  };

  // Toggle Mute
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    if (nextMuted) {
      audioOutputManager.stopAllSpeech();
      liveWebSocketService.stopPlayback();
      setCurrentlySpeakingId(null);
      if (speechRecManager.isMicSessionEnabled()) {
        speechRecManager.resumeAfterAI(300);
      } else {
        setStatus('idle');
      }
    }
    setIsMuted(nextMuted);
  };

  // Last assistant message for Home view preview
  const lastAssistantMsgObj = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant');
  const lastAssistantMsg = lastAssistantMsgObj?.content || null;

  const currentModeConfig = PERSONALITY_MODES[currentMode] || PERSONALITY_MODES.gf;

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 flex flex-col relative overflow-x-hidden selection:bg-purple-500/30 selection:text-purple-200">
      {/* Full-Screen Animated Edge Border Light & Bokeh Particle Frame (Preserved) */}
      <BorderLightFrame
        status={status}
        mode={currentMode}
        borderLightMode={settings.borderLightMode || 'spectrum-bokeh'}
      />

      {/* Animated Neon Crystal Prism & Stardust Background */}
      <CrystalPrismBackground status={status} mode={currentMode} />

      {/* Ambient Mode Accent Glow */}
      <div className="fixed inset-0 pointer-events-none z-[1] overflow-hidden">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[500px] rounded-full blur-[150px] opacity-20 transition-colors duration-1000"
          style={{ backgroundColor: currentModeConfig.accentColor }}
        />
      </div>

      {/* Main Top Header */}
      <Header
        currentMode={currentMode}
        status={status}
        apiOnline={apiStatus.apiKeyConfigured}
        liveState={liveState}
        currentUser={currentUser}
        onOpenModes={() => setActiveTab('modes')}
        onOpenDiagnostics={() => setActiveTab('diagnostics')}
        onOpenAuth={() => setAuthModalOpen(true)}
        onOpenProfile={() => setProfileModalOpen(true)}
        onStopSpeech={handleStopSpeech}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
      />

      {/* Dynamic Viewport Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center">
        {activeTab === 'home' && (
          <HomeView
            currentMode={currentMode}
            status={status}
            liveState={liveState}
            viewMode={settings.avatarViewMode}
            onToggleViewMode={() =>
              handleUpdateSettings({
                avatarViewMode: settings.avatarViewMode === '3d-canvas' ? 'portrait' : '3d-canvas',
              })
            }
            autoResume={settings.autoResumeListening}
            onTranscriptCaptured={(text) => handleSendMessage(text)}
            onStatusChange={(newStatus) => setStatus(newStatus)}
            onManualStop={() => {
              speechRecManager.stop();
              audioOutputManager.stopAllSpeech();
              setStatus('idle');
            }}
            onSendTextMessage={(text) => handleSendMessage(text)}
            lastAssistantMessage={lastAssistantMsg}
            onPlayLastSpeech={() => {
              if (lastAssistantMsgObj) {
                speakResponse(
                  lastAssistantMsgObj.content,
                  currentMode,
                  lastAssistantMsgObj.id,
                  lastAssistantMsgObj.audioBase64
                );
              }
            }}
            onPauseLastSpeech={handlePauseSpeech}
            onResumeLastSpeech={handleResumeSpeech}
            onStopSpeech={handleStopSpeech}
            playbackStatus={playbackStatus}
            apiKeyConfigured={apiStatus.apiKeyConfigured}
            onNavigateToTab={(tab) => setActiveTab(tab)}
            onOpenModesModal={() => setActiveTab('modes')}
            borderLightMode={settings.borderLightMode || 'spectrum-bokeh'}
            onChangeBorderLightMode={(nextMode) =>
              handleUpdateSettings({ borderLightMode: nextMode })
            }
            voiceEngine={settings.voiceEngine}
            onToggleVoiceEngine={() =>
              handleUpdateSettings({
                voiceEngine: settings.voiceEngine === 'browser' ? 'gemini' : 'browser',
              })
            }
          />
        )}

        {activeTab === 'modes' && (
          <ModesView
            currentMode={currentMode}
            onSelectMode={handleSelectMode}
            onSendSamplePrompt={(prompt, mode) => {
              handleSelectMode(mode);
              setActiveTab('chat');
              handleSendMessage(prompt);
            }}
          />
        )}

        {activeTab === 'chat' && (
          <ChatView
            messages={messages}
            currentMode={currentMode}
            isGenerating={isGenerating}
            onSendMessage={handleSendMessage}
            onClearChat={handleClearChat}
            onRegenerateLast={handleRegenerateLast}
            onPlayMessageVoice={handlePlayMessageVoice}
            onPauseMessageVoice={handlePauseSpeech}
            onResumeMessageVoice={handleResumeSpeech}
            onStopMessageVoice={handleStopSpeech}
            playbackStatus={playbackStatus}
            currentlySpeakingId={currentlySpeakingId}
            voiceError={voiceError}
            onStartMic={() => {
              audioOutputManager.stopAllSpeech();
              setStatus('listening');
              speechRecManager.start(settings.autoResumeListening);
            }}
            language={settings.language}
            onSelectLanguage={(lang) => handleUpdateSettings({ language: lang })}
          />
        )}

        {activeTab === 'tools' && (
          <ToolsView
            currentMode={currentMode}
            onRunVoiceCommand={(cmd) => {
              setActiveTab('chat');
              handleSendMessage(cmd);
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            currentMode={currentMode}
            onSelectMode={handleSelectMode}
            onClearChatHistory={handleClearChat}
            apiStatus={apiStatus}
            liveState={liveState}
            onRefreshApiStatus={refreshApiHealth}
            onOpenDiagnostics={() => setActiveTab('diagnostics')}
            currentUser={currentUser}
            onOpenAuth={() => setAuthModalOpen(true)}
            onOpenProfile={() => setProfileModalOpen(true)}
          />
        )}

        {activeTab === 'diagnostics' && (
          <DiagnosticsView
            currentMode={currentMode}
            apiStatus={apiStatus}
            onOpenSettings={() => setActiveTab('settings')}
          />
        )}
      </main>

      {/* Fixed Ergonomic Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        currentMode={currentMode}
      />

      {/* Firebase Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => {
          setAuthModalOpen(false);
        }}
      />

      {/* User Profile & Account Settings Modal */}
      <UserProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        user={currentUser}
        onLogoutSuccess={handleLogoutSuccess}
      />
    </div>
  );
}
