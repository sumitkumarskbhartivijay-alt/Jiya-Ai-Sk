export type PersonalityMode = 'gf' | 'jarvis' | 'dost' | 'professional' | 'funny';

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'generating_voice' | 'speaking' | 'paused' | 'error';

export interface ModeConfig {
  id: PersonalityMode;
  name: string;
  tagline: string;
  emoji: string;
  description: string;
  voiceGender: 'female' | 'male';
  voiceName: string;
  ttsVoice: 'Kore' | 'Fenrir' | 'Puck' | 'Zephyr';
  accentColor: string;
  glowColor: string;
  borderGlow: string;
  speechRate: number;
  pitch: number;
  welcomeMessage: string;
  samplePrompts: string[];
}

export type LiveConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  mode: PersonalityMode;
  audioBase64?: string;
  audioVoiceName?: string;
  isAudioLoading?: boolean;
  isStreaming?: boolean;
}

export interface AppSettings {
  geminiModel: string;
  language: 'auto' | 'Hindi' | 'English' | 'Hinglish' | 'Bhojpuri';
  voiceEngine: 'gemini' | 'browser';
  useLiveWebSocket: boolean;
  speechRate: number;
  speechPitch: number;
  autoResumeListening: boolean;
  autoPlayVoice: boolean;
  chatMemory: boolean;
  themeAccent: 'violet' | 'cyan' | 'pink' | 'emerald';
  avatarViewMode: '3d-canvas' | 'portrait';
  borderLightMode?: 'spectrum-bokeh' | 'persona-sync' | 'off';
}

export interface ApiConfig {
  configured: boolean;
  maskedKey: string;
  source: string;
  activeModel: string;
  status: 'connected' | 'disconnected' | 'invalid';
}

export interface ApiStatus {
  online: boolean;
  apiKeyConfigured: boolean;
  maskedKey?: string;
  model: string;
  checkedAt?: string;
}

export interface DiagnosticReport {
  apiKey: { status: 'ok' | 'error'; details: string };
  chat: { status: 'ok' | 'error'; latencyMs?: number; output?: string; details?: string };
  tts: { status: 'ok' | 'error'; latencyMs?: number; format?: string; audioBase64?: string; details?: string };
  audioPlayback: { status: 'ok' | 'error' | 'idle'; details?: string };
  selectedMode: { status: 'ok'; details: string };
}
