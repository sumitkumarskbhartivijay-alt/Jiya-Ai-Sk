import React, { useEffect, useRef } from 'react';
import { PersonalityMode, VoiceStatus } from '../types';
import { PERSONALITY_MODES } from '../constants/modes';
import { audioOutputManager } from '../services/speechService';

interface VoiceWaveformProps {
  status: VoiceStatus;
  mode: PersonalityMode;
}

export const VoiceWaveform: React.FC<VoiceWaveformProps> = ({ status, mode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentMode = PERSONALITY_MODES[mode];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const render = () => {
      t += 0.08;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const isListening = status === 'listening';
      const isSpeaking = status === 'speaking';
      const isProcessing = status === 'processing';

      // Bar count
      const barCount = 36;
      const barWidth = 4;
      const gap = (width - barCount * barWidth) / (barCount - 1);

      // Get real audio frequency data if speaking
      const freqData = isSpeaking ? audioOutputManager.getAudioFrequencyData() : null;

      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + gap);
        let barHeight = 4;

        if (isSpeaking) {
          // Dynamic frequency-driven bars with fallback wave
          const freqVal = freqData && freqData.length > 0 ? freqData[i % freqData.length] / 255 : 0.5;
          const wave = Math.sin(t * 1.5 + i * 0.3) * 0.5 + 0.5;
          barHeight = 8 + (freqVal * 0.7 + wave * 0.3) * (height - 14);
        } else if (isListening) {
          // Responsive pulsing acoustic wave
          const wave = Math.sin(t * 2 + i * 0.4) * Math.cos(t * 0.7 + i * 0.2);
          barHeight = 6 + Math.abs(wave) * (height - 12);
        } else if (isProcessing) {
          // Traveling ripple wave
          const ripple = Math.sin(t * 3 - i * 0.35);
          barHeight = 6 + Math.max(0, ripple) * (height - 16);
        } else {
          // Idle gentle breathing baseline
          const breath = Math.sin(t * 0.5 + i * 0.15) * 0.5 + 0.5;
          barHeight = 4 + breath * 6;
        }

        const y = (height - barHeight) / 2;

        // Gradient based on mode accent
        const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
        grad.addColorStop(0, '#c084fc');
        grad.addColorStop(0.5, currentMode.accentColor);
        grad.addColorStop(1, '#38bdf8');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [status, mode, currentMode]);

  return (
    <div className="w-full max-w-xs sm:max-w-md h-12 flex items-center justify-center px-4">
      <canvas
        ref={canvasRef}
        width={360}
        height={48}
        className="w-full h-full drop-shadow-md"
      />
    </div>
  );
};
