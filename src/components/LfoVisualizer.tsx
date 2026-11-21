import React, { useEffect, useRef } from 'react';
import { LfoShape } from '../types/synth';

interface LfoVisualizerProps {
  shape: LfoShape;
  rate: number; // Hz (0.05..24)
  delay: number; // s (0..2.5)
  toPitch: number; // 0..1 (VIB)
  toFilter: number; // 0..1 (WAH)
  toMorph: number; // 0..1 (WT MOD)
  compact?: boolean;
  onClick?: () => void;
}

const SHAPE_LABELS: Record<LfoShape, string> = {
  sine: 'SIN',
  triangle: 'TRI',
  saw: 'SAW',
  square: 'SQR',
  sampleHold: 'S&H',
};

function evalSampleHoldStep(stepIndex: number): number {
  // Deterministic hash in [-1, 1] per cycle index so S&H holds crisp flat plateaus
  const x = Math.sin(stepIndex * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export function sampleLfoWaveform(shape: LfoShape, phase: number): number {
  const frac = ((phase % 1) + 1) % 1;
  switch (shape) {
    case 'sine':
      return Math.sin(frac * Math.PI * 2);
    case 'triangle':
      if (frac < 0.25) return frac * 4;
      if (frac < 0.75) return 2 - frac * 4;
      return frac * 4 - 4;
    case 'saw':
      return 1 - frac * 2;
    case 'square':
      return frac < 0.5 ? 1 : -1;
    case 'sampleHold':
      return evalSampleHoldStep(Math.floor(phase));
  }
}

export const LfoVisualizer: React.FC<LfoVisualizerProps> = ({
  shape,
  rate,
  delay,
  toPitch,
  toFilter,
  toMorph,
  compact = false,
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ledRef = useRef<HTMLSpanElement | null>(null);
  const phaseRef = useRef<number>(0);
  const lastTimeRef = useRef<number | null>(null);

  const propsRef = useRef({ shape, rate, delay, toPitch, toFilter, toMorph, compact });
  propsRef.current = { shape, rate, delay, toPitch, toFilter, toMorph, compact };

  useEffect(() => {
    let rafId = 0;

    const render = (ts: number) => {
      const {
        shape: curShape,
        rate: curRate,
        delay: curDelay,
        toPitch: curVib,
        toFilter: curWah,
        toMorph: curMorph,
        compact: isCompact,
      } = propsRef.current;

      if (lastTimeRef.current === null) {
        lastTimeRef.current = ts;
      }
      const dt = Math.min(0.05, Math.max(0, (ts - lastTimeRef.current) / 1000));
      lastTimeRef.current = ts;

      // Advance continuous phase at live LFO Hz rate
      phaseRef.current += dt * curRate;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          const midY = h / 2;

          ctx.clearRect(0, 0, w, h);

          // Subtle oscilloscope zero-line & vertical grid
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, midY);
          ctx.lineTo(w, midY);
          ctx.stroke();

          if (!isCompact) {
            for (let gx = 1; gx < 6; gx++) {
              ctx.beginPath();
              ctx.moveTo((gx / 6) * w, 0);
              ctx.lineTo((gx / 6) * w, h);
              ctx.stroke();
            }
          }

          // Visible cycles scale gently with rate so slow LFOs show clear shape and fast LFOs show density
          const cyclesVisible = Math.max(1.5, Math.min(6.5, 1.5 + Math.log2(1 + curRate) * 1.15));
          const maxDepth = Math.max(curVib, curWah, curMorph);
          const amplitudePx = (h * 0.42) * (0.2 + 0.8 * maxDepth);

          // 1. Reference ghost waveform (shows pure LFO shape even when depth = 0)
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.24)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 2) {
            const p = phaseRef.current - ((w - x) / w) * cyclesVisible;
            const val = sampleLfoWaveform(curShape, p);
            const y = midY - val * (h * 0.36);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();

          // 2. Depth-scaled active modulation traces
          const drawDepthTrace = (depth: number, color: string, lineWidth: number, fadeDelay = false) => {
            if (depth <= 0.005) return;
            const amp = h * 0.42 * depth;
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            for (let x = 0; x <= w; x += 2) {
              const p = phaseRef.current - ((w - x) / w) * cyclesVisible;
              const val = sampleLfoWaveform(curShape, p);
              // Optional visual representation of LFO Delay fade-in envelope on VIB trace
              const delayFactor =
                fadeDelay && curDelay > 0.05
                  ? Math.min(1, Math.max(0.15, (x / w) / Math.min(0.85, curDelay / 2.5)))
                  : 1;
              const y = midY - val * amp * delayFactor;
              if (x === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
          };

          // Render individual depth channels (WAH cyan, WT MOD emerald, VIB amber)
          drawDepthTrace(curMorph, 'rgba(52, 211, 153, 0.8)', isCompact ? 1.2 : 1.6);
          drawDepthTrace(curWah, '#38bdf8', isCompact ? 1.5 : 2.0);
          drawDepthTrace(curVib, '#fbbf24', isCompact ? 1.4 : 1.8, true);

          // If no individual depth > 0, draw dimmed amplitude trace at base level
          if (maxDepth <= 0.005) {
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            for (let x = 0; x <= w; x += 2) {
              const p = phaseRef.current - ((w - x) / w) * cyclesVisible;
              const val = sampleLfoWaveform(curShape, p);
              const y = midY - val * amplitudePx;
              if (x === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
          }

          // 3. Live Phase Tracer Dot at right edge (current instantaneous modulation value)
          const nowVal = sampleLfoWaveform(curShape, phaseRef.current);
          const tracerAmp = maxDepth > 0.005 ? h * 0.42 * maxDepth : amplitudePx;
          const dotY = midY - nowVal * tracerAmp;
          const dotX = w - 4;

          ctx.fillStyle = maxDepth > 0.005 ? '#fbbf24' : '#38bdf8';
          ctx.beginPath();
          ctx.arc(dotX, dotY, isCompact ? 2.6 : 3.4, 0, Math.PI * 2);
          ctx.fill();

          // Update synced LFO rate LED opacity directly without triggering React re-renders
          if (ledRef.current) {
            const norm = (nowVal + 1) * 0.5;
            ledRef.current.style.opacity = String(0.2 + norm * 0.8);
          }
        }
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const rateText = rate < 1 ? `${rate.toFixed(2)}Hz` : `${rate.toFixed(1)}Hz`;

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Animated LFO Modulation Monitor (Click to open SEQ / LFO & Mod View)"
        className="relative z-20 w-full px-2 py-1 bg-[#030e21]/95 border-t border-sky-400/25 flex items-center justify-between gap-2 text-[8.5px] font-mono-tabular hover:bg-[#061838]/90 transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            ref={ledRef}
            className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]"
          />
          <span className="text-sky-300 font-bold">LFO</span>
          <span className="text-amber-300 font-semibold">{SHAPE_LABELS[shape]}</span>
          <span className="text-sky-100">{rateText}</span>
        </div>

        <div className="flex-1 h-[22px] bg-[#020814] border border-sky-500/25 rounded-[2px] overflow-hidden min-w-[90px]">
          <canvas ref={canvasRef} width={220} height={22} className="w-full h-full block" />
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-[8px]">
          <span className={toPitch > 0.005 ? 'text-amber-300 font-semibold' : 'text-sky-400/50'}>
            VIB:{Math.round(toPitch * 100)}%
          </span>
          <span className={toFilter > 0.005 ? 'text-sky-300 font-semibold' : 'text-sky-400/50'}>
            WAH:{Math.round(toFilter * 100)}%
          </span>
          <span className={toMorph > 0.005 ? 'text-emerald-300 font-semibold' : 'text-sky-400/50'}>
            WT:{Math.round(toMorph * 100)}%
          </span>
        </div>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 h-full">
      <div className="flex items-center justify-between text-[9px] font-mono-tabular">
        <div className="flex items-center gap-1.5">
          <span
            ref={ledRef}
            className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.95)]"
          />
          <span className="text-sky-200 font-semibold">
            LFO WAVEFORM · {SHAPE_LABELS[shape]} · {rateText}
          </span>
          {delay > 0.01 && <span className="text-amber-300">· DLY {delay.toFixed(2)}s</span>}
        </div>
        <div className="flex items-center gap-2 text-[8.5px]">
          <span className="text-amber-300">VIB {Math.round(toPitch * 100)}%</span>
          <span className="text-sky-300">WAH {Math.round(toFilter * 100)}%</span>
          <span className="text-emerald-300">WT {Math.round(toMorph * 100)}%</span>
        </div>
      </div>

      <div className="flex-1 min-h-[76px] bg-[#020a18] border border-sky-400/30 rounded-[3px] overflow-hidden">
        <canvas ref={canvasRef} width={420} height={86} className="w-full h-full block" />
      </div>
    </div>
  );
};
