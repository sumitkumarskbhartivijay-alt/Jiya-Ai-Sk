import React, { useEffect, useRef } from 'react';
import { PersonalityMode, VoiceStatus } from '../types';
import { audioOutputManager } from '../services/speechService';

interface CrystalPrismBackgroundProps {
  status: VoiceStatus;
  mode: PersonalityMode;
}

interface CrystalVertex {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  ampX: number;
  ampY: number;
  speedX: number;
  speedY: number;
  phaseX: number;
  phaseY: number;
}

interface CrystalTriangle {
  i0: number;
  i1: number;
  i2: number;
  shade: number;
  shimmerPhase: number;
  shimmerSpeed: number;
}

interface CrystalEdge {
  a: number;
  b: number;
  colorType: 'cyan' | 'red' | 'blend';
  pulseOffset: number;
  pulseSpeed: number;
}

interface StarSpeck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  glowColor: string;
  alpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

export const CrystalPrismBackground: React.FC<CrystalPrismBackgroundProps> = ({
  status,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef<VoiceStatus>(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;

    let vertices: CrystalVertex[] = [];
    let triangles: CrystalTriangle[] = [];
    let edges: CrystalEdge[] = [];
    let specks: StarSpeck[] = [];

    const buildCrystalGeometry = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const isMobile = width < 640;
      const cols = isMobile ? 5 : 8;
      const rows = isMobile ? 7 : 8;
      const cellW = width / (cols - 1);
      const cellH = height / (rows - 1);

      vertices = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const isBorderR = r === 0 || r === rows - 1;
          const isBorderC = c === 0 || c === cols - 1;
          const jitterX = isBorderC ? 0 : (Math.random() - 0.5) * cellW * 0.68;
          const jitterY = isBorderR ? 0 : (Math.random() - 0.5) * cellH * 0.68;
          const bx = c * cellW + jitterX;
          const by = r * cellH + jitterY;

          vertices.push({
            baseX: bx,
            baseY: by,
            x: bx,
            y: by,
            ampX: isBorderC ? 3 : 8 + Math.random() * 14,
            ampY: isBorderR ? 3 : 8 + Math.random() * 14,
            speedX: 0.35 + Math.random() * 0.55,
            speedY: 0.35 + Math.random() * 0.55,
            phaseX: Math.random() * Math.PI * 2,
            phaseY: Math.random() * Math.PI * 2,
          });
        }
      }

      triangles = [];
      const edgeMap = new Map<string, CrystalEdge>();

      const addEdge = (u: number, v: number) => {
        const minIdx = Math.min(u, v);
        const maxIdx = Math.max(u, v);
        const key = `${minIdx}_${maxIdx}`;
        if (edgeMap.has(key)) return;

        const midX = (vertices[u].baseX + vertices[v].baseX) * 0.5;
        const midY = (vertices[u].baseY + vertices[v].baseY) * 0.5;
        // Diagonal split matching the uploaded image: left/bottom-left is electric cyan-blue, right/top-right is crimson-red
        const normX = midX / Math.max(1, width);
        const normY = midY / Math.max(1, height);
        const diagBias = normX * 0.65 + (1 - normY) * 0.35;

        let colorType: 'cyan' | 'red' | 'blend' = 'blend';
        if (diagBias < 0.44) {
          colorType = 'cyan';
        } else if (diagBias > 0.54) {
          colorType = 'red';
        } else {
          colorType = Math.random() > 0.5 ? 'cyan' : 'red';
        }

        edgeMap.set(key, {
          a: minIdx,
          b: maxIdx,
          colorType,
          pulseOffset: Math.random() * Math.PI * 2,
          pulseSpeed: 0.8 + Math.random() * 1.4,
        });
      };

      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const i00 = r * cols + c;
          const i10 = r * cols + (c + 1);
          const i01 = (r + 1) * cols + c;
          const i11 = (r + 1) * cols + (c + 1);

          if ((r + c) % 2 === 0) {
            triangles.push({
              i0: i00,
              i1: i10,
              i2: i11,
              shade: 0.02 + Math.random() * 0.06,
              shimmerPhase: Math.random() * Math.PI * 2,
              shimmerSpeed: 0.4 + Math.random() * 0.7,
            });
            triangles.push({
              i0: i00,
              i1: i11,
              i2: i01,
              shade: 0.02 + Math.random() * 0.06,
              shimmerPhase: Math.random() * Math.PI * 2,
              shimmerSpeed: 0.4 + Math.random() * 0.7,
            });
            addEdge(i00, i10);
            addEdge(i10, i11);
            addEdge(i00, i11);
            addEdge(i11, i01);
            addEdge(i01, i00);
          } else {
            triangles.push({
              i0: i00,
              i1: i10,
              i2: i01,
              shade: 0.02 + Math.random() * 0.06,
              shimmerPhase: Math.random() * Math.PI * 2,
              shimmerSpeed: 0.4 + Math.random() * 0.7,
            });
            triangles.push({
              i0: i10,
              i1: i11,
              i2: i01,
              shade: 0.02 + Math.random() * 0.06,
              shimmerPhase: Math.random() * Math.PI * 2,
              shimmerSpeed: 0.4 + Math.random() * 0.7,
            });
            addEdge(i00, i10);
            addEdge(i10, i01);
            addEdge(i01, i00);
            addEdge(i10, i11);
            addEdge(i11, i01);
          }
        }
      }

      edges = Array.from(edgeMap.values());

      // Generate twinkling stardust specks inside the crystal facets (cyan, electric blue, crimson red, magenta-pink)
      const speckCount = isMobile ? 130 : 220;
      const palette = [
        { core: 'rgba(180, 245, 255, 0.95)', glow: 'rgba(0, 210, 255, 0.55)' },
        { core: 'rgba(90, 185, 255, 0.95)', glow: 'rgba(30, 110, 255, 0.55)' },
        { core: 'rgba(255, 160, 175, 0.95)', glow: 'rgba(255, 25, 65, 0.55)' },
        { core: 'rgba(255, 110, 90, 0.95)', glow: 'rgba(255, 50, 0, 0.55)' },
        { core: 'rgba(235, 170, 255, 0.9)', glow: 'rgba(190, 50, 255, 0.45)' },
      ];

      specks = Array.from({ length: speckCount }, () => {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const bias = px / Math.max(1, width);
        // Bias cyan/blue specks toward left/bottom and red/pink specks toward right/top, with natural mixing
        let colorPick = palette[Math.floor(Math.random() * palette.length)];
        if (Math.random() < 0.65) {
          colorPick =
            bias < 0.48
              ? palette[Math.random() < 0.6 ? 0 : 1]
              : palette[Math.random() < 0.6 ? 2 : 3];
        }

        return {
          x: px,
          y: py,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22 - 0.05,
          radius: 0.9 + Math.random() * 2.2,
          color: colorPick.core,
          glowColor: colorPick.glow,
          alpha: 0.35 + Math.random() * 0.65,
          twinkleSpeed: 1.5 + Math.random() * 3.2,
          twinklePhase: Math.random() * Math.PI * 2,
        };
      });
    };

    buildCrystalGeometry();
    window.addEventListener('resize', buildCrystalGeometry);

    const startTime = performance.now();

    const render = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      ctx.clearRect(0, 0, width, height);

      // Dynamic voice / status energy reactivity
      const currentStatus = statusRef.current;
      let energyBoost = 0;
      if (currentStatus === 'speaking') {
        const freqData = audioOutputManager.getAudioFrequencyData();
        let avg = 0.22;
        if (freqData && freqData.length > 0) {
          let sum = 0;
          for (let k = 0; k < freqData.length; k++) {
            sum += freqData[k];
          }
          avg = sum / (freqData.length * 255);
        }
        energyBoost = 0.35 + avg * 0.9;
      } else if (currentStatus === 'listening') {
        energyBoost = 0.25 + 0.2 * Math.sin(elapsed * 4.2);
      } else if (currentStatus === 'processing' || currentStatus === 'generating_voice') {
        energyBoost = 0.22 + 0.18 * Math.sin(elapsed * 6);
      }

      const speedFactor = 1 + energyBoost * 0.65;

      // 1. Update animated crystal vertex positions
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        v.x =
          v.baseX +
          Math.sin(elapsed * v.speedX * speedFactor + v.phaseX) *
            v.ampX *
            (1 + energyBoost * 0.3);
        v.y =
          v.baseY +
          Math.cos(elapsed * v.speedY * speedFactor + v.phaseY) *
            v.ampY *
            (1 + energyBoost * 0.3);
      }

      // 2. Render subtle shimmering crystal facets
      ctx.save();
      for (let i = 0; i < triangles.length; i++) {
        const tri = triangles[i];
        const v0 = vertices[tri.i0];
        const v1 = vertices[tri.i1];
        const v2 = vertices[tri.i2];

        const shimmer =
          0.5 + 0.5 * Math.sin(elapsed * tri.shimmerSpeed + tri.shimmerPhase);
        const cx = (v0.x + v1.x + v2.x) / 3;
        const isRightSide = cx > width * 0.5;

        ctx.beginPath();
        ctx.moveTo(v0.x, v0.y);
        ctx.lineTo(v1.x, v1.y);
        ctx.lineTo(v2.x, v2.y);
        ctx.closePath();

        const facetAlpha = (tri.shade + shimmer * 0.045) * (1 + energyBoost * 0.4);
        ctx.fillStyle = isRightSide
          ? `rgba(45, 6, 18, ${facetAlpha.toFixed(3)})`
          : `rgba(4, 18, 42, ${facetAlpha.toFixed(3)})`;
        ctx.fill();
      }
      ctx.restore();

      // 3. Render glowing Neon Red & Electric Cyan-Blue crystal facet edges + travelling laser pulses
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';

      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const va = vertices[edge.a];
        const vb = vertices[edge.b];

        const pulse =
          0.55 +
          0.45 *
            Math.sin(
              elapsed * edge.pulseSpeed * (1 + energyBoost * 0.8) +
                edge.pulseOffset
            );
        const alpha = (0.28 + pulse * 0.46) * (1 + energyBoost * 0.35);

        const glowColor =
          edge.colorType === 'cyan'
            ? `rgba(0, 215, 255, ${(alpha * 0.55).toFixed(3)})`
            : `rgba(255, 30, 60, ${(alpha * 0.55).toFixed(3)})`;

        const coreColor =
          edge.colorType === 'cyan'
            ? `rgba(155, 245, 255, ${Math.min(1, alpha * 0.95).toFixed(3)})`
            : `rgba(255, 145, 130, ${Math.min(1, alpha * 0.95).toFixed(3)})`;

        // Outer neon bloom along crystal seam
        ctx.beginPath();
        ctx.moveTo(va.x, va.y);
        ctx.lineTo(vb.x, vb.y);
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 3.8 + energyBoost * 2.2;
        ctx.stroke();

        // Crisp inner laser filament
        ctx.beginPath();
        ctx.moveTo(va.x, va.y);
        ctx.lineTo(vb.x, vb.y);
        ctx.strokeStyle = coreColor;
        ctx.lineWidth = 1.15 + energyBoost * 0.6;
        ctx.stroke();

        // Travelling light packet along the crystal edge
        const packetT =
          ((elapsed * edge.pulseSpeed * 0.32 + edge.pulseOffset) % 1 + 1) % 1;
        const px = va.x + (vb.x - va.x) * packetT;
        const py = va.y + (vb.y - va.y) * packetT;

        ctx.beginPath();
        ctx.arc(px, py, 2.2 + energyBoost * 1.4, 0, Math.PI * 2);
        ctx.fillStyle =
          edge.colorType === 'cyan'
            ? 'rgba(180, 250, 255, 0.78)'
            : 'rgba(255, 190, 175, 0.78)';
        ctx.fill();
      }

      // 4. Render vertex intersection star flares
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        const flare = 0.5 + 0.5 * Math.sin(elapsed * 2.4 + v.phaseX);
        if (flare < 0.35) continue;

        const isRedSide = v.x > width * 0.48;
        const rOuter = (3.5 + flare * 3.5) * (1 + energyBoost * 0.4);

        ctx.beginPath();
        ctx.arc(v.x, v.y, rOuter, 0, Math.PI * 2);
        ctx.fillStyle = isRedSide
          ? `rgba(255, 45, 75, ${(flare * 0.38).toFixed(3)})`
          : `rgba(0, 210, 255, ${(flare * 0.38).toFixed(3)})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(v.x, v.y, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${(flare * 0.85).toFixed(3)})`;
        ctx.fill();
      }

      // 5. Render twinkling micro-stardust bokeh specks inside the dark crystal facets
      for (let i = 0; i < specks.length; i++) {
        const s = specks[i];
        s.x += s.vx * (1 + energyBoost * 1.2);
        s.y += s.vy * (1 + energyBoost * 1.2);

        if (s.x < 0) s.x = width;
        if (s.x > width) s.x = 0;
        if (s.y < 0) s.y = height;
        if (s.y > height) s.y = 0;

        const twinkle =
          0.4 + 0.6 * Math.sin(elapsed * s.twinkleSpeed + s.twinklePhase);
        const curRadius = s.radius * (0.8 + 0.35 * twinkle + energyBoost * 0.25);

        // Outer bokeh halo
        ctx.beginPath();
        ctx.arc(s.x, s.y, curRadius * 2.4, 0, Math.PI * 2);
        ctx.fillStyle = s.glowColor;
        ctx.globalAlpha = s.alpha * twinkle * 0.55;
        ctx.fill();

        // Bright core speck
        ctx.beginPath();
        ctx.arc(s.x, s.y, curRadius, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.globalAlpha = Math.min(1, s.alpha * twinkle * 1.1);
        ctx.fill();
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', buildCrystalGeometry);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#04060e]"
      aria-hidden="true"
    >
      {/* Keyframe animations for slow crystal background motion */}
      <style>{`
        @keyframes jiyaCrystalDrift {
          0% {
            transform: scale(1.08) translate3d(0px, 0px, 0px) rotate(0deg);
            filter: saturate(1.15) brightness(0.82);
          }
          50% {
            transform: scale(1.16) translate3d(-12px, -10px, 0px) rotate(1.2deg);
            filter: saturate(1.35) brightness(0.95);
          }
          100% {
            transform: scale(1.08) translate3d(0px, 0px, 0px) rotate(0deg);
            filter: saturate(1.15) brightness(0.82);
          }
        }
        @keyframes jiyaCrystalPulseGlow {
          0%, 100% {
            opacity: 0.52;
            transform: scale(1.04);
          }
          50% {
            opacity: 0.74;
            transform: scale(1.11);
          }
        }
      `}</style>

      {/* Base Uploaded Neon Crystal Wallpaper with Smooth Continuous Animation */}
      <img
        src="/assets/aistudio/images_e597f303.jpeg"
        alt=""
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover select-none"
        style={{
          animation: 'jiyaCrystalDrift 18s ease-in-out infinite',
          willChange: 'transform, filter',
        }}
      />

      {/* Secondary soft-blended depth layer for holographic crystal refraction */}
      <div
        className="absolute inset-0 bg-cover bg-center mix-blend-screen pointer-events-none"
        style={{
          backgroundImage: `url('/assets/aistudio/images_e597f303.jpeg')`,
          animation: 'jiyaCrystalPulseGlow 9s ease-in-out infinite',
          willChange: 'transform, opacity',
        }}
      />

      {/* Interactive Real-Time Animated Crystal Facets, Laser Edges & Stardust Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block mix-blend-screen opacity-90"
      />

      {/* Balanced Dark Scrim so foreground UI & text stay crisp while crystal neon shines through */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(4, 7, 17, 0.28) 0%, rgba(4, 6, 14, 0.56) 70%, rgba(3, 5, 12, 0.72) 100%)',
        }}
      />
    </div>
  );
};
