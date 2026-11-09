import React, { useEffect, useRef } from 'react';
import { PersonalityMode, VoiceStatus } from '../types';
import { PERSONALITY_MODES } from '../constants/modes';
import { audioOutputManager } from '../services/speechService';

interface BorderLightFrameProps {
  status: VoiceStatus;
  mode: PersonalityMode;
  borderLightMode?: 'spectrum-bokeh' | 'persona-sync' | 'off';
}

interface BokehParticle {
  /** Normalized position along the perimeter (0 to 1) */
  t: number;
  /** Speed along perimeter */
  tSpeed: number;
  /** Base inward distance from the rounded border (in px) */
  inwardDist: number;
  /** Normalized inward layer (0 = yellow/orange edge, 0.35 = green, 0.65 = cyan, 1.0 = deep blue) */
  layerNorm: number;
  /** Particle radius */
  radius: number;
  /** Twinkle phase & speed */
  phase: number;
  pulseSpeed: number;
  /** Base alpha */
  baseAlpha: number;
  /** Radial drift offset phase */
  driftPhase: number;
}

/**
 * Helper to compute a point and inward normal on a rounded rectangle perimeter
 * parameterized by t in [0, 1).
 */
function getRoundedRectPointAndNormal(
  t: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): { px: number; py: number; nx: number; ny: number } {
  const straightW = Math.max(0, w - 2 * r);
  const straightH = Math.max(0, h - 2 * r);
  const arcLen = 0.5 * Math.PI * r;
  const totalLen = 2 * straightW + 2 * straightH + 4 * arcLen;

  let d = ((t % 1) + 1) % 1 * totalLen;

  // 1. Top edge (left to right)
  if (d < straightW) {
    return { px: x + r + d, py: y, nx: 0, ny: 1 };
  }
  d -= straightW;

  // 2. Top-right corner arc (-PI/2 to 0)
  if (d < arcLen) {
    const angle = -Math.PI / 2 + (d / arcLen) * (Math.PI / 2);
    const cx = x + w - r;
    const cy = y + r;
    return {
      px: cx + Math.cos(angle) * r,
      py: cy + Math.sin(angle) * r,
      nx: -Math.cos(angle),
      ny: -Math.sin(angle),
    };
  }
  d -= arcLen;

  // 3. Right edge (top to bottom)
  if (d < straightH) {
    return { px: x + w, py: y + r + d, nx: -1, ny: 0 };
  }
  d -= straightH;

  // 4. Bottom-right corner arc (0 to PI/2)
  if (d < arcLen) {
    const angle = (d / arcLen) * (Math.PI / 2);
    const cx = x + w - r;
    const cy = y + h - r;
    return {
      px: cx + Math.cos(angle) * r,
      py: cy + Math.sin(angle) * r,
      nx: -Math.cos(angle),
      ny: -Math.sin(angle),
    };
  }
  d -= arcLen;

  // 5. Bottom edge (right to left)
  if (d < straightW) {
    return { px: x + w - r - d, py: y + h, nx: 0, ny: -1 };
  }
  d -= straightW;

  // 6. Bottom-left corner arc (PI/2 to PI)
  if (d < arcLen) {
    const angle = Math.PI / 2 + (d / arcLen) * (Math.PI / 2);
    const cx = x + r;
    const cy = y + h - r;
    return {
      px: cx + Math.cos(angle) * r,
      py: cy + Math.sin(angle) * r,
      nx: -Math.cos(angle),
      ny: -Math.sin(angle),
    };
  }
  d -= arcLen;

  // 7. Left edge (bottom to top)
  if (d < straightH) {
    return { px: x, py: y + h - r - d, nx: 1, ny: 0 };
  }
  d -= straightH;

  // 8. Top-left corner arc (PI to 3PI/2)
  const angle = Math.PI + (Math.min(d, arcLen) / Math.max(1, arcLen)) * (Math.PI / 2);
  const cx = x + r;
  const cy = y + r;
  return {
    px: cx + Math.cos(angle) * r,
    py: cy + Math.sin(angle) * r,
    nx: -Math.cos(angle),
    ny: -Math.sin(angle),
  };
}

/**
 * Returns the exact RGB color matching the user's reference border-light image
 * based on normalized inward distance:
 * 0.00 - 0.22: Bright Golden Yellow / Amber (#ffe600 -> #ffae00)
 * 0.22 - 0.50: Neon Lime / Emerald Green (#66ff22 -> #00ff88)
 * 0.50 - 0.76: Glowing Cyan / Turquoise (#00f0ff -> #00b8ff)
 * 0.76 - 1.00: Electric Royal / Sapphire Blue (#1e90ff -> #2563eb)
 */
function getSpectrumColor(
  layerNorm: number,
  isPersonaSync: boolean,
  accentHex: string
): { r: number; g: number; b: number } {
  if (isPersonaSync) {
    // Parse accentHex
    const clean = accentHex.replace('#', '');
    const ar = parseInt(clean.substring(0, 2), 16) || 168;
    const ag = parseInt(clean.substring(2, 4), 16) || 85;
    const ab = parseInt(clean.substring(4, 6), 16) || 247;
    if (layerNorm < 0.3) {
      return { r: Math.min(255, ar + 60), g: Math.min(255, ag + 60), b: Math.min(255, ab + 60) };
    } else if (layerNorm < 0.65) {
      return { r: ar, g: ag, b: ab };
    }
    return { r: 56, g: 189, b: 248 };
  }

  if (layerNorm < 0.18) {
    // Fiery Gold-Yellow right next to the red-orange neon tube
    const u = layerNorm / 0.18;
    return {
      r: 255,
      g: Math.round(185 + u * 65), // 185 -> 250
      b: Math.round(10 + u * 20),
    };
  } else if (layerNorm < 0.46) {
    // Yellow-Green to vibrant Neon Green
    const u = (layerNorm - 0.18) / 0.28;
    return {
      r: Math.round(180 * (1 - u) + 25 * u),
      g: 255,
      b: Math.round(35 + u * 75),
    };
  } else if (layerNorm < 0.74) {
    // Neon Green to Aqua Cyan
    const u = (layerNorm - 0.46) / 0.28;
    return {
      r: Math.round(10 * (1 - u)),
      g: Math.round(250 - u * 45),
      b: Math.round(180 + u * 75),
    };
  } else {
    // Aqua Cyan to Deep Electric Blue inner sparkles
    const u = (layerNorm - 0.74) / 0.26;
    return {
      r: Math.round(20 + u * 25),
      g: Math.round(175 * (1 - u) + 95 * u),
      b: 255,
    };
  }
}

export const BorderLightFrame: React.FC<BorderLightFrameProps> = ({
  status,
  mode,
  borderLightMode = 'spectrum-bokeh',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (borderLightMode === 'off') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const updateDimensions = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    // Create particles matching the dense multi-band bokeh look in the reference image
    const isMobile = width < 640;
    const PARTICLE_COUNT = isMobile ? 340 : 520;
    const maxSpread = isMobile ? 54 : 74;

    const particles: BokehParticle[] = Array.from({ length: PARTICLE_COUNT }, () => {
      // Skew distribution so more particles cluster near the glowing border (yellow/green)
      // and fewer, smaller blue sparkles drift further inward, just like the photo!
      const randPow = Math.pow(Math.random(), 1.55);
      const inwardDist = 2 + randPow * maxSpread;
      const layerNorm = Math.min(1, inwardDist / maxSpread);

      // Particles closer to the edge are slightly larger bokeh orbs; inner blue ones are crisp stars/dots
      const sizeFactor = 1 - layerNorm * 0.45;
      const radius = (1.6 + Math.random() * 3.4) * sizeFactor;

      return {
        t: Math.random(),
        tSpeed: (Math.random() - 0.5) * 0.00025 + 0.00012,
        inwardDist,
        layerNorm,
        radius,
        phase: Math.random() * Math.PI * 2,
        pulseSpeed: 1.8 + Math.random() * 3.6,
        baseAlpha: 0.45 + Math.random() * 0.55,
        driftPhase: Math.random() * Math.PI * 2,
      };
    });

    let startTime = performance.now();

    const render = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      ctx.clearRect(0, 0, width, height);

      // Compute dynamic audio / voice activity boost
      let audioBoost = 0;
      if (status === 'speaking') {
        const freqData = audioOutputManager.getAudioFrequencyData();
        let avg = 0.25;
        if (freqData && freqData.length > 0) {
          let sum = 0;
          for (let k = 0; k < freqData.length; k++) {
            sum += freqData[k];
          }
          avg = sum / (freqData.length * 255);
        }
        audioBoost = 0.35 + avg * 0.85;
      } else if (status === 'listening') {
        audioBoost = 0.3 + 0.25 * Math.sin(elapsed * 5);
      } else if (status === 'processing' || status === 'generating_voice') {
        audioBoost = 0.25 + 0.2 * Math.sin(elapsed * 7);
      }

      const margin = isMobile ? 6 : 10;
      const rectX = margin;
      const rectY = margin;
      const rectW = width - margin * 2;
      const rectH = height - margin * 2;
      const cornerRadius = isMobile ? 28 : 34;

      const isPersonaSync = borderLightMode === 'persona-sync';
      const modeAccent = PERSONALITY_MODES[mode]?.accentColor || '#ff3300';
      const rimPrimary = isPersonaSync ? modeAccent : '#ff2a00';
      const rimSecondary = isPersonaSync ? modeAccent : '#ff7700';

      ctx.save();

      // 1. Draw the continuous glowing Red-Orange Rounded-Rectangle Rim (Outer & Inner Neon Tube)
      ctx.beginPath();
      ctx.roundRect(rectX, rectY, rectW, rectH, cornerRadius);

      // Outer deep red-orange halo bloom
      ctx.strokeStyle = rimPrimary;
      ctx.lineWidth = isMobile ? 5 : 6.5;
      ctx.shadowColor = rimPrimary;
      ctx.shadowBlur = (isMobile ? 18 : 26) + audioBoost * 16;
      ctx.globalAlpha = 0.92;
      ctx.stroke();

      // Second pass for warm orange-gold inner edge glow
      ctx.strokeStyle = rimSecondary;
      ctx.lineWidth = isMobile ? 2.8 : 3.5;
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 12 + audioBoost * 10;
      ctx.globalAlpha = 0.95;
      ctx.stroke();

      // Hot bright core filament
      ctx.strokeStyle = isPersonaSync ? '#ffffff' : '#ffdd88';
      ctx.lineWidth = 1.2;
      ctx.shadowBlur = 4;
      ctx.globalAlpha = 0.85;
      ctx.stroke();

      // 2. Render Additive Bokeh Particles along all 4 edges & corners
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = 0;

      const speedMultiplier = 1 + audioBoost * 1.8;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.t = (p.t + p.tSpeed * speedMultiplier) % 1;

        // Subtle breathing inward/outward motion
        const dynamicInward =
          p.inwardDist +
          Math.sin(elapsed * 1.6 + p.driftPhase) * 3.5 +
          audioBoost * (p.layerNorm * 10);

        const { px, py, nx, ny } = getRoundedRectPointAndNormal(
          p.t,
          rectX,
          rectY,
          rectW,
          rectH,
          cornerRadius
        );

        // Tangential jitter so particles don't sit on rigid lines
        const jitter = Math.cos(p.phase * 3.7) * 2.5;
        const x = px + nx * dynamicInward - ny * jitter;
        const y = py + ny * dynamicInward + nx * jitter;

        // Twinkle alpha calculation
        const twinkle = 0.55 + 0.45 * Math.sin(elapsed * p.pulseSpeed + p.phase);
        const distanceFade = 1 - Math.pow(p.layerNorm, 1.85) * 0.45;
        const alpha = Math.min(1, p.baseAlpha * twinkle * distanceFade * (1 + audioBoost * 0.35));

        if (alpha < 0.06) continue;

        const { r, g, b } = getSpectrumColor(p.layerNorm, isPersonaSync, modeAccent);
        const currentRadius = p.radius * (0.85 + 0.3 * twinkle + audioBoost * 0.25);

        // Soft outer bokeh glow circle
        ctx.beginPath();
        ctx.arc(x, y, currentRadius * 2.1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(alpha * 0.26).toFixed(3)})`;
        ctx.fill();

        // Crisp glowing bokeh orb
        ctx.beginPath();
        ctx.arc(x, y, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
        ctx.fill();

        // Bright white-hot sparkle center for prominent bokeh dots
        if (twinkle > 0.82 && currentRadius > 2.1) {
          ctx.beginPath();
          ctx.arc(x, y, currentRadius * 0.42, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${(alpha * 0.75).toFixed(3)})`;
          ctx.fill();
        }
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', updateDimensions);
    };
  }, [status, mode, borderLightMode]);

  if (borderLightMode === 'off') return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[60] overflow-hidden"
      aria-hidden="true"
    >
      {/* Ambient soft inner vignette glow along screen perimeter */}
      <div
        className="absolute inset-0 rounded-[28px] sm:rounded-[34px] m-[6px] sm:m-[10px]"
        style={{
          boxShadow:
            borderLightMode === 'persona-sync'
              ? `inset 0 0 28px ${PERSONALITY_MODES[mode]?.accentColor || '#a855f7'}44, 0 0 20px ${
                  PERSONALITY_MODES[mode]?.accentColor || '#a855f7'
                }55`
              : 'inset 0 0 26px rgba(255, 68, 0, 0.28), inset 0 0 55px rgba(0, 255, 128, 0.10), 0 0 24px rgba(255, 42, 0, 0.45)',
        }}
      />
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
