import React, { useEffect, useRef } from 'react';
import { PersonalityMode, VoiceStatus } from '../types';
import { PERSONALITY_MODES } from '../constants/modes';
import { Sparkles, Radio } from 'lucide-react';

interface Avatar3DProps {
  mode: PersonalityMode;
  status: VoiceStatus;
  viewMode: '3d-canvas' | 'portrait';
  onToggleViewMode?: () => void;
}

export const Avatar3D: React.FC<Avatar3DProps> = ({
  mode,
  status,
  viewMode,
  onToggleViewMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentMode = PERSONALITY_MODES[mode];

  // Dynamic Canvas 3D Animated Female AI Hologram with Glowing Headphones
  useEffect(() => {
    if (viewMode !== '3d-canvas') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let t = 0;

    const render = () => {
      t += 0.035;
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2 - 10;

      ctx.clearRect(0, 0, width, height);

      // Color mapping based on mode
      const primaryHex = currentMode.accentColor;
      const isListening = status === 'listening';
      const isSpeaking = status === 'speaking';
      const isThinking = status === 'processing';

      // 1. Holographic Cyber Ambient Aura & Rings
      const auraGradient = ctx.createRadialGradient(cx, cy, 30, cx, cy, 140);
      auraGradient.addColorStop(0, `${primaryHex}35`);
      auraGradient.addColorStop(0.6, `${primaryHex}10`);
      auraGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = auraGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, 140, 0, Math.PI * 2);
      ctx.fill();

      // Rotating Concentric Sci-Fi Rings
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.4);
      ctx.strokeStyle = `${primaryHex}30`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([12, 18, 4, 18]);
      ctx.beginPath();
      ctx.arc(0, 0, 115, 0, Math.PI * 2);
      ctx.stroke();

      ctx.rotate(-t * 0.7);
      ctx.strokeStyle = `${primaryHex}50`;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([8, 14]);
      ctx.beginPath();
      ctx.arc(0, 0, 128, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Floating Particle Cloud & GF Mode Floating Hearts
      if (mode === 'gf') {
        const heartCount = 12;
        for (let i = 0; i < heartCount; i++) {
          const heartSpeed = 0.5 + (i % 3) * 0.25;
          const yOffset = ((t * 26 * heartSpeed + i * 28) % 230) - 30;
          const px = cx + Math.sin(t * 1.3 + i * 1.6) * (65 + (i % 4) * 18);
          const py = cy + 90 - yOffset;
          const size = 3 + (i % 3) * 2.2;
          const alpha = Math.max(0, Math.min(0.85, 1 - (cy + 90 - py) / 220));

          ctx.save();
          ctx.translate(px, py);
          ctx.scale(size / 6, size / 6);
          ctx.fillStyle = `rgba(244, 63, 94, ${alpha.toFixed(2)})`;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(-5, -6, -10, -2, -10, 3);
          ctx.bezierCurveTo(-10, 8, -5, 12, 0, 16);
          ctx.bezierCurveTo(5, 12, 10, 8, 10, 3);
          ctx.bezierCurveTo(10, -2, 5, -6, 0, 0);
          ctx.fill();
          ctx.restore();
        }
      }

      const particleCount = 18;
      for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2 + t * 0.3;
        const radius = 100 + Math.sin(t * 1.5 + i) * 22;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        ctx.fillStyle = `${primaryHex}aa`;
        ctx.beginPath();
        ctx.arc(px, py, 1.8 + Math.sin(t * 2 + i) * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Neck & Cybernetic Collar
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(cx - 24, cy + 50);
      ctx.lineTo(cx + 24, cy + 50);
      ctx.lineTo(cx + 38, cy + 95);
      ctx.lineTo(cx - 38, cy + 95);
      ctx.closePath();
      ctx.fill();

      // Cybernetic collar neon lines
      ctx.strokeStyle = primaryHex;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 36, cy + 90);
      ctx.quadraticCurveTo(cx, cy + 98, cx + 36, cy + 90);
      ctx.stroke();

      // 3. Hair Base Layer
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(cx, cy - 10, 68, 0, Math.PI * 2);
      ctx.fill();

      // Flowing Hair sides
      ctx.beginPath();
      ctx.moveTo(cx - 60, cy - 20);
      ctx.quadraticCurveTo(cx - 68, cy + 40, cx - 46, cy + 85);
      ctx.lineTo(cx - 30, cy + 70);
      ctx.quadraticCurveTo(cx - 52, cy + 25, cx - 48, cy - 20);
      ctx.fillStyle = '#0d1322';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx + 60, cy - 20);
      ctx.quadraticCurveTo(cx + 68, cy + 40, cx + 46, cy + 85);
      ctx.lineTo(cx + 30, cy + 70);
      ctx.quadraticCurveTo(cx + 52, cy + 25, cx + 48, cy - 20);
      ctx.fill();

      // Neon Hair Streaks
      ctx.strokeStyle = `${primaryHex}88`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx - 50, cy - 10);
      ctx.quadraticCurveTo(cx - 62, cy + 30, cx - 42, cy + 75);
      ctx.moveTo(cx + 50, cy - 10);
      ctx.quadraticCurveTo(cx + 62, cy + 30, cx + 42, cy + 75);
      ctx.stroke();

      // 4. Face Structure (Gentle, sleek female aesthetic)
      ctx.fillStyle = '#fce7f3';
      const skinGradient = ctx.createLinearGradient(cx, cy - 40, cx, cy + 60);
      skinGradient.addColorStop(0, '#fde68a'); // Warm gentle skin tone
      skinGradient.addColorStop(0.5, '#fed7aa');
      skinGradient.addColorStop(1, '#fbcfe8');
      ctx.fillStyle = skinGradient;

      ctx.beginPath();
      ctx.moveTo(cx - 45, cy - 20);
      ctx.bezierCurveTo(cx - 48, cy + 20, cx - 35, cy + 55, cx, cy + 62); // chin
      ctx.bezierCurveTo(cx + 35, cy + 55, cx + 48, cy + 20, cx + 45, cy - 20);
      ctx.bezierCurveTo(cx + 42, cy - 55, cx - 42, cy - 55, cx - 45, cy - 20);
      ctx.fill();

      // Soft Cheek Blush & GF Mode Rosy Radiance
      const isGF = mode === 'gf';
      const blushOpacity = isGF ? (isSpeaking ? 0.55 : 0.42) : (isSpeaking ? 0.35 : 0.2);
      ctx.fillStyle = `rgba(244, 114, 182, ${blushOpacity})`;
      ctx.beginPath();
      ctx.arc(cx - 26, cy + 18, isGF ? 14 : 12, 0, Math.PI * 2);
      ctx.arc(cx + 26, cy + 18, isGF ? 14 : 12, 0, Math.PI * 2);
      ctx.fill();

      // Cute little anime blush marks in GF mode
      if (isGF) {
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        // Left cheek blush lines
        ctx.moveTo(cx - 31, cy + 19); ctx.lineTo(cx - 27, cy + 15);
        ctx.moveTo(cx - 26, cy + 19); ctx.lineTo(cx - 22, cy + 15);
        // Right cheek blush lines
        ctx.moveTo(cx + 22, cy + 19); ctx.lineTo(cx + 26, cy + 15);
        ctx.moveTo(cx + 27, cy + 19); ctx.lineTo(cx + 31, cy + 15);
        ctx.stroke();
      }

      // 5. Eyes with expressive blink & direction
      const blinkCycle = Math.sin(t * 0.8);
      const isBlinking = blinkCycle > 0.96;
      const eyeY = cy - 2;

      const drawEye = (ex: number, isRight: boolean) => {
        if (isBlinking) {
          // Closed peaceful eye / smile lash
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(ex, eyeY, 8, 0.2, Math.PI - 0.2);
          ctx.stroke();
          return;
        }

        // Eye White
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, 11, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Iris
        const irisOffset = Math.sin(t * 0.5) * 1.5;
        const irisGrad = ctx.createRadialGradient(
          ex + irisOffset,
          eyeY,
          1,
          ex + irisOffset,
          eyeY,
          6
        );
        irisGrad.addColorStop(0, isGF ? '#f472b6' : '#38bdf8');
        irisGrad.addColorStop(0.6, isGF ? '#db2777' : '#0284c7');
        irisGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = irisGrad;
        ctx.beginPath();
        ctx.arc(ex + irisOffset, eyeY, 5.5, 0, Math.PI * 2);
        ctx.fill();

        // Pupil & Catchlight (Sparkle / Love catchlight in GF mode)
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(ex + irisOffset, eyeY, 2.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex + irisOffset - 1.8, eyeY - 1.8, isGF ? 1.8 : 1.4, 0, Math.PI * 2);
        ctx.arc(ex + irisOffset + 1.5, eyeY + 1.2, 0.9, 0, Math.PI * 2);
        ctx.fill();

        // Eyelashes & Upper Lid
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, 11, 7, 0, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();

        // Delicate winged eyeliner
        ctx.beginPath();
        const wingX = isRight ? ex + 13 : ex - 13;
        ctx.moveTo(isRight ? ex + 9 : ex - 9, eyeY - 1);
        ctx.lineTo(wingX, eyeY - 4);
        ctx.stroke();
      };

      drawEye(cx - 20, false);
      drawEye(cx + 20, true);

      // Eyebrows (Arched & expressive)
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.8;
      const browOffset = isThinking ? -3 : isGF ? -1.5 : 0;
      ctx.beginPath();
      ctx.moveTo(cx - 30, cy - 14 + browOffset);
      ctx.quadraticCurveTo(cx - 20, cy - 18 + browOffset, cx - 10, cy - 13);
      ctx.moveTo(cx + 10, cy - 13);
      ctx.quadraticCurveTo(cx + 20, cy - 18 + browOffset, cx + 30, cy - 14 + browOffset);
      ctx.stroke();

      // Cute Nose
      ctx.fillStyle = 'rgba(217, 119, 6, 0.25)';
      ctx.beginPath();
      ctx.arc(cx, cy + 15, 2.2, 0, Math.PI * 2);
      ctx.fill();

      // 6. Expressive Mouth (Speaking / Smiling / Laughing / Idle)
      ctx.strokeStyle = '#db2777';
      ctx.fillStyle = '#f43f5e';

      if (isSpeaking) {
        if (isGF) {
          // Cheerful laughing mouth with upward happy curve
          const mouthOpen = 4.5 + Math.abs(Math.sin(t * 8.5)) * 9;
          ctx.beginPath();
          ctx.ellipse(cx, cy + 34, 11, mouthOpen, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#9d174d';
          ctx.fill();
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2.2;
          ctx.stroke();

          // Cute smile teeth
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx - 6, cy + 34 - mouthOpen * 0.7, 12, mouthOpen * 0.45);

          // Laughing smile corner dimples
          ctx.strokeStyle = 'rgba(219, 39, 119, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx - 13, cy + 33, 2.5, 0, Math.PI);
          ctx.arc(cx + 13, cy + 33, 2.5, 0, Math.PI);
          ctx.stroke();
        } else {
          // Standard speaking mouth
          const mouthOpen = 4 + Math.abs(Math.sin(t * 8)) * 8;
          ctx.beginPath();
          ctx.ellipse(cx, cy + 34, 10, mouthOpen, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#881337';
          ctx.fill();
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx - 5, cy + 34 - mouthOpen * 0.7, 10, mouthOpen * 0.4);
        }
      } else if (isListening) {
        // Attentive cute sweet open smile
        ctx.beginPath();
        ctx.arc(cx, cy + (isGF ? 30 : 31), isGF ? 9 : 8, 0.08, Math.PI - 0.08);
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = isGF ? '#ec4899' : '#db2777';
        ctx.stroke();
      } else {
        // Joyful smiling lips
        ctx.beginPath();
        ctx.moveTo(cx - (isGF ? 12 : 11), cy + (isGF ? 32 : 33));
        ctx.quadraticCurveTo(cx, cy + (isGF ? 41 : 39), cx + (isGF ? 12 : 11), cy + (isGF ? 32 : 33));
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = isGF ? '#ec4899' : '#db2777';
        ctx.stroke();
      }

      // 7. Futuristic Glowing Over-Ear Headphones
      // Headband Arch
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(cx, cy - 16, 62, Math.PI * 0.95, Math.PI * 2.05);
      ctx.stroke();

      // Neon Headband Accent
      ctx.strokeStyle = primaryHex;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy - 16, 63, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();

      // Ear Cups (Left & Right) with animated glowing ring
      const drawEarCup = (cupX: number) => {
        // Base cup
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.ellipse(cupX, cy + 4, 13, 24, 0, 0, Math.PI * 2);
        ctx.fill();

        // Neon Trim
        ctx.strokeStyle = primaryHex;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Glowing Audio Waveform / Pulsing Ring on Ear Cup
        const cupPulse = isSpeaking || isListening ? Math.sin(t * 6) * 3 : 0;
        ctx.fillStyle = `${primaryHex}88`;
        ctx.beginPath();
        ctx.arc(cupX, cy + 4, 6 + cupPulse, 0, Math.PI * 2);
        ctx.fill();

        // "JIYA" or Audio icon on side
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 7px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('JIYA', cupX, cy + 6);
      };

      drawEarCup(cx - 57);
      drawEarCup(cx + 57);

      // 8. Cybernetic Forehead Circlet / Neural Diadem
      ctx.strokeStyle = `${primaryHex}cc`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 28, cy - 25);
      ctx.quadraticCurveTo(cx, cy - 22, cx + 28, cy - 25);
      ctx.stroke();

      // Neural Core Jewel
      ctx.fillStyle = primaryHex;
      ctx.beginPath();
      ctx.arc(cx, cy - 23, 3, 0, Math.PI * 2);
      ctx.fill();

      // Request next frame
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [viewMode, mode, status, currentMode]);

  return (
    <div className="relative flex flex-col items-center justify-center w-full select-none">
      {/* Visualizer Container */}
      <div className="relative w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center">
        {viewMode === '3d-canvas' ? (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Ambient Background Glow */}
            <div
              className="absolute inset-0 rounded-full blur-3xl opacity-40 transition-colors duration-700 pointer-events-none"
              style={{ backgroundColor: currentMode.accentColor }}
            />

            <canvas
              ref={canvasRef}
              width={340}
              height={340}
              className="relative z-10 w-full h-full drop-shadow-2xl cursor-pointer"
              onClick={onToggleViewMode}
              title="Click to toggle High-Definition 3D Portrait View"
            />
          </div>
        ) : (
          <div
            className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-full overflow-hidden p-1.5 cursor-pointer shadow-2xl transition-transform active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${currentMode.accentColor}, #3b82f6, #a855f7)`,
            }}
            onClick={onToggleViewMode}
            title="Click to toggle Animated 3D Canvas View"
          >
            <div className="w-full h-full rounded-full overflow-hidden relative">
              <img
                src="/src/assets/images/jiya_avatar_portrait_1794042240570.jpg"
                alt="JIYA AI 3D Assistant Avatar"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              {/* Holographic HUD Overlays */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent pointer-events-none" />
              <div
                className="absolute inset-0 border-2 rounded-full pointer-events-none animate-pulse"
                style={{ borderColor: currentMode.accentColor }}
              />
            </div>
          </div>
        )}

        {/* View mode toggle switch */}
        <button
          onClick={onToggleViewMode}
          className="absolute -bottom-2 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium tracking-tight bg-slate-900/90 text-slate-300 border border-slate-700/60 shadow-lg hover:border-purple-500/60 hover:text-white transition-all backdrop-blur-md"
        >
          {viewMode === '3d-canvas' ? (
            <>
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>HD Portrait</span>
            </>
          ) : (
            <>
              <Radio className="w-3 h-3 text-cyan-400" />
              <span>3D Motion</span>
            </>
          )}
        </button>
      </div>

      {/* Mode Tag & Status */}
      <div className="mt-2 flex flex-col items-center">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden="true">
            {currentMode.emoji}
          </span>
          <span className="text-base font-semibold text-white tracking-wide">
            JIYA AI · {currentMode.name}
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-0.5 text-center px-4 max-w-sm">
          {status === 'listening'
            ? 'Listening to your voice...'
            : status === 'speaking'
            ? 'Speaking with natural voice output...'
            : status === 'processing'
            ? 'Thinking and formulating response...'
            : currentMode.tagline}
        </p>
      </div>
    </div>
  );
};
