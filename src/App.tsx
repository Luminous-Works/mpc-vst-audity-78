import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudityPatch,
  LcdPage,
  MidiCcMapping,
  ParamKey,
  WavetableDefinition,
} from './types/synth';
import {
  DEFAULT_MIDI_MAPPINGS,
  DEFAULT_QLINK_SLOTS,
  FACTORY_PRESETS,
} from './data/presets';
import {
  FACTORY_WAVETABLES,
  extractWavetableFromAudioFile,
} from './data/wavetables';
import { AudityEngine } from './audio/AudityEngine';
import { buildWaveMorphBlend, interpolateAudityPatches } from './audio/patchMorph';
import { useMidiController } from './hooks/useMidiController';
import { HardwarePanel } from './components/HardwarePanel';
import { KeyboardBed } from './components/KeyboardBed';
import { OperatorsManual } from './components/OperatorsManual';

const STORAGE_USER_PRESETS = 'audity78_user_presets_v1';
const STORAGE_USER_WAVES = 'audity78_user_waves_v1';
const STORAGE_MIDI_MAP = 'audity78_midi_cc_v1';

// QWERTY musical keyboard layout (relative semitones from C of baseOctave)
const QWERTY_KEY_MAP: Record<string, number> = {
  z: 0,
  s: 1,
  x: 2,
  d: 3,
  c: 4,
  v: 5,
  g: 6,
  b: 7,
  h: 8,
  n: 9,
  j: 10,
  m: 11,
  ',': 12,
  q: 12,
  '2': 13,
  w: 14,
  '3': 15,
  e: 16,
  r: 17,
  '5': 18,
  t: 19,
  '6': 20,
  y: 21,
  '7': 22,
  u: 23,
  i: 24,
  '9': 25,
  o: 26,
  '0': 27,
  p: 28,
};

export default function App() {
  const [userPresets, setUserPresets] = useState<AudityPatch[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_USER_PRESETS);
      return raw ? (JSON.parse(raw) as AudityPatch[]) : [];
    } catch {
      return [];
    }
  });

  const [userWavetables, setUserWavetables] = useState<WavetableDefinition[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_USER_WAVES);
      return raw ? (JSON.parse(raw) as WavetableDefinition[]) : [];
    } catch {
      return [];
    }
  });

  const [midiMappings, setMidiMappings] = useState<MidiCcMapping[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_MIDI_MAP);
      return raw ? (JSON.parse(raw) as MidiCcMapping[]) : DEFAULT_MIDI_MAPPINGS;
    } catch {
      return DEFAULT_MIDI_MAPPINGS;
    }
  });

  const allPresets = React.useMemo(
    () => [...FACTORY_PRESETS, ...userPresets],
    [userPresets]
  );
  const allWavetables = React.useMemo(() => {
    const map = new Map<string, WavetableDefinition>();
    for (const w of FACTORY_WAVETABLES) map.set(w.id, w);
    for (const w of userWavetables) map.set(w.id, w);
    return Array.from(map.values());
  }, [userWavetables]);

  const [patch, setPatch] = useState<AudityPatch>(FACTORY_PRESETS[0]);
  const [showManual, setShowManual] = useState<boolean>(false);
  const [lcdPage, setLcdPage] = useState<LcdPage>('patches');
  const [focusedParam, setFocusedParam] = useState<ParamKey>('lpfCutoff');
  const [baseOctave, setBaseOctave] = useState<number>(2);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [activeVoiceCount, setActiveVoiceCount] = useState<number>(0);
  const [pitchBend, setPitchBend] = useState<number>(0);
  const [modWheel, setModWheel] = useState<number>(0);
  const [sustainHeld, setSustainHeld] = useState<boolean>(false);

  // Real-time Preset Morph A <-> B state
  const [morphSlotAId, setMorphSlotAId] = useState<string>(
    () => userPresets[0]?.id ?? FACTORY_PRESETS[0].id
  );
  const [morphSlotBId, setMorphSlotBId] = useState<string>(
    () => userPresets[1]?.id ?? FACTORY_PRESETS[3]?.id ?? FACTORY_PRESETS[1].id
  );
  const [morphAmount, setMorphAmount] = useState<number>(0);
  const [morphActive, setMorphActive] = useState<boolean>(false);

  const morphPresetA = React.useMemo(
    () => allPresets.find((p) => p.id === morphSlotAId) ?? allPresets[0],
    [allPresets, morphSlotAId]
  );
  const morphPresetB = React.useMemo(
    () => allPresets.find((p) => p.id === morphSlotBId) ?? allPresets[1] ?? allPresets[0],
    [allPresets, morphSlotBId]
  );
  const morphWaveBlend = React.useMemo(
    () => (morphActive ? buildWaveMorphBlend(morphPresetA, morphPresetB, morphAmount) : null),
    [morphActive, morphPresetA, morphPresetB, morphAmount]
  );

  const [sequencerPlaying, setSequencerPlaying] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);

  const engineRef = useRef<AudityEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new AudityEngine(patch, allWavetables);
  }

  useEffect(() => {
    engineRef.current?.setMorphWaveBlend(morphWaveBlend);
  }, [morphWaveBlend]);

  useEffect(() => {
    engineRef.current?.setPatch(patch);
  }, [patch]);

  useEffect(() => {
    engineRef.current?.setWavetables(allWavetables);
  }, [allWavetables]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_USER_PRESETS, JSON.stringify(userPresets));
    } catch {
      // ignore
    }
  }, [userPresets]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_USER_WAVES, JSON.stringify(userWavetables));
    } catch {
      // ignore
    }
  }, [userWavetables]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_MIDI_MAP, JSON.stringify(midiMappings));
    } catch {
      // ignore
    }
  }, [midiMappings]);

  const handleParamChange = useCallback((key: ParamKey, val: number) => {
    setFocusedParam(key);
    setPatch((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleNoteOn = useCallback((note: number, velocity = 0.85) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.noteOn(note, velocity);
    setActiveNotes((prev) => {
      const next = new Set(prev);
      next.add(note);
      return next;
    });
    setActiveVoiceCount(eng.getActiveVoiceCount());
  }, []);

  const handleNoteOff = useCallback((note: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.noteOff(note);
    setActiveNotes((prev) => {
      const next = new Set(prev);
      next.delete(note);
      return next;
    });
    setTimeout(() => {
      setActiveVoiceCount(eng.getActiveVoiceCount());
    }, 60);
  }, []);

  const handlePitchBend = useCallback((semis: number) => {
    setPitchBend(semis);
    engineRef.current?.setPitchBend(semis);
  }, []);

  const handleModWheel = useCallback((val: number) => {
    setModWheel(val);
    engineRef.current?.setModWheel(val);
  }, []);

  const handleToggleSustain = useCallback(() => {
    setSustainHeld((prev) => {
      const next = !prev;
      engineRef.current?.setSustain(next);
      return next;
    });
  }, []);

  const handlePanic = useCallback(() => {
    setSequencerPlaying(false);
    setSustainHeld(false);
    engineRef.current?.setSustain(false);
    engineRef.current?.allNotesOffImmediate(false);
    setActiveNotes(new Set());
    setActiveVoiceCount(0);
  }, []);

  const midi = useMidiController({
    mappings: midiMappings,
    onSetMappings: setMidiMappings,
    onParamChange: handleParamChange,
    onNoteOn: handleNoteOn,
    onNoteOff: handleNoteOff,
    onPitchBend: handlePitchBend,
    onModWheel: handleModWheel,
  });

  const stepRef = useRef(0);
  const lastSeqNoteRef = useRef<number | null>(null);
  const patchRef = useRef(patch);
  patchRef.current = patch;
  const baseOctaveRef = useRef(baseOctave);
  baseOctaveRef.current = baseOctave;

  useEffect(() => {
    if (!sequencerPlaying) {
      if (lastSeqNoteRef.current !== null) {
        handleNoteOff(lastSeqNoteRef.current);
        lastSeqNoteRef.current = null;
      }
      return;
    }

    const msPer16th = (60 / Math.max(40, patchRef.current.sequencerTempo) / 4) * 1000;
    const timer = window.setInterval(() => {
      const p = patchRef.current;
      const stepIdx = stepRef.current % 16;
      const step = p.sequencerSteps[stepIdx];
      setCurrentStep(stepIdx);

      if (lastSeqNoteRef.current !== null) {
        handleNoteOff(lastSeqNoteRef.current);
        lastSeqNoteRef.current = null;
      }

      if (step && step.gate) {
        const root = (baseOctaveRef.current + 1) * 12;
        const note = Math.max(24, Math.min(108, root + step.noteOffset));
        handleNoteOn(note, step.accent ? 0.96 : 0.72);
        lastSeqNoteRef.current = note;
      }

      stepRef.current = (stepIdx + 1) % 16;
    }, msPer16th);

    return () => {
      window.clearInterval(timer);
    };
  }, [sequencerPlaying, patch.sequencerTempo, handleNoteOn, handleNoteOff]);

  const showManualRef = useRef(showManual);
  showManualRef.current = showManual;

  useEffect(() => {
    const heldKeys = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (showManualRef.current) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.repeat) return;

      const key = e.key.toLowerCase();
      if (key === ' ') {
        e.preventDefault();
        setSequencerPlaying((s) => !s);
        return;
      }

      const offset = QWERTY_KEY_MAP[key];
      if (offset !== undefined && !heldKeys.has(key)) {
        heldKeys.add(key);
        const midiNote = (baseOctaveRef.current + 1) * 12 + offset;
        handleNoteOn(midiNote, 0.85);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const offset = QWERTY_KEY_MAP[key];
      if (offset !== undefined && heldKeys.has(key)) {
        heldKeys.delete(key);
        const midiNote = (baseOctaveRef.current + 1) * 12 + offset;
        handleNoteOff(midiNote);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleNoteOn, handleNoteOff]);

  const handleUpdateWavetable = useCallback((wt: WavetableDefinition) => {
    setUserWavetables((prev) => {
      const idx = prev.findIndex((item) => item.id === wt.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = wt;
        return next;
      }
      return [...prev, wt];
    });
    engineRef.current?.updateWavetable(wt);
  }, []);

  const handleImportWavFile = useCallback(
    async (file: File) => {
      const eng = engineRef.current;
      if (!eng) return;
      const ctx = eng.init();
      const wt = await extractWavetableFromAudioFile(file, ctx);
      handleUpdateWavetable(wt);
      setPatch((prev) => ({ ...prev, vco1WaveId: wt.id }));
    },
    [handleUpdateWavetable]
  );

  const handleInitPatch = () => {
    const init = FACTORY_PRESETS.find((p) => p.id === 'a16') ?? FACTORY_PRESETS[0];
    setMorphActive(false);
    engineRef.current?.setMorphWaveBlend(null);
    setPatch({ ...init });
  };

  const handleRandomizePatch = () => {
    const w1 = allWavetables[Math.floor(Math.random() * allWavetables.length)];
    const w2 = allWavetables[Math.floor(Math.random() * allWavetables.length)];
    setMorphActive(false);
    engineRef.current?.setMorphWaveBlend(null);
    setPatch((prev) => ({
      ...prev,
      id: `rand-${Date.now()}`,
      name: 'Audity Random Mutate',
      vco1WaveId: w1.id,
      vco2WaveId: w2.id,
      vco1Morph: Number(Math.random().toFixed(2)),
      vco2Morph: Number(Math.random().toFixed(2)),
      vco2Fine: Math.round((Math.random() - 0.5) * 32),
      crossModFm: Math.random() > 0.65 ? Number((Math.random() * 0.45).toFixed(2)) : 0,
      ringModLevel: Math.random() > 0.78 ? Number((Math.random() * 0.4).toFixed(2)) : 0,
      lpfCutoff: Math.round(320 + Math.random() * 6800),
      lpfResonance: Number((0.12 + Math.random() * 0.58).toFixed(2)),
      lpfDrive: Number((0.1 + Math.random() * 0.5).toFixed(2)),
      lpfEnvAmount: Number(((Math.random() - 0.2) * 0.85).toFixed(2)),
      tg1Attack: Number((0.002 + Math.random() * 0.45).toFixed(3)),
      tg1Decay: Number((0.12 + Math.random() * 1.4).toFixed(2)),
      tg1Sustain: Number((Math.random() * 0.8).toFixed(2)),
      tg2Attack: Number((0.002 + Math.random() * 0.35).toFixed(3)),
      tg2Decay: Number((0.2 + Math.random() * 1.6).toFixed(2)),
      tg2Sustain: Number((0.15 + Math.random() * 0.8).toFixed(2)),
      tg2Release: Number((0.12 + Math.random() * 1.4).toFixed(2)),
      chorusMix: Number((Math.random() * 0.68).toFixed(2)),
      delayMix: Number((Math.random() * 0.42).toFixed(2)),
      reverbMix: Number((0.15 + Math.random() * 0.5).toFixed(2)),
    }));
  };

  const handleSaveUserPreset = (name: string, category: AudityPatch['category']) => {
    const nextSlot = userPresets.length + 1;
    const saved: AudityPatch = {
      ...patch,
      id: `user-${Date.now()}`,
      name,
      bank: 'USER',
      slot: nextSlot,
      category,
      author: 'User',
      description: `Custom user patch sculpted on Audity '78.`,
    };
    setUserPresets((prev) => [...prev, saved]);
    setMorphActive(false);
    engineRef.current?.setMorphWaveBlend(null);
    setPatch(saved);
  };

  const handleDeleteUserPreset = (id: string) => {
    setUserPresets((prev) => prev.filter((p) => p.id !== id));
  };

  const handleImportBankJson = (patches: AudityPatch[]) => {
    const valid = patches
      .filter((p) => p && p.name && p.vco1WaveId)
      .map((p, idx) => ({
        ...p,
        id: `imp-${Date.now()}-${idx}`,
        bank: 'USER' as const,
      }));
    if (valid.length > 0) {
      setUserPresets((prev) => [...prev, ...valid]);
      setMorphActive(false);
      engineRef.current?.setMorphWaveBlend(null);
      setPatch(valid[0]);
    }
  };

  const applyMorphUpdate = useCallback((a: AudityPatch, b: AudityPatch, t: number) => {
    const blend = buildWaveMorphBlend(a, b, t);
    engineRef.current?.setMorphWaveBlend(blend);
    setPatch(interpolateAudityPatches(a, b, t));
  }, []);

  const handleMorphAmountChange = useCallback(
    (nextAmount: number) => {
      const clamped = Math.max(0, Math.min(1, nextAmount));
      setMorphAmount(clamped);
      setMorphActive(true);
      applyMorphUpdate(morphPresetA, morphPresetB, clamped);
    },
    [morphPresetA, morphPresetB, applyMorphUpdate]
  );

  const handleSelectMorphSlot = useCallback(
    (slot: 'A' | 'B', presetId: string) => {
      const target = allPresets.find((p) => p.id === presetId);
      if (!target) return;
      if (slot === 'A') {
        setMorphSlotAId(presetId);
        if (morphActive) {
          applyMorphUpdate(target, morphPresetB, morphAmount);
        }
      } else {
        setMorphSlotBId(presetId);
        if (morphActive) {
          applyMorphUpdate(morphPresetA, target, morphAmount);
        }
      }
    },
    [allPresets, morphActive, morphPresetA, morphPresetB, morphAmount, applyMorphUpdate]
  );

  const handleToggleMorphActive = useCallback(() => {
    if (morphActive) {
      setMorphActive(false);
      engineRef.current?.setMorphWaveBlend(null);
    } else {
      setMorphActive(true);
      applyMorphUpdate(morphPresetA, morphPresetB, morphAmount);
    }
  }, [morphActive, morphPresetA, morphPresetB, morphAmount, applyMorphUpdate]);

  const handleSwapMorphSlots = useCallback(() => {
    const nextA = morphSlotBId;
    const nextB = morphSlotAId;
    const nextT = Number((1 - morphAmount).toFixed(3));
    setMorphSlotAId(nextA);
    setMorphSlotBId(nextB);
    setMorphAmount(nextT);
    if (morphActive) {
      applyMorphUpdate(morphPresetB, morphPresetA, nextT);
    }
  }, [morphSlotAId, morphSlotBId, morphAmount, morphActive, morphPresetA, morphPresetB, applyMorphUpdate]);

  const handleCaptureToMorphSlot = useCallback(
    (slot: 'A' | 'B') => {
      // If current patch is already an unmodified User preset, bind it directly; otherwise save a fresh User snapshot
      const existingUser =
        patch.id !== 'morph-live'
          ? userPresets.find((u) => u.id === patch.id)
          : undefined;

      let chosen = existingUser;
      if (!chosen) {
        const nextSlotNum = userPresets.length + 1;
        const baseName =
          patch.id === 'morph-live'
            ? `Hybrid ${slot} #${nextSlotNum}`
            : `${patch.name.slice(0, 14)} (${slot})`;
        chosen = {
          ...patch,
          id: `user-${Date.now()}`,
          name: baseName,
          bank: 'USER',
          slot: nextSlotNum,
          author: 'User',
          description: `Captured to Morph Slot ${slot} on Audity '78.`,
        };
        setUserPresets((prev) => [...prev, chosen!]);
      }

      if (slot === 'A') {
        setMorphSlotAId(chosen.id);
        if (morphActive) {
          applyMorphUpdate(chosen, morphPresetB, morphAmount);
        }
      } else {
        setMorphSlotBId(chosen.id);
        if (morphActive) {
          applyMorphUpdate(morphPresetA, chosen, morphAmount);
        }
      }
    },
    [patch, userPresets, morphActive, morphPresetA, morphPresetB, morphAmount, applyMorphUpdate]
  );

  const handleStoreMorphedHybrid = useCallback(() => {
    const nextSlotNum = userPresets.length + 1;
    const pct = Math.round(morphAmount * 100);
    const saved: AudityPatch = {
      ...patch,
      id: `user-${Date.now()}`,
      name: `${morphPresetA.name.slice(0, 9)}×${morphPresetB.name.slice(0, 9)} ${pct}%`,
      bank: 'USER',
      slot: nextSlotNum,
      author: 'User Morph',
      description: `Morphed hybrid (${100 - pct}% ${morphPresetA.name} / ${pct}% ${morphPresetB.name}).`,
    };
    setUserPresets((prev) => [...prev, saved]);
    setMorphActive(false);
    engineRef.current?.setMorphWaveBlend(null);
    setPatch(saved);
  }, [patch, userPresets.length, morphAmount, morphPresetA.name, morphPresetB.name]);

  if (showManual) {
    return (
      <OperatorsManual
        onBackToSynth={() => setShowManual(false)}
        userPresets={userPresets}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#101216] text-slate-100 flex flex-col">
      {/* Clean 3-Zone Top Bar Contract — routes straight to LCD touchscreen tabs */}
      <header className="h-12 px-5 border-b border-slate-800/90 bg-[#0c0e12] flex items-center justify-between gap-8 shrink-0">
        <a
          href="#top"
          className="font-display text-base font-bold tracking-wider text-white whitespace-nowrap shrink-0"
        >
          LUMINA.AEROSPACE · AUDITY &apos;78
        </a>

        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
          <button
            type="button"
            onClick={() => setLcdPage('patches')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              lcdPage === 'patches' ? 'text-sky-400 font-semibold' : 'hover:text-white'
            }`}
          >
            Presets ({allPresets.length})
          </button>
          <button
            type="button"
            onClick={() => setLcdPage('wave')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              lcdPage === 'wave' ? 'text-sky-400 font-semibold' : 'hover:text-white'
            }`}
          >
            Wavetable
          </button>
          <button
            type="button"
            onClick={() => setLcdPage('filter')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              lcdPage === 'filter' ? 'text-sky-400 font-semibold' : 'hover:text-white'
            }`}
          >
            SSM2040 Filter
          </button>
          <button
            type="button"
            onClick={() => setLcdPage('midi')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              lcdPage === 'midi' ? 'text-sky-400 font-semibold' : 'hover:text-white'
            }`}
          >
            MIDI &amp; Q-Links
          </button>
          <button
            type="button"
            onClick={() => setLcdPage('openmpc')}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              lcdPage === 'openmpc' ? 'text-sky-400 font-semibold' : 'hover:text-white'
            }`}
          >
            FX8010 &amp; Open-MPC
          </button>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowManual(true)}
            className="px-3 py-1.5 text-xs font-medium text-sky-200 bg-slate-800/90 hover:bg-slate-700 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Operator&apos;s Manual
          </button>
          <button
            type="button"
            onClick={() => setLcdPage('openmpc')}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Open-MPC Core
          </button>
        </div>
      </header>

      {/* Main Centered Studio Instrument Stage */}
      <main id="top" className="flex-1 flex flex-col items-center justify-center px-3 sm:px-5 py-4">
        <div className="w-full max-w-[1400px] shadow-[0_28px_70px_rgba(0,0,0,0.8)] rounded-lg">
          <HardwarePanel
            patch={patch}
            presets={allPresets}
            wavetables={allWavetables}
            lcdPage={lcdPage}
            onSelectLcdPage={setLcdPage}
            focusedParam={focusedParam}
            onFocusParam={setFocusedParam}
            onParamChange={handleParamChange}
            onPatchUpdate={setPatch}
            onSelectPreset={(p) => {
              setMorphActive(false);
              engineRef.current?.setMorphWaveBlend(null);
              setPatch(p);
            }}
            onSaveCurrentAsUserPreset={handleSaveUserPreset}
            onDeleteUserPreset={handleDeleteUserPreset}
            onImportBankJson={handleImportBankJson}
            morphActive={morphActive}
            morphAmount={morphAmount}
            morphSlotAId={morphPresetA.id}
            morphSlotBId={morphPresetB.id}
            morphWaveBlend={morphWaveBlend}
            onMorphAmountChange={handleMorphAmountChange}
            onSelectMorphSlot={handleSelectMorphSlot}
            onToggleMorphActive={handleToggleMorphActive}
            onSwapMorphSlots={handleSwapMorphSlots}
            onCaptureToMorphSlot={handleCaptureToMorphSlot}
            onStoreMorphedHybrid={handleStoreMorphedHybrid}
            onInitPatch={handleInitPatch}
            onRandomizePatch={handleRandomizePatch}
            onUpdateWavetable={handleUpdateWavetable}
            onImportWavFile={handleImportWavFile}
            analyser={engineRef.current?.getAnalyser() ?? null}
            activeVoiceCount={activeVoiceCount}
            sequencerPlaying={sequencerPlaying}
            currentStep={currentStep}
            onToggleSequencer={() => setSequencerPlaying((s) => !s)}
            qLinks={DEFAULT_QLINK_SLOTS}
            midiMappings={midiMappings}
            onSetMidiMappings={setMidiMappings}
            midiDevices={midi.devices}
            midiPermissionState={midi.midiPermissionState}
            selectedDeviceId={midi.selectedDeviceId}
            onSelectDeviceId={midi.setSelectedDeviceId}
            learnTargetParam={midi.learnTargetParam}
            onSetLearnTarget={midi.setLearnTargetParam}
            lastMidiEvent={midi.lastEvent}
            onTriggerVirtualCc={midi.triggerVirtualCc}
          />

          <KeyboardBed
            baseOctave={baseOctave}
            onOctaveChange={setBaseOctave}
            activeNotes={activeNotes}
            onNoteOn={handleNoteOn}
            onNoteOff={handleNoteOff}
            pitchBend={pitchBend}
            onPitchBend={handlePitchBend}
            modWheel={modWheel}
            onModWheel={handleModWheel}
            sustainHeld={sustainHeld}
            onToggleSustain={handleToggleSustain}
            onPanic={handlePanic}
          />
        </div>
      </main>

      {/* Quiet Studio Footer */}
      <footer className="px-5 py-2.5 border-t border-slate-800/80 bg-[#0c0e12] text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-mono-tabular">
          <span>L.A. Systems Audity '78 (after the 1978 prototype)</span>
          <span aria-hidden="true">·</span>
          <span>16-Voice SSM2040 + FX8010 DSP Core</span>
          <span aria-hidden="true">·</span>
          <span>mattetti/e-mu-soundbanks &amp; easypx/FX8010-Emulator-Core</span>
        </div>
        <div className="font-mono-tabular text-slate-400">
          QWERTY: Z–M / Q–P play notes · Space toggles sequencer · Shift+Drag for fine knob control
        </div>
      </footer>
    </div>
  );
}
