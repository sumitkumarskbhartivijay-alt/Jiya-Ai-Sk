import { ChatMessage, PersonalityMode, ApiConfig, DiagnosticReport } from '../types';

export interface ChatResponse {
  text: string;
  mode: PersonalityMode;
  model: string;
  audioBase64?: string;
  voiceName?: string;
}

export interface TTSResponse {
  audioBase64?: string;
  fallbackToBrowser?: boolean;
  format?: string;
  voiceName: string;
  mode: PersonalityMode;
  style?: string;
  ttsModel?: string;
  message?: string;
}

export async function checkApiHealth() {
  try {
    const res = await fetch('/api/gemini/health');
    if (!res.ok) throw new Error(`Health check returned status ${res.status}`);
    return await res.json();
  } catch (error) {
    console.warn('API Health Check warning:', error);
    return { status: 'offline', apiKeyConfigured: false, defaultModel: 'gemini-3.8-live' };
  }
}

export async function fetchApiConfig(): Promise<ApiConfig> {
  const res = await fetch('/api/gemini/config');
  if (!res.ok) {
    throw new Error('Failed to fetch API configuration');
  }
  return await res.json();
}

/**
 * Strips non-printable ASCII / Unicode marks (e.g., \u200E, zero-width chars) and quotes.
 */
export function cleanApiKey(rawKey: unknown): string {
  if (!rawKey || typeof rawKey !== 'string') return '';
  return rawKey
    .replace(/[^\x21-\x7E]/g, '')
    .replace(/['"`]/g, '')
    .trim();
}

export async function connectWebLiveApiKey(apiKey?: string): Promise<{
  success: boolean;
  configured: boolean;
  liveConnected: boolean;
  latencyMs: number;
  maskedKey: string;
  source: string;
  liveModel: string;
  message: string;
}> {
  const cleaned = apiKey ? cleanApiKey(apiKey) : undefined;
  const res = await fetch('/api/gemini/connect-web-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: cleaned }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to connect Gemini Live API Key');
  }
  return data;
}

export async function saveUserApiKey(apiKey: string): Promise<{ success: boolean; maskedKey: string; message: string }> {
  const cleaned = cleanApiKey(apiKey);
  const res = await fetch('/api/gemini/set-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: cleaned }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to save and verify Gemini API Key');
  }
  return data;
}

export async function removeUserApiKey(): Promise<{ success: boolean; message: string; configured: boolean; maskedKey: string }> {
  const res = await fetch('/api/gemini/key', {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Failed to remove API key');
  }
  return await res.json();
}

export async function testApiConnection(model = 'gemini-3.8-live'): Promise<{ success: boolean; latencyMs: number; model: string; sampleResponse?: string; message: string }> {
  const res = await fetch('/api/gemini/test-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Connection test failed');
  }
  return data;
}

export async function runDiagnostics(): Promise<{ success: boolean; report: DiagnosticReport }> {
  const res = await fetch('/api/gemini/diagnostics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Diagnostics run failed');
  }
  return data;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  mode: PersonalityMode,
  language: string,
  model = 'gemini-3.1-flash-lite',
  voiceEngine = 'browser'
): Promise<ChatResponse & { wasFallback?: boolean; fallbackNote?: string }> {
  const formattedMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const res = await fetch('/api/gemini/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: formattedMessages,
      mode,
      language,
      model,
      voiceEngine,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Server responded with ${res.status}`);
  }

  return data;
}

export async function synthesizeSpeech(
  text: string,
  mode: PersonalityMode
): Promise<TTSResponse> {
  const res = await fetch('/api/gemini/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, mode }),
  });

  const data = await res.json();
  if (!res.ok) {
    // If server returned 500 or rate limit, return a graceful fallbackToBrowser instead of throwing
    return {
      fallbackToBrowser: true,
      voiceName: 'Kore',
      mode,
      message: data?.error || 'Rate limit reached, switching to browser speech synthesis',
    };
  }

  return data;
}
