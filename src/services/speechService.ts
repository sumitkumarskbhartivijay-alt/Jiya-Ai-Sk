import { PersonalityMode } from '../types';
import { liveWebSocketService } from './liveWebSocketService';

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export type AudioSessionPhase = 'idle' | 'listening' | 'processing' | 'speaking';

export class SpeechRecognitionManager {
  private recognition: any = null;
  private isListening = false;
  private userMicEnabled = false;
  private shouldRestart = false;
  private pausedForAI = false;
  private sessionPhase: AudioSessionPhase = 'idle';
  private restartTimer: any = null;
  private consecutiveErrors = 0;

  // Idempotent Speech Reconstruction & Voice Activity Detection (VAD)
  private consumedResultIndex = 0;
  private lastResultsLength = 0;
  private carriedOverText = '';
  private currentCycleText = '';
  private lastInterimNotified = '';
  private lastCommittedText = '';
  private lastCommittedAt = 0;
  private silenceTimer: any = null;
  private readonly silenceTimeoutMs = 1450; // 1.45s of genuine silence before committing speech
  private isSpeakingSpeechDetected = false;
  private resultListeners: Array<(transcript: string, isFinal: boolean) => void> = [];

  public onResultCallback?: (transcript: string, isFinal: boolean) => void;
  public onErrorCallback?: (error: string) => void;
  public onStateChangeCallback?: (isListening: boolean) => void;

  constructor() {
    const win = window as unknown as IWindow;
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (SpeechRec) {
      try {
        this.recognition = new SpeechRec();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
        this.recognition.lang = 'hi-IN';

        this.recognition.onstart = () => {
          this.isListening = true;
          this.consecutiveErrors = 0;
          this.consumedResultIndex = 0;
          this.lastResultsLength = 0;
          if (this.userMicEnabled && !this.pausedForAI) {
            this.sessionPhase = 'listening';
            this.onStateChangeCallback?.(true);
          }
        };

        this.recognition.onresult = (event: any) => {
          // Strictly ignore any late/residual mic events while Jiya AI is processing or speaking
          if (this.pausedForAI || !this.userMicEnabled || this.sessionPhase !== 'listening') {
            return;
          }

          if (!event.results) return;
          this.lastResultsLength = event.results.length;

          // Idempotently reconstruct transcript from unconsumed results in this recognition cycle.
          // Prevents duplicate concatenation when isFinal fires or when Android Chrome emits cumulative prefixes.
          const segments: string[] = [];
          const startIndex = Math.min(this.consumedResultIndex, event.results.length);

          for (let i = startIndex; i < event.results.length; ++i) {
            const rawTranscript = (event.results[i][0]?.transcript || '').trim();
            if (!rawTranscript) continue;

            if (segments.length > 0) {
              const prev = segments[segments.length - 1];
              const currLower = rawTranscript.toLowerCase();
              const prevLower = prev.toLowerCase();

              if (currLower === prevLower || prevLower.endsWith(currLower)) {
                continue;
              }
              if (currLower.startsWith(prevLower)) {
                segments[segments.length - 1] = rawTranscript;
                continue;
              }
            }
            segments.push(rawTranscript);
          }

          this.currentCycleText = segments.join(' ').replace(/\s+/g, ' ').trim();
          const combinedText = this.mergeSegments(this.carriedOverText, this.currentCycleText);

          if (combinedText.length > 0) {
            this.isSpeakingSpeechDetected = true;

            if (combinedText !== this.lastInterimNotified) {
              this.lastInterimNotified = combinedText;
              this.notifyResult(combinedText, false);
            }

            // Reset and arm the VAD silence detection timer.
            // Jiya AI waits until the user genuinely finishes speaking.
            this.clearSilenceTimer();
            this.silenceTimer = setTimeout(() => {
              this.commitFullSpeech();
            }, this.silenceTimeoutMs);
          }
        };

        this.recognition.onerror = (event: any) => {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            this.userMicEnabled = false;
            this.shouldRestart = false;
            this.sessionPhase = 'idle';
            this.clearSilenceTimer();
            this.onErrorCallback?.('Microphone permission denied. Please allow microphone access in your browser settings.');
            this.onStateChangeCallback?.(false);
          } else if (event.error === 'no-speech' || event.error === 'aborted') {
            // Normal quiet room timeout or controlled stop — do not show error or interrupt session
            if (event.error === 'no-speech') {
              this.consecutiveErrors++;
            }
          } else {
            console.warn('SpeechRecognition notice:', event.error);
          }
        };

        this.recognition.onend = () => {
          this.isListening = false;
          this.consumedResultIndex = 0;
          this.lastResultsLength = 0;

          // 1. If user explicitly turned mic OFF, transition cleanly to idle
          if (!this.userMicEnabled) {
            this.sessionPhase = 'idle';
            this.onStateChangeCallback?.(false);
            return;
          }

          // 2. If strictly paused because JIYA AI is processing or speaking, stay muted and do NOT restart yet
          if (this.pausedForAI || this.sessionPhase === 'processing' || this.sessionPhase === 'speaking') {
            return;
          }

          // 3. Browser ended recognition while user is still in 'listening' mode (e.g. quiet timeout or mid-sentence pause).
          // Preserve any spoken words in carriedOverText and silently keep recognition alive WITHOUT toggling UI state OFF/ON!
          if (this.currentCycleText) {
            this.carriedOverText = this.mergeSegments(this.carriedOverText, this.currentCycleText);
            this.currentCycleText = '';
          }

          if (this.shouldRestart && this.consecutiveErrors < 25) {
            clearTimeout(this.restartTimer);
            this.restartTimer = setTimeout(() => {
              if (this.userMicEnabled && this.shouldRestart && !this.pausedForAI && !this.isListening) {
                try {
                  this.recognition.start();
                } catch {}
              }
            }, 120);
          }
        };
      } catch (err) {
        console.error('Failed to initialize SpeechRecognition:', err);
      }
    }
  }

  /**
   * Merges two transcript strings while preventing overlapping duplicate words.
   */
  private mergeSegments(first: string, second: string): string {
    const a = first.trim();
    const b = second.trim();
    if (!a) return b;
    if (!b) return a;
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    if (aLower === bLower || aLower.endsWith(bLower)) return a;
    if (bLower.startsWith(aLower)) return b;
    return `${a} ${b}`.replace(/\s+/g, ' ').trim();
  }

  /**
   * Commits the completed user utterance exactly once after verified silence.
   */
  private commitFullSpeech() {
    this.clearSilenceTimer();

    if (this.pausedForAI || !this.userMicEnabled || this.sessionPhase !== 'listening' || !this.isSpeakingSpeechDetected) {
      return;
    }

    const fullText = this.getPendingTranscript();

    // Clear buffers and advance consumed index immediately
    this.consumedResultIndex = this.lastResultsLength;
    this.carriedOverText = '';
    this.currentCycleText = '';
    this.lastInterimNotified = '';
    this.isSpeakingSpeechDetected = false;

    if (!fullText) return;

    // Strict deduplication guard: prevent the same spoken segment from being submitted twice
    const now = Date.now();
    if (
      fullText.toLowerCase() === this.lastCommittedText.toLowerCase() &&
      now - this.lastCommittedAt < 3500
    ) {
      return;
    }

    this.lastCommittedText = fullText;
    this.lastCommittedAt = now;

    // Lock audio session into 'processing' and pause mic BEFORE stopping recognition
    // so Chrome's final onresult event on stop() is completely ignored!
    this.sessionPhase = 'processing';
    this.pausedForAI = true;
    clearTimeout(this.restartTimer);

    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {}
    }

    // Emit final transcript once
    this.notifyResult(fullText, true);
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private notifyResult(transcript: string, isFinal: boolean) {
    this.onResultCallback?.(transcript, isFinal);
    this.resultListeners.forEach((listener) => {
      try {
        listener(transcript, isFinal);
      } catch (e) {
        console.warn('Listener error:', e);
      }
    });
  }

  public subscribeResult(listener: (transcript: string, isFinal: boolean) => void) {
    if (!this.resultListeners.includes(listener)) {
      this.resultListeners.push(listener);
    }
    return () => {
      this.resultListeners = this.resultListeners.filter((l) => l !== listener);
    };
  }

  public getPendingTranscript(): string {
    return this.mergeSegments(this.carriedOverText, this.currentCycleText);
  }

  public isSupported(): boolean {
    return Boolean(this.recognition);
  }

  public setLanguage(langCode: string) {
    if (!this.recognition) return;
    const targetLang =
      langCode === 'English' ? 'en-US' : 'hi-IN';
    if (this.recognition.lang !== targetLang) {
      this.recognition.lang = targetLang;
    }
  }

  /**
   * Turns the microphone session ON and starts listening.
   */
  public start(continuous = true) {
    if (!this.recognition) {
      this.onErrorCallback?.('Speech recognition is not supported in this browser. Please use Google Chrome or an Android browser.');
      return;
    }
    this.userMicEnabled = true;
    this.shouldRestart = continuous;
    this.pausedForAI = false;
    this.sessionPhase = 'listening';
    this.consecutiveErrors = 0;
    this.consumedResultIndex = this.lastResultsLength;
    this.carriedOverText = '';
    this.currentCycleText = '';
    this.lastInterimNotified = '';
    this.isSpeakingSpeechDetected = false;
    this.clearSilenceTimer();
    clearTimeout(this.restartTimer);

    if (!this.isListening) {
      try {
        this.recognition.start();
      } catch (e) {
        // Already started
      }
    } else {
      this.onStateChangeCallback?.(true);
    }
  }

  /**
   * Strictly pauses microphone while JIYA AI is generating a response or speaking.
   * Does NOT disable `userMicEnabled`, so hands-free conversation will resume after AI finishes.
   */
  public pauseForAI(phase: AudioSessionPhase = 'speaking') {
    this.pausedForAI = true;
    this.sessionPhase = phase;
    this.clearSilenceTimer();
    clearTimeout(this.restartTimer);
    this.carriedOverText = '';
    this.currentCycleText = '';
    this.lastInterimNotified = '';
    this.isSpeakingSpeechDetected = false;

    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {}
    }
  }

  /**
   * Resumes microphone ONLY AFTER JIYA AI has completely finished speaking,
   * and ONLY if the user had turned the microphone ON (`userMicEnabled === true`).
   */
  public resumeAfterAI(delayMs = 420) {
    this.clearSilenceTimer();
    clearTimeout(this.restartTimer);
    this.carriedOverText = '';
    this.currentCycleText = '';
    this.lastInterimNotified = '';
    this.isSpeakingSpeechDetected = false;

    if (!this.userMicEnabled || !this.shouldRestart) {
      this.pausedForAI = false;
      this.sessionPhase = 'idle';
      return;
    }

    this.restartTimer = setTimeout(() => {
      if (!this.userMicEnabled || !this.shouldRestart) return;
      this.pausedForAI = false;
      this.sessionPhase = 'listening';
      this.onStateChangeCallback?.(true);

      if (!this.isListening) {
        try {
          this.recognition.start();
        } catch {}
      }
    }, delayMs);
  }

  /**
   * Explicitly turns the microphone OFF when requested by the user.
   */
  public stop() {
    this.userMicEnabled = false;
    this.shouldRestart = false;
    this.pausedForAI = false;
    this.sessionPhase = 'idle';
    this.clearSilenceTimer();
    clearTimeout(this.restartTimer);
    this.carriedOverText = '';
    this.currentCycleText = '';
    this.lastInterimNotified = '';
    this.isSpeakingSpeechDetected = false;

    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {}
    }
    this.onStateChangeCallback?.(false);
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  public getIsContinuous(): boolean {
    return this.userMicEnabled && this.shouldRestart;
  }

  public isMicSessionEnabled(): boolean {
    return this.userMicEnabled;
  }

  public getSessionPhase(): AudioSessionPhase {
    return this.sessionPhase;
  }
}

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

// Audio Output Manager supporting genuine Gemini 24kHz WAV Audio
/**
 * Guarantees standard 44-byte WAV RIFF header on base64 audio.
 * Prevents browser audio decode failure when receiving raw 24kHz 16-bit mono PCM.
 */
function ensureClientWav(base64Data: string): string {
  try {
    const binary = atob(base64Data);
    if (binary.length >= 12 && binary.slice(0, 4) === 'RIFF') {
      return base64Data;
    }
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const pcmLength = binary.length;

    const buffer = new ArrayBuffer(44 + pcmLength);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // RIFF identifier
    bytes[0] = 82; bytes[1] = 73; bytes[2] = 70; bytes[3] = 70; // RIFF
    view.setUint32(4, 36 + pcmLength, true);
    bytes[8] = 87; bytes[9] = 65; bytes[10] = 86; bytes[11] = 69; // WAVE
    bytes[12] = 102; bytes[13] = 109; bytes[14] = 116; bytes[15] = 32; // fmt 
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    bytes[36] = 100; bytes[37] = 97; bytes[38] = 116; bytes[39] = 97; // data
    view.setUint32(40, pcmLength, true);

    for (let i = 0; i < pcmLength; i++) {
      bytes[44 + i] = binary.charCodeAt(i);
    }

    let binaryStr = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binaryStr += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return btoa(binaryStr);
  } catch (e) {
    return base64Data;
  }
}

class AudioOutputManager {
  private currentAudioElement: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private playbackStatus: PlaybackStatus = 'idle';
  private onEndCallbacks: Array<() => void> = [];
  private onStatusChangeListeners: Array<(status: PlaybackStatus) => void> = [];
  private currentMessageId: string | null = null;
  private cachedVoices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.refreshVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        this.refreshVoices();
      };
    }
  }

  private refreshVoices() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.cachedVoices = window.speechSynthesis.getVoices();
    }
  }

  public subscribeStatus(listener: (status: PlaybackStatus) => void) {
    this.onStatusChangeListeners.push(listener);
    return () => {
      this.onStatusChangeListeners = this.onStatusChangeListeners.filter((l) => l !== listener);
    };
  }

  private setPlaybackStatus(status: PlaybackStatus) {
    this.playbackStatus = status;
    this.onStatusChangeListeners.forEach((l) => l(status));
  }

  private initAudioContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  public stopAllSpeech() {
    liveWebSocketService.stopPlayback();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement.currentTime = 0;
      this.currentAudioElement = null;
    }

    this.currentMessageId = null;
    this.setPlaybackStatus('idle');
    this.notifyEnd();
  }

  public pause() {
    if (this.currentAudioElement && !this.currentAudioElement.paused) {
      this.currentAudioElement.pause();
      this.setPlaybackStatus('paused');
    }
  }

  public resume() {
    if (this.currentAudioElement && this.currentAudioElement.paused) {
      this.currentAudioElement.play().then(() => {
        this.setPlaybackStatus('playing');
      }).catch((e) => {
        console.warn('Resume failed:', e);
      });
    }
  }

  public togglePlayPause() {
    if (this.playbackStatus === 'playing') {
      this.pause();
    } else if (this.playbackStatus === 'paused') {
      this.resume();
    }
  }

  public setLoading(messageId?: string) {
    this.stopAllSpeech();
    this.currentMessageId = messageId || null;
    this.setPlaybackStatus('loading');
  }

  public playBase64Wav(base64Wav: string, messageId?: string, onEnd?: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stopAllSpeech();
      this.initAudioContext();
      this.currentMessageId = messageId || null;
      this.setPlaybackStatus('playing');

      const safeWav = ensureClientWav(base64Wav);
      const audio = new Audio(`data:audio/wav;base64,${safeWav}`);
      audio.crossOrigin = 'anonymous';
      audio.volume = 1.0;
      this.currentAudioElement = audio;

      if (onEnd) {
        this.onEndCallbacks.push(onEnd);
      }

      if (this.audioContext && this.analyser) {
        try {
          const source = this.audioContext.createMediaElementSource(audio);
          source.connect(this.analyser);
          this.analyser.connect(this.audioContext.destination);
        } catch (e) {
          // If already connected or routing prevented, direct audio playback still works
        }
      }

      audio.onended = () => {
        this.currentAudioElement = null;
        this.currentMessageId = null;
        this.setPlaybackStatus('idle');
        this.notifyEnd();
        resolve();
      };

      audio.onerror = (e) => {
        console.warn('Audio playback error:', e);
        this.currentAudioElement = null;
        this.currentMessageId = null;
        this.setPlaybackStatus('error');
        this.notifyEnd();
        reject(new Error('Audio playback failed in browser'));
      };

      audio.play().catch((err) => {
        console.warn('Initial play blocked, attempting context resume:', err);
        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume().then(() => {
            audio.play().then(resolve).catch((playErr) => {
              this.currentAudioElement = null;
              this.currentMessageId = null;
              this.setPlaybackStatus('error');
              this.notifyEnd();
              reject(playErr);
            });
          });
        } else {
          this.currentAudioElement = null;
          this.currentMessageId = null;
          this.setPlaybackStatus('error');
          this.notifyEnd();
          reject(err);
        }
      });
    });
  }

  public speakBrowserSynthesis(
    text: string,
    mode: PersonalityMode,
    rate = 1.0,
    pitch = 1.0,
    onEnd?: () => void
  ) {
    if (!('speechSynthesis' in window)) {
      onEnd?.();
      return;
    }

    this.stopAllSpeech();
    this.setPlaybackStatus('playing');
    if (onEnd) this.onEndCallbacks.push(onEnd);

    const clean = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[*#_~`]/g, '')
      .trim();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = Math.max(0.85, Math.min(1.2, rate));
    utterance.pitch = Math.max(0.85, Math.min(1.15, pitch));

    if (this.cachedVoices.length === 0) {
      this.refreshVoices();
    }
    const voices = this.cachedVoices.length > 0 ? this.cachedVoices : window.speechSynthesis.getVoices();
    let selectedVoice: SpeechSynthesisVoice | null = null;

    if (mode === 'gf') {
      // Prioritize natural female Hindi / Indian English voices
      selectedVoice =
        voices.find((v) => /swara|neerja|google हिन्दी|lekha/i.test(v.name)) ||
        voices.find((v) => v.lang.startsWith('hi') && /female|zira|samantha|google/i.test(v.name)) ||
        voices.find((v) => v.lang.includes('IN') && /female/i.test(v.name)) ||
        voices.find((v) => /natural.*female|samantha|karen|victoria|zira/i.test(v.name)) ||
        null;
      utterance.pitch = Math.max(1.05, Math.min(1.22, pitch * 1.12));
      utterance.rate = Math.max(0.95, Math.min(1.15, rate * 1.04));
    } else if (mode === 'jarvis') {
      // Authoritative, refined male British / deep voice
      selectedVoice =
        voices.find((v) => /george|daniel|oliver|uk english male/i.test(v.name)) ||
        voices.find((v) => v.lang.includes('GB') && /male/i.test(v.name)) ||
        voices.find((v) => /david|male/i.test(v.name)) ||
        null;
      utterance.pitch = 0.95;
    } else if (mode === 'dost') {
      // Friendly Indian Hindi/English buddy voice
      selectedVoice =
        voices.find((v) => /madhur|rishi|google हिन्दी|hemant/i.test(v.name)) ||
        voices.find((v) => v.lang.startsWith('hi')) ||
        voices.find((v) => v.lang.includes('IN')) ||
        voices.find((v) => /male/i.test(v.name)) ||
        null;
      utterance.pitch = 1.0;
    } else if (mode === 'professional') {
      // Articulate clear consultant
      selectedVoice =
        voices.find((v) => /natural|siri|google uk|serena|alex/i.test(v.name)) ||
        voices.find((v) => v.lang.includes('en-GB') || v.lang.includes('en-US')) ||
        null;
      utterance.pitch = 1.0;
    } else if (mode === 'funny') {
      // Energetic cheerful
      selectedVoice =
        voices.find((v) => /rishi|junior|fred|puck|natural/i.test(v.name)) ||
        voices.find((v) => v.lang.includes('IN')) ||
        null;
      utterance.pitch = 1.1;
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onend = () => {
      this.setPlaybackStatus('idle');
      this.notifyEnd();
    };

    utterance.onerror = () => {
      this.setPlaybackStatus('idle');
      this.notifyEnd();
    };

    window.speechSynthesis.speak(utterance);
  }

  public getAudioFrequencyData(): Uint8Array {
    const liveFreq = liveWebSocketService.getAudioFrequencyData();
    if (liveFreq && liveFreq.length > 0 && liveFreq.some((v) => v > 0)) {
      return liveFreq;
    }
    if (!this.analyser) {
      return liveFreq || new Uint8Array(32);
    }
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  public getPlaybackStatus(): PlaybackStatus {
    return this.playbackStatus;
  }

  public getCurrentMessageId(): string | null {
    return this.currentMessageId;
  }

  private notifyEnd() {
    while (this.onEndCallbacks.length > 0) {
      const cb = this.onEndCallbacks.shift();
      try {
        cb?.();
      } catch (err) {
        // Safe callback handling
      }
    }
  }
}

export const speechRecManager = new SpeechRecognitionManager();
export const audioOutputManager = new AudioOutputManager();
