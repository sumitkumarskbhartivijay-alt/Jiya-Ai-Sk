import { PersonalityMode, VoiceStatus } from '../types';

export type LiveConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface LiveWebSocketCallbacks {
  onStatusChange?: (state: LiveConnectionState) => void;
  onTextChunk?: (chunk: string, accumulated: string) => void;
  onUserTranscript?: (transcript: string) => void;
  onTurnComplete?: (fullText: string) => void;
  onInterrupted?: () => void;
  onSpeakingStateChange?: (isSpeaking: boolean) => void;
  onError?: (error: string) => void;
}

/**
 * Converts a base64 encoded raw 16-bit signed PCM little-endian buffer into Float32Array (-1.0 to 1.0).
 */
function base64PcmToFloat32(base64: string): Float32Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }
  return float32Array;
}

/**
 * Converts a Float32Array to base64 encoded 16-bit signed PCM little-endian buffer.
 */
function float32ToBase64Pcm(input: Float32Array): string {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(i * 2, val, true); // true = little-endian
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 4096;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

class LiveWebSocketService {
  private ws: WebSocket | null = null;
  private state: LiveConnectionState = 'disconnected';
  private callbacks: LiveWebSocketCallbacks = {};

  // Audio Playback (24kHz Web Audio)
  private outputAudioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private nextPlayTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private isSpeaking = false;
  private isTurnComplete = false;
  private hasReceivedAudioThisTurn = false;
  private isMuted = false;
  private playbackFinishTimer: any = null;
  private watchdogTimer: any = null;

  // Microphone Streaming (16kHz Web Audio)
  private micStream: MediaStream | null = null;
  private inputAudioContext: AudioContext | null = null;
  private micProcessor: ScriptProcessorNode | null = null;
  private isMicStreaming = false;
  private pauseMicDuringAiSpeech = true;

  // Conversation Context
  private currentMode: PersonalityMode = 'gf';
  private currentLanguage = 'auto';
  private initializedMode: PersonalityMode | null = null;
  private initializedLanguage: string | null = null;
  private accumulatedText = '';
  private reconnectTimer: any = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 6;
  private heartbeatTimer: any = null;
  private shouldStayConnected = true;

  constructor() {
    // Lazy initialization of audio context on first user interaction
  }

  public registerCallbacks(callbacks: LiveWebSocketCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopPlayback();
    }
  }

  public isCurrentlySpeaking(): boolean {
    return this.isSpeaking || this.activeSources.length > 0;
  }

  private setState(newState: LiveConnectionState) {
    if (this.state !== newState) {
      this.state = newState;
      this.callbacks.onStatusChange?.(newState);
    }
  }

  public getState(): LiveConnectionState {
    return this.state;
  }

  public isConnected(): boolean {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Initializes the Web Audio output graph at 24kHz for gapless PCM streaming.
   */
  private initOutputAudio() {
    if (!this.outputAudioContext) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.outputAudioContext = new AudioCtx({ sampleRate: 24000 });
        this.analyser = this.outputAudioContext.createAnalyser();
        this.analyser.fftSize = 64;
        this.analyser.connect(this.outputAudioContext.destination);
      }
    }
    if (this.outputAudioContext && this.outputAudioContext.state === 'suspended') {
      this.outputAudioContext.resume().catch(() => {});
    }
  }

  /**
   * Connects to the persistent Gemini Live WebSocket endpoint (/live).
   */
  public connect(initialMode: PersonalityMode = 'gf', language = 'auto') {
    const modeChanged = this.currentMode !== initialMode || this.currentLanguage !== language;
    this.currentMode = initialMode;
    this.currentLanguage = language;
    this.shouldStayConnected = true;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (
        this.ws.readyState === WebSocket.OPEN &&
        modeChanged &&
        (this.initializedMode !== initialMode || this.initializedLanguage !== language)
      ) {
        this.switchMode(initialMode, language);
      }
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.setState('connecting');

    try {
      const isHttps = window.location.protocol === 'https:';
      const wsProtocol = isHttps ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/live`;

      console.log('[Live WebSocket] Connecting to', wsUrl);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[Live WebSocket] Connection opened. Initializing session for mode:', this.currentMode);
        this.setState('connected');
        this.reconnectAttempts = 0;
        this.initializedMode = this.currentMode;
        this.initializedLanguage = this.currentLanguage;

        // Send init message once on open
        this.send({
          type: 'init',
          mode: this.currentMode,
          language: this.currentLanguage,
        });

        // Start ping heartbeat
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } catch (e) {
          console.warn('[Live WebSocket] Error parsing message:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[Live WebSocket] Connection error:', err);
        this.setState('error');
        this.callbacks.onError?.('Gemini Live WebSocket connection interrupted.');
      };

      this.ws.onclose = () => {
        console.log('[Live WebSocket] Connection closed.');
        this.stopHeartbeat();
        this.initializedMode = null;
        this.initializedLanguage = null;
        this.setState('disconnected');

        if (this.shouldStayConnected) {
          this.scheduleReconnect();
        }
      };
    } catch (err: any) {
      console.error('[Live WebSocket] Setup error:', err);
      this.setState('error');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.shouldStayConnected) return;

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.8, this.reconnectAttempts - 1), 10000);
    console.log(`[Live WebSocket] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})...`);

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldStayConnected) {
        this.connect(this.currentMode, this.currentLanguage);
      }
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping' });
      }
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Safely sends a JSON payload to the server over WebSocket.
   */
  private send(payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  /**
   * Handles incoming WebSocket messages from the Gemini Live server bridge.
   */
  private handleServerMessage(msg: any) {
    switch (msg.type) {
      case 'session_ready':
        console.log('[Live WebSocket] Gemini Live session ready:', msg.mode, msg.model);
        this.initializedMode = msg.mode || this.currentMode;
        this.setState('connected');
        break;

      case 'text_chunk':
        if (msg.text) {
          this.accumulatedText += msg.text;
          this.callbacks.onTextChunk?.(msg.text, this.accumulatedText);
        }
        break;

      case 'user_transcript':
        if (msg.text) {
          this.callbacks.onUserTranscript?.(msg.text);
        }
        break;

      case 'audio_chunk':
        if (msg.audio && !this.isMuted) {
          this.enqueueAudioChunk(msg.audio);
        }
        break;

      case 'interrupted':
        // Only honor server interruption if raw PCM microphone streaming is actively running.
        // Prevents spurious server interrupted flags from cutting off Jiya AI's voice playback.
        if (this.isMicStreaming) {
          console.log('[Live WebSocket] AI speech interrupted by active mic stream');
          this.stopPlayback();
          this.callbacks.onInterrupted?.();
        }
        break;

      case 'turn_complete':
        console.log('[Live WebSocket] Turn complete. Final text length:', this.accumulatedText.length);
        this.isTurnComplete = true;
        const finishedText = this.accumulatedText;
        this.accumulatedText = '';
        this.callbacks.onTurnComplete?.(finishedText);
        this.evaluatePlaybackCompletion();
        break;

      case 'error':
        console.warn('[Live WebSocket] Server error:', msg.message);
        this.isTurnComplete = true;
        this.evaluatePlaybackCompletion();
        this.callbacks.onError?.(msg.message || 'Gemini Live error occurred.');
        break;

      case 'pong':
        // Heartbeat acknowledged
        break;

      default:
        break;
    }
  }

  /**
   * Checks whether BOTH the server turn is complete AND all queued Web Audio buffers
   * have finished playing before transitioning `isSpeaking` to false.
   * This guarantees Jiya AI is NEVER interrupted between audio chunks!
   */
  private evaluatePlaybackCompletion() {
    clearTimeout(this.playbackFinishTimer);

    if (!this.isSpeaking) {
      return;
    }

    // Do NOT stop speaking while server is still streaming chunks for the current turn
    if (!this.isTurnComplete) {
      return;
    }

    // If all scheduled sources have ended, wait a brief 220ms acoustic settle tail then finish
    if (this.activeSources.length === 0) {
      const currentTime = this.outputAudioContext?.currentTime || 0;
      const remainingPlayMs = Math.max(0, (this.nextPlayTime - currentTime) * 1000);
      const settleDelayMs = Math.max(180, remainingPlayMs + 180);

      this.playbackFinishTimer = setTimeout(() => {
        if (this.isTurnComplete && this.activeSources.length === 0 && this.isSpeaking) {
          clearTimeout(this.watchdogTimer);
          this.isSpeaking = false;
          this.nextPlayTime = 0;
          this.callbacks.onSpeakingStateChange?.(false);
        }
      }, settleDelayMs);
    }
  }

  /**
   * Schedules a raw 24kHz PCM chunk for gapless, zero-latency audio playback.
   */
  private enqueueAudioChunk(base64Pcm: string) {
    try {
      this.initOutputAudio();
      if (!this.outputAudioContext || !this.analyser) return;

      const float32 = base64PcmToFloat32(base64Pcm);
      if (float32.length === 0) return;

      this.hasReceivedAudioThisTurn = true;

      const audioBuffer = this.outputAudioContext.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.analyser);

      const currentTime = this.outputAudioContext.currentTime;
      // Add 45ms jitter-buffer lead when starting from cold/empty queue so subsequent network chunks stitch gaplessly
      const startTime =
        this.nextPlayTime > currentTime ? this.nextPlayTime : currentTime + 0.045;
      source.start(startTime);

      this.nextPlayTime = startTime + audioBuffer.duration;
      this.activeSources.push(source);

      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.callbacks.onSpeakingStateChange?.(true);
      }

      // Cancel any pending finish timer since new audio is now playing
      clearTimeout(this.playbackFinishTimer);

      // Safety watchdog (15s after last chunk ends) in case network drops before turn_complete
      clearTimeout(this.watchdogTimer);
      const totalRemainingMs = Math.max(1000, (this.nextPlayTime - currentTime) * 1000 + 15000);
      this.watchdogTimer = setTimeout(() => {
        if (this.isSpeaking && this.activeSources.length === 0) {
          this.isTurnComplete = true;
          this.isSpeaking = false;
          this.callbacks.onSpeakingStateChange?.(false);
        }
      }, totalRemainingMs);

      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }
        if (this.activeSources.length === 0) {
          this.evaluatePlaybackCompletion();
        }
      };
    } catch (e) {
      console.warn('[Live WebSocket] Error scheduling audio chunk:', e);
    }
  }

  /**
   * Immediately stops all currently playing audio chunks and resets playback time.
   */
  public stopPlayback() {
    clearTimeout(this.playbackFinishTimer);
    clearTimeout(this.watchdogTimer);
    this.activeSources.forEach((source) => {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {}
    });
    this.activeSources = [];
    this.nextPlayTime = 0;
    this.isTurnComplete = true;
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.callbacks.onSpeakingStateChange?.(false);
    }
  }

  /**
   * Returns current audio frequency data for 3D avatar & waveform visualization.
   */
  public getAudioFrequencyData(): Uint8Array {
    if (!this.analyser) {
      return new Uint8Array(32);
    }
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  /**
   * Sends a text prompt to Gemini Live over WebSocket for progressive streaming response.
   */
  public sendTextMessage(text: string, mode?: PersonalityMode) {
    if (!text.trim()) return;
    this.accumulatedText = '';
    this.isTurnComplete = false;
    this.hasReceivedAudioThisTurn = false;
    clearTimeout(this.playbackFinishTimer);
    clearTimeout(this.watchdogTimer);

    this.send({
      type: 'text',
      text: text.trim(),
      mode: mode || this.currentMode,
      language: this.currentLanguage,
    });
  }

  /**
   * Switches the active mode without breaking the persistent WebSocket connection.
   */
  public switchMode(mode: PersonalityMode, language = 'auto') {
    if (this.initializedMode === mode && this.initializedLanguage === language) {
      return;
    }
    this.currentMode = mode;
    this.currentLanguage = language;
    this.initializedMode = mode;
    this.initializedLanguage = language;
    this.stopPlayback();
    this.accumulatedText = '';

    this.send({
      type: 'switch_mode',
      mode,
      language,
    });
  }

  /**
   * Starts real-time 16kHz PCM microphone audio streaming to Gemini Live.
   */
  public async startMicrophoneStreaming(onVolume?: (level: number) => void): Promise<boolean> {
    if (this.isMicStreaming) return true;

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioContext = new AudioCtx({ sampleRate: 16000 });

      const source = this.inputAudioContext.createMediaStreamSource(this.micStream);
      // Buffer size 2048 gives ~128ms latency per audio packet for crisp real-time responsiveness
      this.micProcessor = this.inputAudioContext.createScriptProcessor(2048, 1, 1);

      this.micProcessor.onaudioprocess = (e) => {
        if (!this.isMicStreaming) return;

        // If AI is speaking, pause sending mic input to prevent acoustic self-voice feedback
        if (this.isSpeaking && this.pauseMicDuringAiSpeech) {
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);

        // Calculate simple volume level for visualizer
        if (onVolume) {
          let sum = 0;
          for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sum / inputData.length);
          onVolume(Math.min(1, rms * 5));
        }

        // Convert to 16-bit PCM base64
        const base64Pcm = float32ToBase64Pcm(inputData);
        if (this.isConnected()) {
          this.send({
            type: 'audio',
            audio: base64Pcm,
          });
        }
      };

      source.connect(this.micProcessor);
      this.micProcessor.connect(this.inputAudioContext.destination);
      this.isMicStreaming = true;

      return true;
    } catch (err) {
      console.error('[Live WebSocket] Microphone access failed:', err);
      this.callbacks.onError?.('Microphone access denied or unavailable.');
      return false;
    }
  }

  /**
   * Stops microphone capture cleanly and releases media tracks.
   */
  public stopMicrophoneStreaming() {
    this.isMicStreaming = false;

    if (this.micProcessor) {
      try {
        this.micProcessor.disconnect();
      } catch {}
      this.micProcessor = null;
    }

    if (this.inputAudioContext) {
      try {
        this.inputAudioContext.close();
      } catch {}
      this.inputAudioContext = null;
    }

    if (this.micStream) {
      try {
        this.micStream.getTracks().forEach((track) => track.stop());
      } catch {}
      this.micStream = null;
    }
  }

  public isMicrophoneActive(): boolean {
    return this.isMicStreaming;
  }

  /**
   * Disconnects WebSocket and cleans up all audio resources.
   */
  public disconnect() {
    this.shouldStayConnected = false;
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.stopMicrophoneStreaming();
    this.stopPlayback();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    this.setState('disconnected');
  }
}

export const liveWebSocketService = new LiveWebSocketService();
