import React, { useRef, useState } from 'react';
import { ParamKey } from '../types/synth';
import { PARAMETER_DESCRIPTORS, formatParamValue } from '../data/wavetables';

interface RotaryKnobProps {
  paramKey: ParamKey;
  value: number;
  onChange: (key: ParamKey, val: number) => void;
  onFocusParam?: (key: ParamKey) => void;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  midiLearnActive?: boolean;
  isLearnTarget?: boolean;
  mappedCc?: number;
  onSelectForMidiLearn?: (key: ParamKey) => void;
  bipolar?: boolean;
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({
  paramKey,
  value,
  onChange,
  onFocusParam,
  label,
  size = 'md',
  midiLearnActive = false,
  isLearnTarget = false,
  mappedCc,
  onSelectForMidiLearn,
  bipolar = false,
}) => {
  const desc = PARAMETER_DESCRIPTORS[paramKey];
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);
  const startNormRef = useRef(0);

  const toNormalized = (val: number): number => {
    if (desc.curve === 'log' && desc.min > 0) {
      const clamped = Math.max(desc.min, Math.min(desc.max, val));
      return Math.log(clamped / desc.min) / Math.log(desc.max / desc.min);
    }
    return (Math.max(desc.min, Math.min(desc.max, val)) - desc.min) / (desc.max - desc.min);
  };

  const fromNormalized = (norm: number): number => {
    const n = Math.max(0, Math.min(1, norm));
    if (desc.curve === 'log' && desc.min > 0) {
      return desc.min * Math.pow(desc.max / desc.min, n);
    }
    const raw = desc.min + n * (desc.max - desc.min);
    return Math.round(raw / desc.step) * desc.step;
  };

  const norm = toNormalized(value);
  const angleDeg = -135 + norm * 270;

  const sizePx = size === 'sm' ? 32 : size === 'lg' ? 46 : 38;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (midiLearnActive && onSelectForMidiLearn) {
      onSelectForMidiLearn(paramKey);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    startYRef.current = e.clientY;
    startNormRef.current = norm;
    onFocusParam?.(paramKey);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const sensitivity = e.shiftKey ? 360 : 145;
    const delta = (startYRef.current - e.clientY) / sensitivity;
    const nextVal = fromNormalized(startNormRef.current + delta);
    onChange(paramKey, nextVal);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) {
      setDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const stepScale = e.shiftKey ? 0.01 : 0.035;
    const dir = e.deltaY < 0 ? 1 : -1;
    const nextVal = fromNormalized(norm + dir * stepScale);
    onChange(paramKey, nextVal);
    onFocusParam?.(paramKey);
  };

  const handleDoubleClick = () => {
    onChange(paramKey, desc.defaultValue);
    onFocusParam?.(paramKey);
  };

  const displayLabel = label ?? desc.shortLabel;
  const formatted = formatParamValue(desc, value);

  // Arc math for crisp indicator ring around knob
  const r = sizePx / 2 + 4;
  const cx = sizePx / 2 + 6;
  const cy = sizePx / 2 + 6;
  const startAngle = (-135 - 90) * (Math.PI / 180);
  const zeroAngle = bipolar ? -90 * (Math.PI / 180) : startAngle;
  const curAngle = (angleDeg - 90) * (Math.PI / 180);

  const arcPath = (a1: number, a2: number) => {
    const start = Math.min(a1, a2);
    const end = Math.max(a1, a2);
    if (Math.abs(end - start) < 0.01) return '';
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const largeArc = end - start > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  return (
    <div
      className="flex flex-col items-center select-none group relative"
      title={`${desc.label}: ${formatted}${mappedCc !== undefined ? ` (MIDI CC ${mappedCc})` : ''} — Drag or scroll, double-click to reset`}
    >
      <div
        role="slider"
        tabIndex={0}
        aria-label={desc.label}
        aria-valuemin={desc.min}
        aria-valuemax={desc.max}
        aria-valuenow={Number(value.toFixed(3))}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            onChange(paramKey, fromNormalized(norm + 0.04));
            onFocusParam?.(paramKey);
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            onChange(paramKey, fromNormalized(norm - 0.04));
            onFocusParam?.(paramKey);
          }
        }}
        className={`relative flex items-center justify-center cursor-ns-resize rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
          isLearnTarget
            ? 'ring-2 ring-amber-400 animate-pulse'
            : midiLearnActive
            ? 'ring-1 ring-amber-300/70 hover:ring-amber-400'
            : ''
        }`}
        style={{ width: sizePx + 12, height: sizePx + 12 }}
      >
        {/* Calibration Dial Scale + Value Arc */}
        <svg
          width={sizePx + 12}
          height={sizePx + 12}
          className="absolute inset-0 pointer-events-none"
        >
          {/* 9 calibration tick dots around arc */}
          {Array.from({ length: 9 }, (_, idx) => {
            const tickAngle = (-135 + (idx / 8) * 270 - 90) * (Math.PI / 180);
            const tx = cx + (r + 1) * Math.cos(tickAngle);
            const ty = cy + (r + 1) * Math.sin(tickAngle);
            return (
              <circle
                key={idx}
                cx={tx}
                cy={ty}
                r={idx === 0 || idx === 4 || idx === 8 ? 1.25 : 0.85}
                fill="rgba(255,255,255,0.62)"
              />
            );
          })}
          {/* Active arc */}
          <path
            d={arcPath(zeroAngle, curAngle)}
            fill="none"
            stroke={isLearnTarget ? '#fbbf24' : '#38bdf8'}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.9}
          />
        </svg>

        {/* Recessed Dark Collar */}
        <div
          className="rounded-full bg-[#09182e] border border-black/60 flex items-center justify-center shadow-inner"
          style={{ width: sizePx + 2, height: sizePx + 2 }}
        >
          {/* Fluted Brushed-Aluminum Knob */}
          <div
            className="relative rounded-full audity-knob-body flex items-center justify-center transition-transform duration-75"
            style={{
              width: sizePx - 2,
              height: sizePx - 2,
              transform: `rotate(${angleDeg}deg)`,
            }}
          >
            <div className="absolute inset-0 rounded-full audity-knob-flutes opacity-75" />
            {/* Inner machined top cap */}
            <div
              className="relative rounded-full audity-knob-cap flex items-start justify-center"
              style={{
                width: Math.round((sizePx - 2) * 0.68),
                height: Math.round((sizePx - 2) * 0.68),
              }}
            >
              {/* Crisp dark pointer notch */}
              <div
                className="bg-[#0f172a] rounded-full mt-[2px]"
                style={{
                  width: 2.2,
                  height: Math.round((sizePx - 2) * 0.28),
                }}
              />
            </div>
          </div>
        </div>

        {/* Optional CC Tag when MIDI Learn mode is on or hovered */}
        {mappedCc !== undefined && (midiLearnActive || dragging) && (
          <span className="absolute -top-2 -right-2 px-1 py-0.5 text-[9px] font-mono-tabular font-semibold bg-amber-400 text-slate-950 rounded leading-none shadow">
            CC{mappedCc}
          </span>
        )}
      </div>

      <span className="mt-0.5 text-[9.5px] font-semibold tracking-wider text-white/95 uppercase whitespace-nowrap leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
        {displayLabel}
      </span>
      <span
        className={`text-[9px] font-mono-tabular leading-tight transition-colors ${
          dragging ? 'text-amber-300 font-semibold' : 'text-sky-100/85'
        }`}
      >
        {formatted}
      </span>
    </div>
  );
};
