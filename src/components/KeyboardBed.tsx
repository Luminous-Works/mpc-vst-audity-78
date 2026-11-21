import React, { useState, useRef } from 'react';

interface KeyboardBedProps {
  baseOctave: number;
  onOctaveChange: (oct: number) => void;
  activeNotes: Set<number>;
  onNoteOn: (note: number, velocity?: number) => void;
  onNoteOff: (note: number) => void;
  pitchBend: number;
  onPitchBend: (semis: number) => void;
  modWheel: number;
  onModWheel: (val: number) => void;
  sustainHeld: boolean;
  onToggleSustain: () => void;
  onPanic: () => void;
}

const WHITE_KEY_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_KEY_DEFS = [
  { offset: 1, leftSlot: 0.68 },
  { offset: 3, leftSlot: 1.72 },
  { offset: 6, leftSlot: 3.66 },
  { offset: 8, leftSlot: 4.7 },
  { offset: 10, leftSlot: 5.74 },
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const KeyboardBed: React.FC<KeyboardBedProps> = ({
  baseOctave,
  onOctaveChange,
  activeNotes,
  onNoteOn,
  onNoteOff,
  pitchBend,
  onPitchBend,
  modWheel,
  onModWheel,
  sustainHeld,
  onToggleSustain,
  onPanic,
}) => {
  // Display 5 octaves (61 keys like the 1978 Audity hardware!)
  const numOctaves = 5;
  const startMidi = (baseOctave + 1) * 12; // baseOctave=2 -> C2 (36) .. C7 (96)
  const [pointerDownNote, setPointerDownNote] = useState<number | null>(null);
  const wheelDraggingRef = useRef<'pitch' | 'mod' | null>(null);

  const whiteKeys: number[] = [];
  for (let oct = 0; oct < numOctaves; oct++) {
    for (const off of WHITE_KEY_OFFSETS) {
      whiteKeys.push(startMidi + oct * 12 + off);
    }
  }
  whiteKeys.push(startMidi + numOctaves * 12); // Top C

  const totalWhite = whiteKeys.length; // 36 white keys + 25 black = 61 keys

  const blackKeys: Array<{ midi: number; leftPct: number }> = [];
  for (let oct = 0; oct < numOctaves; oct++) {
    for (const b of BLACK_KEY_DEFS) {
      const slot = oct * 7 + b.leftSlot;
      blackKeys.push({
        midi: startMidi + oct * 12 + b.offset,
        leftPct: (slot / totalWhite) * 100,
      });
    }
  }

  const triggerNoteDown = (midi: number) => {
    if (pointerDownNote !== null && pointerDownNote !== midi) {
      onNoteOff(pointerDownNote);
    }
    setPointerDownNote(midi);
    onNoteOn(midi, 0.86);
  };

  const triggerNoteUp = (midi: number) => {
    onNoteOff(midi);
    if (pointerDownNote === midi) {
      setPointerDownNote(null);
    }
  };

  return (
    <div className="walnut-wood px-3 pt-2 pb-3 rounded-b-lg border-t-2 border-[#2a1509] shadow-2xl">
      <div className="flex items-stretch gap-2.5 bg-[#191412] p-2 rounded border border-black/70 shadow-inner">
        {/* Left-Hand Controller Block (authentic 1978 Audity left cheek console) */}
        <div className="w-[168px] shrink-0 bg-gradient-to-b from-[#cfd6df] to-[#98a3b2] rounded-[4px] border border-slate-900/80 p-2 flex flex-col justify-between shadow-inner">
          <div className="flex items-center justify-between border-b border-slate-700/30 pb-1">
            <span className="text-[9px] font-bold tracking-wider text-slate-900 uppercase">
              Performance
            </span>
            <span className="text-[9px] font-mono-tabular font-semibold text-slate-800">
              OCT C{baseOctave}
            </span>
          </div>

          {/* Pitch & Mod Wheels */}
          <div className="flex items-center justify-around gap-2 my-1">
            {/* Pitch Wheel */}
            <div className="flex flex-col items-center gap-1">
              <div
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  wheelDraggingRef.current = 'pitch';
                }}
                onPointerMove={(e) => {
                  if (wheelDraggingRef.current !== 'pitch') return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const rel = 1 - (e.clientY - rect.top) / rect.height;
                  const clamped = Math.max(0, Math.min(1, rel));
                  onPitchBend((clamped - 0.5) * 4); // +-2 semitones
                }}
                onPointerUp={() => {
                  wheelDraggingRef.current = null;
                  onPitchBend(0); // Spring return
                }}
                className="w-7 h-16 bg-[#11151d] rounded border border-slate-700 relative overflow-hidden cursor-ns-resize shadow-inner"
                title="Pitch Bend Wheel (spring return)"
              >
                <div
                  className="absolute inset-x-0.5 h-3 bg-gradient-to-b from-slate-300 via-slate-500 to-slate-700 rounded-xs border border-black/60"
                  style={{
                    top: `${(1 - (pitchBend / 4 + 0.5)) * 78}%`,
                  }}
                />
              </div>
              <span className="text-[8px] font-bold text-slate-800 uppercase">Pitch</span>
            </div>

            {/* Mod Wheel */}
            <div className="flex flex-col items-center gap-1">
              <div
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  wheelDraggingRef.current = 'mod';
                  const rect = e.currentTarget.getBoundingClientRect();
                  const rel = 1 - (e.clientY - rect.top) / rect.height;
                  onModWheel(Math.max(0, Math.min(1, rel)));
                }}
                onPointerMove={(e) => {
                  if (wheelDraggingRef.current !== 'mod') return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const rel = 1 - (e.clientY - rect.top) / rect.height;
                  onModWheel(Math.max(0, Math.min(1, rel)));
                }}
                onPointerUp={() => {
                  wheelDraggingRef.current = null;
                }}
                className="w-7 h-16 bg-[#11151d] rounded border border-slate-700 relative overflow-hidden cursor-ns-resize shadow-inner"
                title="Modulation Wheel (CC 1)"
              >
                <div
                  className="absolute inset-x-0.5 h-3 bg-gradient-to-b from-sky-300 via-sky-500 to-sky-700 rounded-xs border border-black/60"
                  style={{
                    top: `${(1 - modWheel) * 78}%`,
                  }}
                />
              </div>
              <span className="text-[8px] font-bold text-slate-800 uppercase">Mod</span>
            </div>
          </div>

          {/* Octave & Hold Controls */}
          <div className="grid grid-cols-4 gap-1 pt-1 border-t border-slate-700/25">
            <button
              type="button"
              onClick={() => onOctaveChange(Math.max(0, baseOctave - 1))}
              className="py-1 bg-slate-800 hover:bg-slate-700 text-white text-[9px] font-mono-tabular font-semibold rounded-[2px] cursor-pointer"
              title="Octave Down"
            >
              -OCT
            </button>
            <button
              type="button"
              onClick={() => onOctaveChange(Math.min(4, baseOctave + 1))}
              className="py-1 bg-slate-800 hover:bg-slate-700 text-white text-[9px] font-mono-tabular font-semibold rounded-[2px] cursor-pointer"
              title="Octave Up"
            >
              +OCT
            </button>
            <button
              type="button"
              onClick={onToggleSustain}
              className={`py-1 text-[9px] font-mono-tabular font-semibold rounded-[2px] cursor-pointer transition-colors ${
                sustainHeld
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
              title="Hold / Sustain Pedal"
            >
              HOLD
            </button>
            <button
              type="button"
              onClick={onPanic}
              className="py-1 bg-rose-800 hover:bg-rose-700 text-white text-[9px] font-mono-tabular font-semibold rounded-[2px] cursor-pointer"
              title="All Notes Off (MIDI Panic)"
            >
              CLR
            </button>
          </div>
        </div>

        {/* 61-Key Velocity Keyboard */}
        <div
          className="relative flex-1 h-[118px] select-none bg-[#0b0d11] rounded-[3px] overflow-hidden border-t-4 border-[#111]"
          onPointerLeave={() => {
            if (pointerDownNote !== null) {
              onNoteOff(pointerDownNote);
              setPointerDownNote(null);
            }
          }}
        >
          {/* White Keys */}
          <div className="flex h-full w-full">
            {whiteKeys.map((midi) => {
              const isActive = activeNotes.has(midi);
              const noteName = NOTE_NAMES[midi % 12];
              const octNum = Math.floor(midi / 12) - 1;
              return (
                <button
                  key={midi}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    triggerNoteDown(midi);
                  }}
                  onPointerEnter={(e) => {
                    if (e.buttons === 1) {
                      triggerNoteDown(midi);
                    }
                  }}
                  onPointerUp={() => triggerNoteUp(midi)}
                  onPointerLeave={() => {
                    if (pointerDownNote === midi) {
                      triggerNoteUp(midi);
                    }
                  }}
                  aria-label={`Play note ${noteName}${octNum}`}
                  className={`relative flex-1 h-full border-r border-slate-400/80 last:border-r-0 rounded-b-[3px] flex flex-col justify-end items-center pb-1.5 transition-transform duration-75 cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-b from-sky-200 to-sky-300 translate-y-[2px] shadow-inner'
                      : 'bg-gradient-to-b from-[#f8f5ec] via-[#f1ede0] to-[#dfd9c8] hover:from-white hover:to-[#eae4d5]'
                  }`}
                >
                  {noteName === 'C' && (
                    <span className="text-[8.5px] font-mono-tabular font-semibold text-slate-600">
                      C{octNum}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Black Keys */}
          {blackKeys.map((bk) => {
            const isActive = activeNotes.has(bk.midi);
            return (
              <button
                key={bk.midi}
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  triggerNoteDown(bk.midi);
                }}
                onPointerEnter={(e) => {
                  if (e.buttons === 1) {
                    e.stopPropagation();
                    triggerNoteDown(bk.midi);
                  }
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  triggerNoteUp(bk.midi);
                }}
                aria-label={`Play sharp note MIDI ${bk.midi}`}
                className={`absolute top-0 z-10 h-[62%] rounded-b-[3px] border border-black transition-transform duration-75 cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-b from-sky-600 to-sky-800 translate-y-[2px]'
                    : 'bg-gradient-to-b from-[#2b2f38] via-[#181b21] to-[#0c0d11] hover:from-[#363b46]'
                }`}
                style={{
                  left: `${bk.leftPct}%`,
                  width: `${(0.62 / totalWhite) * 100}%`,
                  boxShadow: isActive
                    ? 'inset 0 1px 2px rgba(0,0,0,0.6)'
                    : '0 3px 4px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.18)',
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
