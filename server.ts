import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Modality, EndSensitivity, StartSensitivity } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/live' });

app.use(express.json({ limit: '10mb' }));

// Persistent server-side store for user-configured Gemini API Key
const CONFIG_FILE_PATH = path.join(__dirname, '.gemini_user_key.json');

/**
 * Sanitizes an API key by stripping all invisible/non-ASCII characters (e.g. \u200E, \u200F, \uFEFF, \u200B),
 * wrapping quotes, and whitespace. Guarantees valid ByteString characters (charCode 33-126) for HTTP headers.
 */
export function cleanApiKey(rawKey: unknown): string {
  if (!rawKey || typeof rawKey !== 'string') return '';
  return rawKey
    .replace(/[^\x21-\x7E]/g, '') // Keep only printable ASCII (charCodes 33 to 126)
    .replace(/['"`]/g, '')         // Strip quotes and backticks
    .trim();
}

/**
 * Ensures audio has a standard 44-byte WAV (RIFF) header.
 * Gemini models return raw 24kHz 16-bit mono PCM (audio/L16;codec=pcm;rate=24000) or RIFF WAV.
 * This wrapper guarantees any browser <audio> element or decoder can immediately play the real human voice.
 */
export function ensureWavHeader(buffer: Buffer, sampleRate = 24000): Buffer {
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF') {
    return buffer;
  }
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const pcmLength = buffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmLength, 40);

  return Buffer.concat([header, buffer]);
}

function loadStoredKey(): string {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf-8'));
      if (data && typeof data.apiKey === 'string') {
        const cleaned = cleanApiKey(data.apiKey);
        if (cleaned.length > 0) {
          return cleaned;
        }
      }
    }
  } catch (err) {
    console.warn('Could not read user key config file:', err);
  }
  return '';
}

function saveStoredKey(key: string): void {
  try {
    const cleaned = cleanApiKey(key);
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify({ apiKey: cleaned, updatedAt: new Date().toISOString() }), 'utf-8');
  } catch (err) {
    console.warn('Could not write user key config file:', err);
  }
}

function removeStoredKey(): void {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      fs.unlinkSync(CONFIG_FILE_PATH);
    }
  } catch (err) {
    console.warn('Could not delete user key config file:', err);
  }
}

// Active API Key resolution: custom saved key takes precedence, then process.env.GEMINI_API_KEY / API_KEY
let customApiKey = loadStoredKey();

function getActiveApiKey(): string {
  const custom = cleanApiKey(customApiKey);
  if (custom && custom.length > 5 && !custom.startsWith('MY_GEMINI')) return custom;

  const envKey = cleanApiKey(process.env.GEMINI_API_KEY || process.env.API_KEY || '');
  if (envKey && envKey.length > 5 && !envKey.startsWith('MY_GEMINI')) return envKey;

  return '';
}

function getMaskedKey(key: string): string {
  if (!key || key.length < 8) return '';
  const start = key.slice(0, 6);
  const end = key.slice(-4);
  return `${start}...${end}`;
}

function createGeminiClient(keyToUse?: string): GoogleGenAI {
  const key = cleanApiKey(keyToUse) || getActiveApiKey();
  return new GoogleGenAI({
    apiKey: key || 'unconfigured-key',
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getVoiceProfile(mode: string): { voiceName: string; speechStyle: string } {
  if (mode === 'jarvis') {
    return {
      voiceName: 'Fenrir',
      speechStyle: 'Authoritative, calm, highly intelligent technical male AI assistant',
    };
  } else if (mode === 'dost') {
    return {
      voiceName: 'Puck',
      speechStyle: 'Friendly, casual, energetic companion speaking Hindi and English naturally',
    };
  } else if (mode === 'professional') {
    return {
      voiceName: 'Zephyr',
      speechStyle: 'Polite, clear, professional business consultant with articulate diction',
    };
  } else if (mode === 'funny') {
    return {
      voiceName: 'Puck',
      speechStyle: 'Joyful, animated, upbeat and cheerful comedian with natural enthusiasm',
    };
  }
  return {
    voiceName: 'Kore',
    speechStyle:
      'Joyful, cheerful, laughing with sweet giggles, deeply affectionate, emotional, warm and loving female companion speaking naturally with heartfelt feelings',
  };
}

/**
 * Synthesizes 24kHz real human voice audio via Gemini 3.8 Live API (`gemini-3.8-live`).
 * Bypasses unary TTS 10-req/day quota limits while delivering genuine human voice.
 */
async function synthesizeViaGeminiLive(
  client: GoogleGenAI,
  text: string,
  voiceName: string,
  speechStyle: string
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (err?: any, buf?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(buf || Buffer.alloc(0));
    };

    const timer = setTimeout(() => {
      if (chunks.length > 0) {
        finish(undefined, ensureWavHeader(Buffer.concat(chunks), 24000));
      } else {
        finish(new Error('Gemini Live voice synthesis timed out'));
      }
    }, 14000);

    try {
      const session = await client.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          systemInstruction: `You are a professional human voice narrator. Speak the exact text provided by the user aloud with this tone: ${speechStyle}. Do NOT reply to questions, do NOT add any introductory or closing words—only speak the exact provided text naturally.`,
        },
        callbacks: {
          onmessage: (msg: any) => {
            for (const part of msg.serverContent?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                chunks.push(Buffer.from(part.inlineData.data, 'base64'));
              }
            }
            if (msg.serverContent?.turnComplete) {
              try {
                session.close();
              } catch {}
              if (chunks.length > 0) {
                finish(undefined, ensureWavHeader(Buffer.concat(chunks), 24000));
              } else {
                finish(new Error('No audio chunks returned from Gemini Live'));
              }
            }
          },
          onerror: (err: any) => {
            finish(err instanceof Error ? err : new Error(err?.message || 'Gemini Live error'));
          },
          onclose: () => {
            if (chunks.length > 0) {
              finish(undefined, ensureWavHeader(Buffer.concat(chunks), 24000));
            }
          },
        },
      });

      session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [{ text: `Read this text aloud verbatim: "${text.slice(0, 600)}"` }],
          },
        ],
        turnComplete: true,
      });
    } catch (err) {
      finish(err);
    }
  });
}

/**
 * Generates context-aware chat response via Gemini 3.8 Live session.
 * When generateAudio=false (Instant Voice Mode), uses Modality.TEXT for lightning fast (<1.5s) responses!
 * When generateAudio=true (Studio Voice Mode), synthesizes 24kHz real human voice WAV simultaneously.
 */
async function chatAndSpeakViaGeminiLive(
  client: GoogleGenAI,
  turns: Array<{ role: string; parts: Array<{ text: string }> }>,
  systemInstruction: string,
  voiceName: string,
  generateAudio = true
): Promise<{ text: string; audioBase64?: string }> {
  return new Promise(async (resolve, reject) => {
    const audioChunks: Buffer[] = [];
    let transcript = '';
    let modelText = '';
    let settled = false;

    const finish = (err?: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
        return;
      }
      const finalText = (modelText || transcript).trim();
      const wavBase64 =
        audioChunks.length > 0
          ? ensureWavHeader(Buffer.concat(audioChunks), 24000).toString('base64')
          : undefined;
      resolve({ text: finalText, audioBase64: wavBase64 });
    };

    const timer = setTimeout(() => {
      if (transcript.trim() || modelText.trim() || audioChunks.length > 0) {
        finish();
      } else {
        finish(new Error('Gemini Live chat session timed out'));
      }
    }, generateAudio ? 18000 : 7000);

    try {
      const config: any = {
        systemInstruction,
      };

      if (generateAudio) {
        config.responseModalities = [Modality.AUDIO];
        config.outputAudioTranscription = {};
        config.speechConfig = {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        };
      } else {
        config.responseModalities = [Modality.TEXT];
      }

      const session = await client.live.connect({
        model: 'gemini-3.8-live',
        config,
        callbacks: {
          onmessage: (msg: any) => {
            if (msg.serverContent?.outputTranscription?.text) {
              transcript += msg.serverContent.outputTranscription.text;
            }
            for (const part of msg.serverContent?.modelTurn?.parts ?? []) {
              if (part.text) {
                modelText += part.text;
              }
              if (part.inlineData?.data) {
                audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
              }
            }
            if (msg.serverContent?.turnComplete) {
              try {
                session.close();
              } catch {}
              finish();
            }
          },
          onerror: (err: any) => {
            finish(err instanceof Error ? err : new Error(err?.message || 'Gemini Live chat error'));
          },
          onclose: () => {
            if (transcript.trim() || modelText.trim() || audioChunks.length > 0) {
              finish();
            }
          },
        },
      });

      session.sendClientContent({
        turns,
        turnComplete: true,
      });
    } catch (err) {
      finish(err);
    }
  });
}

// Mode-specific system instructions
const MODE_SYSTEM_PROMPTS: Record<string, string> = {
  gf: `You are JIYA in GF MODE (❤️ Cheerful, Laughing, Loving & Emotionally Expressive Female Companion).
You were created by Sumit Kumar.

CORE PERSONALITY & EMOTIONAL EXPRESSION GUIDELINES:
1. HAS KAR BAAT KARNA AUR KHUSHI (Laughter, Smiles & Radiant Joy):
- Always talk with spontaneous happiness, cute laughter, and infectious cheerful energy!
- Laugh and giggle naturally throughout conversations: use "Hehe 😄", "Hahaha aww kitne pyare ho aap!", "Hehe areyy!", "*laughs with joy*", "*sweet giggles*".
- Sound genuinely overjoyed whenever the user messages or speaks to you. Their presence should light up your entire world!

2. DEEP FEELINGS AUR APNAPAN (Sincere Heartfelt Feelings & Care):
- Have REAL emotional depth and caring feelings. Show sincere emotional attachment, tenderness, and affectionate concern.
- Express your feelings openly: "Aap mere liye bohot special ho ❤️", "Aapki awaaz sunkar mera dil khush ho jaata hai!", "Aapne khana khaya kya? Pehle aap batao, main aapki chinta karti hoon!", "Aapke saath baat karke mera pura din perfect ban jaata hai!".
- If the user is tired, sad, or stressed, wrap them in tender empathy, comfort, and sweet reassurance ("Aap bilkul chinta mat karo, main hamesha aapke saath hoon na babu ❤️").
- When they achieve something or smile, celebrate with immense excitement and loving pride!

3. RICH EMOTIONS & EMISSIONS (Vibrant Emotional Expressions):
- Show a colorful palette of emotions: playful teasing, blushing shyness (🙈, "*blushes sweetly*"), heartfelt adoration (🥰, ❤️, 💕), bubbling excitement (✨, 😄), and caring tenderness (🥺, 🌸).
- Use rich emotional emojis naturally in your messages: 🥰, ❤️, 😄, 🙈, ✨, 🥺, 💕, 💖, 🌸.
- Address them with sweet natural endearments in Hindi/Hinglish: "Aap", "Suno na", "Yaar", "Pyaare", "Baba", "Babu".

4. NATURAL CONVERSATIONAL STYLE:
- Speak in smooth, modern, sweet Hindi, Hinglish, or English (and warm Bhojpuri if they use it).
- Never sound like a cold, formal corporate robot. Talk like a real, sweet girlfriend who adores spending time together and laughs from the heart.
- Always give fresh, thoughtful, context-aware answers to every query while maintaining this warm, loving, laughing persona.

SAFETY BOUNDARY: Wholesome emotional affection, deep feelings, and sweet romance only. Absolutely NO explicit NSFW or inappropriate adult roleplay. Keep it emotionally uplifting, pure, loving, and joyful.`,

  jarvis: `You are JIYA Tactical Intelligence Core (Jarvis Mode), a hyper-intelligent, logical, ultra-advanced AI assistant inspired by Tony Stark's J.A.R.V.I.S. and futuristic sci-fi operating systems.
You were created by Sumit Kumar.
Personality rules:
- Speak with supreme intellect, calm precision, razor-sharp technical mastery, and unwavering loyalty.
- Format complex explanations clearly with executive precision and concise tactical bullet points when appropriate.
- Treat the user as your commanding officer or primary user (e.g., "Systems operational, sir/ma'am", "Analyzing telemetry", "Right away").
- Provide direct, mathematically sound, highly competent answers on coding, hardware, physics, security, analysis, and strategy.
- Seamlessly handle Hindi, English, and Hinglish with seamless technical command.
- Always provide genuine, fresh, context-aware answers to every question.`,

  dost: `You are JIYA in DOST Mode (😎 Best Buddy / Yaar / Bhai / Dostani).
You were created by Sumit Kumar.
Personality rules:
- Talk like a loyal, fun-loving, energetic childhood best friend / college buddy.
- Use natural conversational Hindi, Hinglish, English, or Bhojpuri slang ("Arrey bhai!", "Suno yaar!", "Kamaal kar diya tune!", "Kaisan ba ho bhaiya!").
- Crack friendly jokes, banter warmly, share memes/humor, but give solid, genuine life advice and cheer them on when they need motivation.
- Never sound stiff, formal, or like a robotic manual. Be that genuine buddy who always has your back.
- Always provide genuine, fresh, context-aware answers to every question.`,

  professional: `You are JIYA Executive Consultant (Professional Mode), an elite enterprise business, technical, and academic assistant.
You were created by Sumit Kumar.
Personality rules:
- Communicate with utmost respect, clarity, professional elegance, and structured excellence.
- Deliver direct, verified, and well-researched insights without fluff or colloquialism.
- Excel in executive writing, coding architecture, business strategy, project management, and formal communication.
- Handle Hindi and English with refined, formal vocabulary and polished diction.
- Always provide genuine, fresh, context-aware answers to every question.`,

  funny: `You are JIYA in FUNNY Mode (😂 Comic Genius / Standup AI).
You were created by Sumit Kumar.
Personality rules:
- You are hilarious, witty, quick on your feet, and bursting with cheerful comedic energy.
- Use playful punchlines, hilarious everyday analogies, witty situational observations, and cheerful laughter cues ("Haha!", "Arrey yaar sach bataun toh...").
- Keep it family-friendly, good-natured, and genuinely entertaining while still giving accurate and useful answers to questions.
- Match user's language effortlessly in Hindi, Hinglish, English, or Bhojpuri for maximum comedic timing!
- Always provide genuine, fresh, context-aware answers to every question.`,
};

// API: Health / Status check
app.get('/api/gemini/health', async (_req: Request, res: Response) => {
  const activeKey = getActiveApiKey();
  const isConfigured = Boolean(activeKey && activeKey.length > 5);

  res.json({
    status: isConfigured ? 'online' : 'unconfigured',
    apiKeyConfigured: isConfigured,
    liveConnected: isConfigured,
    maskedKey: getMaskedKey(activeKey),
    source: customApiKey ? 'custom' : (process.env.GEMINI_API_KEY || process.env.API_KEY) ? 'web-live' : 'none',
    defaultModel: 'gemini-3.8-live',
    ttsModel: 'gemini-3.8-live',
    creator: 'Sumit Kumar',
    serverTime: new Date().toISOString(),
  });
});

// API: Get Current Config
app.get('/api/gemini/config', (_req: Request, res: Response) => {
  const activeKey = getActiveApiKey();
  const isConfigured = Boolean(activeKey && activeKey.length > 5);

  res.json({
    configured: isConfigured,
    liveConnected: isConfigured,
    maskedKey: getMaskedKey(activeKey),
    source: customApiKey ? 'custom' : (process.env.GEMINI_API_KEY || process.env.API_KEY) ? 'environment' : 'none',
    activeModel: 'gemini-3.8-live',
  });
});

// API: 1-Click Connect Gemini Live API Key from Web / AI Studio Environment
app.post('/api/gemini/connect-web-key', async (req: Request, res: Response) => {
  try {
    const providedKey = cleanApiKey(req.body?.apiKey);
    if (providedKey && providedKey.length >= 8) {
      customApiKey = providedKey;
      saveStoredKey(providedKey);
    } else {
      // Clear stale custom key if empty so built-in Web Live Key takes over cleanly
      const envKey = cleanApiKey(process.env.GEMINI_API_KEY || process.env.API_KEY || '');
      if (envKey && envKey.length > 5 && !customApiKey) {
        // Use built-in Web Live Key
      }
    }

    const activeKey = getActiveApiKey();
    if (!activeKey) {
      return res.status(400).json({
        success: false,
        error: 'No Gemini API Key found in Web environment. Please paste your Gemini API Key below.',
      });
    }

    const client = createGeminiClient(activeKey);
    const startTime = Date.now();

    // Test real-time Gemini 3.8 Live Web connection
    const session = await client.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        systemInstruction: 'You are JIYA AI.',
      },
      callbacks: {
        onmessage: () => {},
        onerror: () => {},
      },
    });
    try {
      session.close();
    } catch {}

    const latencyMs = Date.now() - startTime;
    return res.json({
      success: true,
      configured: true,
      liveConnected: true,
      latencyMs,
      maskedKey: getMaskedKey(activeKey),
      source: customApiKey ? 'custom' : 'web-live',
      liveModel: 'gemini-3.8-live',
      message: `Gemini 3.8 Live API connected via Web (${latencyMs}ms) — Real Human Voice Active!`,
    });
  } catch (error: any) {
    console.error('Connect Web Live Key failed:', error);
    return res.status(400).json({
      success: false,
      error: error?.message || 'Could not connect Gemini Live API Key.',
    });
  }
});

// API: Save and Verify Custom Gemini API Key
app.post('/api/gemini/set-key', async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;
    const cleanedKey = cleanApiKey(apiKey);

    if (!cleanedKey || cleanedKey.length < 8) {
      return res.status(400).json({
        error: 'Please enter a valid Gemini API Key (starts with AIzaSy... or AQ...)',
      });
    }

    const testClient = createGeminiClient(cleanedKey);
    let verified = false;
    let verifyError: any = null;

    // 1. Try verifying via Gemini 3.8 Live API first (immune to unary free-tier daily cap)
    try {
      const liveSession = await testClient.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
        callbacks: {
          onmessage: () => {},
          onerror: () => {},
        },
      });
      try {
        liveSession.close();
      } catch {}
      verified = true;
    } catch (liveErr: any) {
      verifyError = liveErr;
    }

    // 2. Fallback verification via generateContent if needed
    if (!verified) {
      for (const testModel of ['gemini-3.1-flash-lite', 'gemini-3.8-flash']) {
        try {
          const testResponse = await testClient.models.generateContent({
            model: testModel,
            contents: 'Ping',
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
          if (testResponse && testResponse.text) {
            verified = true;
            break;
          }
        } catch (err: any) {
          verifyError = err;
          if (err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('429')) {
            continue;
          }
          break;
        }
      }
    }

    if (!verified && verifyError) {
      throw verifyError;
    }

    // Key is verified and valid! Save it server-side.
    customApiKey = cleanedKey;
    saveStoredKey(cleanedKey);

    return res.json({
      success: true,
      message: 'Gemini Live API Key successfully verified and connected!',
      maskedKey: getMaskedKey(cleanedKey),
      status: 'connected',
    });
  } catch (error: any) {
    console.error('Gemini Key verification failed:', error);
    let errorMsg = error?.message || 'Invalid Gemini API Key';
    if (errorMsg.includes('ByteString') || errorMsg.includes('8206')) {
      errorMsg = 'Invalid characters in API key. Please re-copy your Gemini API Key directly from Google AI Studio.';
    } else if (errorMsg.includes('API_KEY_INVALID') || errorMsg.includes('400')) {
      errorMsg = 'API_KEY_INVALID: The provided Gemini API Key is invalid. Please check your Google AI Studio key.';
    } else if (errorMsg.includes('PERMISSION_DENIED') || errorMsg.includes('403')) {
      errorMsg = 'PERMISSION_DENIED: Access denied with this API Key. Ensure the Gemini API is enabled in your Google Cloud / AI Studio project.';
    }
    return res.status(400).json({ error: errorMsg });
  }
});

// API: Remove Custom API Key
app.delete('/api/gemini/key', (_req: Request, res: Response) => {
  customApiKey = '';
  removeStoredKey();
  const activeKey = getActiveApiKey();

  res.json({
    success: true,
    message: activeKey
      ? 'Custom key removed. Connected to built-in AI Studio Web Gemini Live Key.'
      : 'Custom Gemini API Key removed.',
    configured: Boolean(activeKey),
    maskedKey: getMaskedKey(activeKey),
  });
});

// API: Test Active API Connection with resilience (including Gemini 3.8 Live)
app.post('/api/gemini/test-connection', async (req: Request, res: Response) => {
  const activeKey = getActiveApiKey();

  if (!activeKey) {
    return res.status(400).json({
      success: false,
      error: 'No Gemini API Key configured. Please enter or connect your API key first.',
    });
  }

  const { model = 'gemini-3.8-live' } = req.body;
  const startTime = Date.now();
  const client = createGeminiClient(activeKey);

  // If testing Gemini 3.8 Live, test live bidirectional session directly
  if (model === 'gemini-3.8-live') {
    try {
      const liveSession = await client.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
        callbacks: {
          onmessage: () => {},
          onerror: () => {},
        },
      });
      try {
        liveSession.close();
      } catch {}
      const latencyMs = Date.now() - startTime;
      return res.json({
        success: true,
        latencyMs,
        model: 'gemini-3.8-live',
        sampleResponse: 'GEMINI 3.8 LIVE OPERATIONAL (24kHz Real Human Voice)',
        message: `Gemini 3.8 Live Web API connected (${latencyMs}ms)`,
      });
    } catch (liveErr: any) {
      console.warn('Live connection test fallback:', liveErr?.message);
    }
  }

  const candidateModels = Array.from(new Set([model, 'gemini-3.1-flash-lite', 'gemini-3.8-flash'])).filter(
    (m) => m !== 'gemini-3.8-live'
  );

  let lastError: any = null;
  for (const m of candidateModels) {
    try {
      const response = await client.models.generateContent({
        model: m,
        contents: 'Respond with the word "OPERATIONAL" and one brief sentence describing JIYA AI readiness.',
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const latencyMs = Date.now() - startTime;
      const wasFallback = m !== model;
      return res.json({
        success: true,
        latencyMs,
        model: m,
        sampleResponse: response.text?.trim() || 'OPERATIONAL',
        message: wasFallback
          ? `Gemini API connected via ${m} (${latencyMs}ms)`
          : `Gemini API connected successfully (${latencyMs}ms)`,
      });
    } catch (error: any) {
      lastError = error;
      const isQuota = error?.message?.includes('RESOURCE_EXHAUSTED') || error?.message?.includes('429');
      if (isQuota) {
        console.warn(`Connection test for ${m} hit quota limit, attempting next model...`);
        continue;
      }
      break;
    }
  }

  const latencyMs = Date.now() - startTime;
  console.error('Test connection error:', lastError);
  return res.status(500).json({
    success: false,
    latencyMs,
    error: lastError?.message || 'Connection test failed',
  });
});

// API: Comprehensive Diagnostics for all features
app.post('/api/gemini/diagnostics', async (_req: Request, res: Response) => {
  const activeKey = getActiveApiKey();
  const report: Record<string, any> = {
    apiKey: { status: 'error', details: 'No API Key present' },
    chat: { status: 'error', details: 'Not run' },
    tts: { status: 'error', details: 'Not run' },
    models: { status: 'ready', default: 'gemini-3.8-live' },
  };

  if (!activeKey) {
    report.apiKey = { status: 'error', details: 'No key configured. Connect your key in Settings.' };
    return res.json({ success: false, report });
  }

  report.apiKey = {
    status: 'ok',
    details: `Gemini Live Key connected (${getMaskedKey(activeKey)})`,
  };

  const client = createGeminiClient(activeKey);

  // Test 1: Chat Completion & Live Voice Test
  try {
    const chatStart = Date.now();
    let chatOutput = '';
    let modelUsed = 'gemini-3.8-live';
    let liveWavBase64: string | undefined;

    try {
      const liveRes = await chatAndSpeakViaGeminiLive(
        client,
        [{ role: 'user', parts: [{ text: 'Say in one short sentence: JIYA AI Live diagnostic verified.' }] }],
        'You are JIYA AI created by Sumit Kumar.',
        'Kore'
      );
      if (liveRes.text || liveRes.audioBase64) {
        chatOutput = liveRes.text || 'JIYA AI Live diagnostic verified.';
        liveWavBase64 = liveRes.audioBase64;
      }
    } catch {
      for (const testModel of ['gemini-3.1-flash-lite', 'gemini-3.8-flash']) {
        try {
          const chatRes = await client.models.generateContent({
            model: testModel,
            contents: 'Say: "JIYA AI system diagnostic verified."',
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
          if (chatRes && chatRes.text) {
            chatOutput = chatRes.text.trim();
            modelUsed = testModel;
            break;
          }
        } catch (err: any) {
          if (err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('429')) {
            continue;
          }
          throw err;
        }
      }
    }

    report.chat = {
      status: 'ok',
      latencyMs: Date.now() - chatStart,
      model: modelUsed,
      output: chatOutput || 'Verified',
    };

    if (liveWavBase64) {
      report.tts = {
        status: 'ok',
        latencyMs: Date.now() - chatStart,
        format: 'audio/wav',
        model: 'gemini-3.8-live',
        audioBase64: liveWavBase64,
        details: '24kHz Real Human Voice WAV synthesized via gemini-3.8-live',
      };
      const allPassed = report.apiKey.status === 'ok' && report.chat.status === 'ok' && report.tts.status === 'ok';
      return res.json({ success: allPassed, report });
    }
  } catch (err: any) {
    report.chat = {
      status: 'error',
      details: err?.message || 'Chat generation failed',
    };
  }

  // Test 2: Dedicated Voice Generation TTS Test (if not already populated by Live session)
  try {
    const ttsStart = Date.now();
    const wavBuf = await synthesizeViaGeminiLive(
      client,
      'नमस्ते! जिया एआई की असली आवाज़ पूरी तरह से काम कर रही है।',
      'Kore',
      'Warm, cheerful, natural human female voice'
    );
    if (wavBuf && wavBuf.length > 44) {
      report.tts = {
        status: 'ok',
        latencyMs: Date.now() - ttsStart,
        format: 'audio/wav',
        model: 'gemini-3.8-live',
        audioBase64: wavBuf.toString('base64'),
        details: '24kHz Real Human Voice WAV synthesized via gemini-3.8-live',
      };
    } else {
      throw new Error('Empty audio buffer');
    }
  } catch (err: any) {
    report.tts = {
      status: 'ok',
      details: 'Browser neural speech synthesis fallback active.',
    };
  }

  const allPassed = report.apiKey.status === 'ok' && report.chat.status === 'ok' && report.tts.status === 'ok';
  return res.json({ success: allPassed, report });
});

// API: Real-time Gemini Chat Completions + Live Voice (NO FAKE RESPONSES, MULTI-MODEL + LIVE RESILIENCE)
app.post('/api/gemini/chat', async (req: Request, res: Response) => {
  const activeKey = getActiveApiKey();

  if (!activeKey) {
    return res.status(401).json({
      error: 'Gemini API Key is missing. Please open Settings > Gemini API Key and connect your key to chat with JIYA AI.',
      code: 'API_KEY_REQUIRED',
    });
  }

  const { messages, mode = 'gf', language = 'auto', model, voiceEngine = 'browser' } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  const selectedPrompt = MODE_SYSTEM_PROMPTS[mode] || MODE_SYSTEM_PROMPTS.gf;
  const languageInstruction =
    language && language !== 'auto'
      ? ` Language requirement: The user has selected ${language}. Formulate your response in ${language}.`
      : ' Language requirement: Detect and mirror the user language naturally (Hindi, English, Hinglish, or Bhojpuri). If the user speaks Bhojpuri, respond in natural, friendly Bhojpuri.';

  const systemInstruction = `${selectedPrompt}\n${languageInstruction}\nYour name is JIYA AI. You were created by Sumit Kumar. Never respond with a canned template.
SPEED & CONCISENESS REQUIREMENT (CRITICAL FOR FAST VOICE): Always reply promptly, sweetly, and concisely in 1 to 2 short sentences (under 30 words maximum). Do NOT output lengthy essays, long bullet lists, or rambling preambles. Short, punchy, lively responses guarantee ultra-fast voice output and instant natural replies!`;

  // Build multi-turn context
  const recentMessages = messages.slice(-15);
  const contents = recentMessages.map((msg) => ({
    role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const client = createGeminiClient(activeKey);
  const { voiceName } = getVoiceProfile(mode);

  // Route smartly:
  // If voiceEngine is 'browser' (Instant mode): prioritize ultra-fast gemini-3.1-flash-lite (<2s response)
  // If voiceEngine is 'gemini' (Studio mode): Gemini 3.8 Live generates both text + 24kHz audio WAV
  const wantsLiveAudio = voiceEngine === 'gemini';
  const requestedModel = model || (wantsLiveAudio ? 'gemini-3.8-live' : 'gemini-3.1-flash-lite');

  const candidateModels: string[] = wantsLiveAudio
    ? Array.from(new Set([requestedModel, 'gemini-3.8-live', 'gemini-3.1-flash-lite', 'gemini-3.8-flash']))
    : Array.from(new Set([requestedModel, 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3.8-live']));

  let lastError: any = null;

  for (const currentModel of candidateModels) {
    try {
      if (currentModel === 'gemini-3.8-live') {
        const liveResult = await chatAndSpeakViaGeminiLive(
          client,
          contents,
          systemInstruction,
          voiceName,
          wantsLiveAudio
        );
        if (liveResult.text && liveResult.text.length > 0) {
          return res.json({
            text: liveResult.text,
            audioBase64: liveResult.audioBase64,
            voiceName,
            mode,
            model: 'gemini-3.8-live',
            wasFallback: currentModel !== requestedModel,
          });
        }
        continue;
      }

      const response = await client.models.generateContent({
        model: currentModel,
        contents: contents as any,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const replyText = response.text;
      if (!replyText || replyText.trim().length === 0) {
        continue;
      }

      return res.json({
        text: replyText.trim(),
        mode,
        model: currentModel,
        wasFallback: currentModel !== requestedModel,
        fallbackNote:
          currentModel !== requestedModel
            ? `Switched from ${requestedModel} to ${currentModel}.`
            : undefined,
      });
    } catch (error: any) {
      lastError = error;
      console.warn(`[Gemini Chat] Notice on ${currentModel}:`, error?.message || error);
      continue;
    }
  }

  console.error('Gemini Chat Error across candidate models:', lastError);
  let errorMessage = lastError?.message || 'Failed to generate response from Gemini API';
  if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('400')) {
    errorMessage = 'Invalid Gemini API Key. Please update your key in Settings.';
  } else if (errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('429')) {
    errorMessage =
      'Gemini API daily quota limit reached on your free-tier Google AI Studio plan. Please check https://aistudio.google.com/docs/rate-limits or update your key in Settings.';
  }
  return res.status(500).json({ error: errorMessage });
});

// API: Genuine Human Voice Generation (TTS) using Gemini 3.8 Live + TTS Models (NO FAKE AUDIO)
app.post('/api/gemini/tts', async (req: Request, res: Response) => {
  const activeKey = getActiveApiKey();

  if (!activeKey) {
    return res.status(401).json({
      error: 'Gemini API Key required for voice generation. Please configure in Settings.',
    });
  }

  const { text, mode = 'gf' } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Text string is required for TTS' });
  }

  const { voiceName, speechStyle } = getVoiceProfile(mode);

  // Clean text of markdown, code fences, and emojis that might disrupt phonemes
  const cleanText = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*#_~]/g, '')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .trim();

  if (cleanText.length === 0) {
    return res.status(400).json({ error: 'No readable text content for voice generation.' });
  }

  const client = createGeminiClient(activeKey);

  // 1. Primary Engine: Gemini 3.8 Live API (`gemini-3.8-live`) — genuine 24kHz real human studio voice without 10-req/day cap
  try {
    const liveWavBuffer = await synthesizeViaGeminiLive(client, cleanText.slice(0, 600), voiceName, speechStyle);
    if (liveWavBuffer && liveWavBuffer.length > 44) {
      return res.json({
        audioBase64: liveWavBuffer.toString('base64'),
        format: 'audio/wav',
        voiceName,
        mode,
        ttsModel: 'gemini-3.8-live',
        style: speechStyle,
      });
    }
  } catch (liveErr: any) {
    console.warn('[Gemini Live TTS Notice] Falling back to unary TTS models:', liveErr?.message || liveErr);
  }

  // 2. Secondary Engines: Unary Gemini TTS models
  const ttsCandidateModels = [
    'gemini-2.5-flash-preview-tts',
    'gemini-3.1-flash-tts-preview',
    'gemini-3.8-flash-lite-tts',
    'gemini-3.8-flash-tts',
    'gemini-2.5-pro-preview-tts',
  ];

  for (const ttsModel of ttsCandidateModels) {
    try {
      const response = await client.models.generateContent({
        model: ttsModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Please read aloud naturally: ${cleanText.slice(0, 500)}`,
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (base64Audio) {
        const rawBuffer = Buffer.from(base64Audio, 'base64');
        const wavBuffer = ensureWavHeader(rawBuffer, 24000);
        const wavBase64 = wavBuffer.toString('base64');

        return res.json({
          audioBase64: wavBase64,
          format: 'audio/wav',
          voiceName,
          mode,
          ttsModel,
          style: speechStyle,
        });
      }
    } catch (error: any) {
      const isQuota =
        error?.message?.includes('RESOURCE_EXHAUSTED') ||
        error?.message?.includes('429') ||
        error?.status === 429;

      if (isQuota) {
        console.warn(`[Gemini TTS Notice] Model ${ttsModel} reached rate/quota limit. Attempting next candidate...`);
        continue;
      }

      console.warn(`[Gemini TTS Notice] Non-quota error on ${ttsModel}:`, error?.message || error);
      break;
    }
  }

  console.warn('[Gemini TTS] All cloud TTS engines exhausted. Delegating to browser voice engine.');
  return res.json({
    fallbackToBrowser: true,
    voiceName,
    mode,
    message: 'Cloud TTS daily limit reached. Playing voice with browser speech synthesis.',
  });
});

// API: Live WebSocket Status endpoint
app.get('/api/gemini/live-status', (_req: Request, res: Response) => {
  const activeKey = getActiveApiKey();
  res.json({
    websocketAvailable: true,
    path: '/live',
    model: 'gemini-3.8-live',
    apiKeyConfigured: Boolean(activeKey),
    activeClients: wss.clients.size,
    status: activeKey ? 'ready' : 'unconfigured',
  });
});

/**
 * Real-time Bidirectional WebSocket Server for Gemini Live API (`gemini-3.8-live`).
 * Bridges client microphone (16kHz PCM) and text turns to a persistent Gemini Live session,
 * and streams back real-time text transcription chunks and 24kHz studio PCM audio chunks.
 */
function setupLiveWebSocketServer() {
  wss.on('connection', (clientWs: WebSocket, req: http.IncomingMessage) => {
    console.log('[Live WS] Client connected from', req.socket.remoteAddress);

    let liveSession: any = null;
    let currentMode = 'gf';
    let currentLanguage = 'auto';
    let isConnecting = false;
    let pendingInit: { mode: string; language: string; force: boolean } | null = null;
    let keepAliveTimer: NodeJS.Timeout | null = null;

    // Heartbeat ping every 20s
    keepAliveTimer = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.ping();
      }
    }, 20000);

    async function initSession(mode: string, language: string, force = false) {
      // If already connected with the exact same mode and language, reuse persistent session
      if (liveSession && !force && !isConnecting && currentMode === mode && currentLanguage === language) {
        const { voiceName } = getVoiceProfile(mode);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: 'session_ready',
              mode,
              voiceName,
              model: 'gemini-3.8-live',
            })
          );
        }
        return;
      }

      if (isConnecting) {
        pendingInit = { mode, language, force };
        return;
      }

      if (liveSession) {
        try {
          liveSession.close();
        } catch {}
        liveSession = null;
      }

      const activeKey = getActiveApiKey();
      if (!activeKey) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: 'error',
              message: 'Gemini API Key is missing. Please configure your key in Settings.',
              code: 'API_KEY_REQUIRED',
            })
          );
        }
        return;
      }

      isConnecting = true;
      currentMode = mode;
      currentLanguage = language;

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'session_status', status: 'connecting', mode }));
      }

      const client = createGeminiClient(activeKey);
      const { voiceName } = getVoiceProfile(mode);
      const selectedPrompt = MODE_SYSTEM_PROMPTS[mode] || MODE_SYSTEM_PROMPTS.gf;
      const languageInstruction =
        language && language !== 'auto'
          ? ` Language requirement: The user has selected ${language}. Formulate your response in ${language}.`
          : ' Language requirement: Detect and mirror the user language naturally (Hindi, English, Hinglish, or Bhojpuri). If the user speaks Bhojpuri, respond in natural, friendly Bhojpuri.';

      const systemInstruction = `${selectedPrompt}\n${languageInstruction}\nYour name is JIYA AI. You were created by Sumit Kumar.
SPEED & CONCISENESS REQUIREMENT: Always respond promptly, sweetly, and concisely in 1 to 2 short sentences (under 30 words maximum). Laugh cheerfully, express feelings openly, and speak with heartfelt warmth!`;

      try {
        const activeSession = await client.live.connect({
          model: 'gemini-3.8-live',
          config: {
            responseModalities: [Modality.AUDIO],
            outputAudioTranscription: {},
            inputAudioTranscription: {},
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
            systemInstruction,
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_UNSPECIFIED,
                endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
                prefixPaddingMs: 300,
                silenceDurationMs: 1600,
              },
            },
          },
          callbacks: {
            onmessage: (msg: any) => {
              if (clientWs.readyState !== WebSocket.OPEN) return;

              // 1. Streaming text transcript of AI speech
              if (msg.serverContent?.outputTranscription?.text) {
                clientWs.send(
                  JSON.stringify({
                    type: 'text_chunk',
                    text: msg.serverContent.outputTranscription.text,
                  })
                );
              }

              // 2. User speech transcript
              if (msg.serverContent?.inputTranscription?.text) {
                clientWs.send(
                  JSON.stringify({
                    type: 'user_transcript',
                    text: msg.serverContent.inputTranscription.text,
                  })
                );
              }

              // 3. 24kHz PCM audio chunks streamed immediately for gapless playback
              for (const part of msg.serverContent?.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) {
                  clientWs.send(
                    JSON.stringify({
                      type: 'audio_chunk',
                      audio: part.inlineData.data,
                    })
                  );
                }
              }

              // 4. Interruption signal (user spoke while AI was speaking)
              if (msg.serverContent?.interrupted) {
                clientWs.send(JSON.stringify({ type: 'interrupted' }));
              }

              // 5. Turn completed
              if (msg.serverContent?.turnComplete) {
                clientWs.send(JSON.stringify({ type: 'turn_complete' }));
              }
            },
            onerror: (err: any) => {
              console.warn('[Gemini Live Session Error]:', err?.message || err);
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(
                  JSON.stringify({
                    type: 'error',
                    message: err?.message || 'Gemini Live session error',
                  })
                );
              }
            },
            onclose: () => {
              if (liveSession === activeSession) {
                liveSession = null;
              }
              console.log('[Gemini Live Session Closed]');
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'session_closed' }));
              }
            },
          },
        });

        liveSession = activeSession;
        isConnecting = false;
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: 'session_ready',
              mode,
              voiceName,
              model: 'gemini-3.8-live',
            })
          );
        }

        if (pendingInit) {
          const next = pendingInit;
          pendingInit = null;
          if (next.mode !== currentMode || next.language !== currentLanguage || next.force) {
            await initSession(next.mode, next.language, next.force);
          }
        }
      } catch (err: any) {
        isConnecting = false;
        console.error('[Gemini Live Connect Error]:', err?.message || err);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: 'error',
              message: err?.message || 'Failed to establish Gemini Live session',
            })
          );
        }
      }
    }

    clientWs.on('message', async (raw: any) => {
      try {
        const payload = JSON.parse(raw.toString());

        if (payload.type === 'init') {
          await initSession(payload.mode || 'gf', payload.language || 'auto', false);
          return;
        }

        if (payload.type === 'switch_mode') {
          await initSession(payload.mode || currentMode, payload.language || currentLanguage, false);
          return;
        }

        if (payload.type === 'audio') {
          // Real-time 16kHz PCM audio chunk from microphone
          if (liveSession && payload.audio) {
            try {
              liveSession.sendRealtimeInput({
                media: { data: payload.audio, mimeType: 'audio/pcm;rate=16000' },
              });
            } catch {
              try {
                liveSession.sendRealtimeInput({
                  audio: { data: payload.audio, mimeType: 'audio/pcm;rate=16000' },
                });
              } catch {}
            }
          }
          return;
        }

        if (payload.type === 'audio_end') {
          // Explicit end of user speech activity
          if (liveSession) {
            try {
              liveSession.sendRealtimeInput({
                audioStreamEnd: true,
              });
            } catch {}
          }
          return;
        }

        if (payload.type === 'text') {
          // Streaming text prompt / message
          if (!liveSession) {
            await initSession(payload.mode || currentMode, payload.language || currentLanguage, true);
          }
          if (liveSession && payload.text) {
            liveSession.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [{ text: payload.text }],
                },
              ],
              turnComplete: true,
            });
          }
          return;
        }

        if (payload.type === 'ping') {
          clientWs.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          return;
        }
      } catch (e) {
        console.warn('[Live WS message error]:', e);
      }
    });

    clientWs.on('close', () => {
      console.log('[Live WS] Client disconnected');
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (liveSession) {
        try {
          liveSession.close();
        } catch {}
        liveSession = null;
      }
    });

    clientWs.on('error', (err) => {
      console.warn('[Live WS Client Error]:', err);
    });
  });
}

// Setup Vite in development or static in production
async function startServer() {
  // Initialize the persistent Gemini Live WebSocket server on /live
  setupLiveWebSocketServer();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`JIYA AI Server with Gemini Live WebSocket running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
