import React, { useState } from 'react';
import { PersonalityMode } from '../types';
import { PERSONALITY_MODES } from '../constants/modes';
import { Check, Volume2, Sparkles, ArrowRight, Play } from 'lucide-react';
import { audioOutputManager } from '../services/speechService';
import { synthesizeSpeech } from '../services/geminiService';

interface ModesViewProps {
  currentMode: PersonalityMode;
  onSelectMode: (mode: PersonalityMode) => void;
  onSendSamplePrompt: (prompt: string, mode: PersonalityMode) => void;
}

export const ModesView: React.FC<ModesViewProps> = ({
  currentMode,
  onSelectMode,
  onSendSamplePrompt,
}) => {
  const [testingMode, setTestingMode] = useState<PersonalityMode | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  React.useEffect(() => {
    return () => {
      audioOutputManager.stopAllSpeech();
    };
  }, []);

  const testVoiceSample = async (modeId: PersonalityMode) => {
    // If user clicks the currently testing mode, toggle it off
    if (testingMode === modeId) {
      audioOutputManager.stopAllSpeech();
      setTestingMode(null);
      return;
    }

    setTestingMode(modeId);
    setVoiceError(null);
    audioOutputManager.stopAllSpeech();

    const mode = PERSONALITY_MODES[modeId];
    const sampleText = mode.welcomeMessage;

    try {
      const res = await synthesizeSpeech(sampleText, modeId);
      if (res && res.audioBase64) {
        await audioOutputManager.playBase64Wav(res.audioBase64, undefined, () => {
          setTestingMode(null);
        });
        return;
      }

      // If cloud TTS reached quota or fallback is requested, seamlessly play with browser voice engine
      audioOutputManager.speakBrowserSynthesis(
        sampleText,
        modeId,
        mode.speechRate,
        mode.pitch,
        () => {
          setTestingMode(null);
        }
      );
    } catch (e: any) {
      console.warn('Voice test cloud synthesis notice, falling back to browser voice:', e);
      try {
        audioOutputManager.speakBrowserSynthesis(
          sampleText,
          modeId,
          mode.speechRate,
          mode.pitch,
          () => {
            setTestingMode(null);
          }
        );
      } catch (fallbackErr: any) {
        console.error('Voice test failed:', fallbackErr);
        setVoiceError('Voice playback is unavailable on this device.');
        setTestingMode(null);
        setTimeout(() => setVoiceError(null), 6000);
      }
    }
  };

  const modeKeys: PersonalityMode[] = ['gf', 'jarvis', 'dost', 'professional', 'funny'];

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 pb-24 space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-1 text-center sm:text-left">
        <div className="flex items-center justify-center sm:justify-start gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <h2 className="text-xl sm:text-2xl font-bold text-white font-display">
            Five Personality Modes
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-slate-400">
          Switching mode instantly adapts JIYA's voice profile, response style, visual aura, and speaking cadence.
        </p>
      </div>

      {/* Voice Error Notification */}
      {voiceError && (
        <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-xs text-red-200 flex items-center gap-2 shadow-lg animate-shake">
          <span className="font-semibold text-red-400">Voice Synthesis Note:</span>
          <span>{voiceError}</span>
        </div>
      )}

      {/* Mode Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modeKeys.map((key) => {
          const mode = PERSONALITY_MODES[key];
          const isActive = currentMode === key;
          const isTesting = testingMode === key;

          return (
            <div
              key={key}
              className={`relative rounded-2xl glass-panel p-5 transition-all duration-300 border flex flex-col justify-between ${
                isActive
                  ? 'border-2 shadow-xl bg-slate-900/90'
                  : 'hover:border-slate-700 hover:bg-slate-900/50'
              }`}
              style={{
                borderColor: isActive ? mode.accentColor : 'rgba(255, 255, 255, 0.08)',
                boxShadow: isActive ? `0 0 25px ${mode.glowColor}` : undefined,
              }}
            >
              {/* Top Row: Emoji, Title, Voice Tag & Active Badge */}
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-inner border border-white/10"
                      style={{ backgroundColor: `${mode.accentColor}22` }}
                    >
                      <span>{mode.emoji}</span>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span>{mode.name}</span>
                        {isActive && (
                          <span
                            className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full text-white font-semibold"
                            style={{ backgroundColor: mode.accentColor }}
                          >
                            Active
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-400">{mode.tagline}</p>
                    </div>
                  </div>

                  {/* Voice Test Button */}
                  <button
                    onClick={() => testVoiceSample(key)}
                    className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-colors flex items-center gap-1.5 text-xs"
                    title="Test Voice Sample"
                  >
                    <Volume2
                      className={`w-4 h-4 ${isTesting ? 'animate-bounce text-cyan-400' : ''}`}
                    />
                    <span className="hidden sm:inline">
                      {isTesting ? 'Playing...' : 'Voice Test'}
                    </span>
                  </button>
                </div>

                {/* Voice Profile Badge */}
                <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: mode.accentColor }} />
                    <span className="font-mono text-[11px]">{mode.voiceName}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Speed: {mode.speechRate}x · Pitch: {mode.pitch}x
                  </span>
                </div>

                {/* Description */}
                <p className="mt-2.5 text-xs text-slate-300 leading-relaxed">
                  {mode.description}
                </p>

                {/* Sample Prompt Chips */}
                <div className="mt-3.5 space-y-1.5">
                  <span className="text-[10px] font-mono uppercase text-slate-400 tracking-wider">
                    Quick Sample Questions:
                  </span>
                  <div className="flex flex-col gap-1">
                    {mode.samplePrompts.slice(0, 2).map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          onSelectMode(key);
                          onSendSamplePrompt(prompt, key);
                        }}
                        className="text-left text-xs text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-slate-950/40 hover:bg-slate-800/60 border border-slate-800/60 transition-colors flex items-center justify-between group"
                      >
                        <span className="truncate pr-2">"{prompt}"</span>
                        <Play className="w-3 h-3 text-slate-400 group-hover:text-purple-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Activate Button */}
              <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 italic truncate max-w-[200px]">
                  {mode.welcomeMessage.slice(0, 40)}...
                </span>

                <button
                  onClick={() => onSelectMode(key)}
                  className={`px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md ${
                    isActive
                      ? 'bg-slate-800 text-slate-300 border border-slate-700'
                      : 'text-white hover:scale-105'
                  }`}
                  style={!isActive ? { backgroundColor: mode.accentColor } : {}}
                >
                  {isActive ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Current Mode</span>
                    </>
                  ) : (
                    <>
                      <span>Activate Mode</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
