import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudityPatch,
  LcdPage,
  MidiCcMapping,
  OpenMpcQLinkSlot,
  ParamKey,
  WaveMorphBlend,
  WavetableDefinition,
} from '../types/synth';
import {
  PARAMETER_DESCRIPTORS,
  formatParamValue,
  getMorphedSamples,
  normalizeWave,
} from '../data/wavetables';
import { MidiActivityEvent, MidiDeviceInfo, scaleCcToParam } from '../hooks/useMidiController';
import {
  Upload,
  Play,
  Square,
  Sliders,
  Radio,
  Layers,
  Activity,
  Cpu,
  FolderOpen,
  Search,
  Plus,
  Trash2,
  Download,
  Copy,
  Check,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  FX8010_PROGRAMS,
  parseFx8010Microcode,
} from '../dsp/fx8010Microcode';
import { LfoVisualizer } from './LfoVisualizer';

interface LcdTouchscreenProps {
  patch: AudityPatch;
  presets: AudityPatch[];
  wavetables: WavetableDefinition[];
  activePage: LcdPage;
  onSelectPage: (page: LcdPage) => void;
  focusedParam: ParamKey;
  onParamChange: (key: ParamKey, val: number) => void;
  onPatchUpdate: (updater: (prev: AudityPatch) => AudityPatch) => void;
  onSelectPreset: (patch: AudityPatch) => void;
  onSaveCurrentAsUserPreset: (name: string, category: AudityPatch['category']) => void;
  onDeleteUserPreset: (id: string) => void;
  onImportBankJson: (patches: AudityPatch[]) => void;
  onUpdateWavetable: (wt: WavetableDefinition) => void;
  onImportWavFile: (file: File) => Promise<void>;
  analyser: AnalyserNode | null;
  activeVoiceCount: number;
  // Sequencer
  sequencerPlaying: boolean;
  currentStep: number;
  onToggleSequencer: () => void;
  // MIDI & Q-Links
  qLinks: OpenMpcQLinkSlot[];
  midiMappings: MidiCcMapping[];
  onSetMidiMappings: (next: MidiCcMapping[]) => void;
  midiDevices: MidiDeviceInfo[];
  midiPermissionState: string;
  selectedDeviceId: string;
  onSelectDeviceId: (id: string) => void;
  learnTargetParam: ParamKey | null;
  onSetLearnTarget: (param: ParamKey | null) => void;
  lastMidiEvent: MidiActivityEvent | null;
  onTriggerVirtualCc: (cc: number, value: number) => void;
  // Touchscreen zoom inside hardware bezel
  lcdExpanded: boolean;
  onToggleLcdExpanded: () => void;
  // Morph A <-> B
  morphActive: boolean;
  morphAmount: number;
  morphSlotAId: string;
  morphSlotBId: string;
  morphWaveBlend: WaveMorphBlend | null;
  onSelectMorphSlot: (slot: 'A' | 'B', id: string) => void;
}

const PRESET_CATEGORIES: Array<'All' | AudityPatch['category']> = [
  'All',
  'Brass',
  'Pad',
  'Bass',
  'Lead',
  'Keys',
  'Seq',
  'Wavetable',
  'FX',
];

export const LcdTouchscreen: React.FC<LcdTouchscreenProps> = ({
  patch,
  presets,
  wavetables,
  activePage,
  onSelectPage,
  focusedParam,
  onParamChange,
  onPatchUpdate,
  onSelectPreset,
  onSaveCurrentAsUserPreset,
  onDeleteUserPreset,
  onImportBankJson,
  onUpdateWavetable,
  onImportWavFile,
  analyser,
  activeVoiceCount,
  sequencerPlaying,
  currentStep,
  onToggleSequencer,
  qLinks,
  midiMappings,
  onSetMidiMappings,
  midiDevices,
  midiPermissionState,
  selectedDeviceId,
  onSelectDeviceId,
  learnTargetParam,
  onSetLearnTarget,
  lastMidiEvent,
  onTriggerVirtualCc,
  lcdExpanded,
  onToggleLcdExpanded,
  morphActive,
  morphAmount,
  morphSlotAId,
  morphSlotBId,
  morphWaveBlend,
  onSelectMorphSlot,
}) => {
  // Wave editor state
  const [editingOsc, setEditingOsc] = useState<'vco1' | 'vco2'>('vco1');
  const [showLiveScope, setShowLiveScope] = useState(true);
  const [qLinkBank, setQLinkBank] = useState<0 | 1>(0);

  // Integrated Preset Browser state
  const [presetQuery, setPresetQuery] = useState('');
  const [presetCat, setPresetCat] = useState<'All' | AudityPatch['category']>('All');
  const [presetBankFilter, setPresetBankFilter] = useState<
    'ALL' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'USER'
  >('ALL');
  const [showSaveBar, setShowSaveBar] = useState(false);
  const [newPatchName, setNewPatchName] = useState('');
  const [newPatchCat, setNewPatchCat] = useState<AudityPatch['category']>('Wavetable');

  // Open-MPC / FX8010 sub-view state
  const [openMpcView, setOpenMpcView] = useState<'graph' | 'fx8010' | 'manifest'>('graph');
  const [matrixView, setMatrixView] = useState<'seq' | 'lfo'>('seq');
  const [fxProgramId, setFxProgramId] = useState<string>(FX8010_PROGRAMS[0].id);
  const [fxCode, setFxCode] = useState<string>(FX8010_PROGRAMS[0].code);
  const [copiedManifest, setCopiedManifest] = useState(false);

  const fxParse = useMemo(() => parseFx8010Microcode(fxCode), [fxCode]);

  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const filterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingWaveRef = useRef(false);
  const lastDrawIdxRef = useRef<number | null>(null);
  const draggingFilterRef = useRef<'lpf' | 'hpf' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedWaveId = editingOsc === 'vco1' ? patch.vco1WaveId : patch.vco2WaveId;
  const selectedMorph = editingOsc === 'vco1' ? patch.vco1Morph : patch.vco2Morph;
  const selectedWave = wavetables.find((w) => w.id === selectedWaveId) ?? wavetables[0];
  const focusedDesc = PARAMETER_DESCRIPTORS[focusedParam];
  const focusedVal = patch[focusedParam] as number;

  const filteredPresets = useMemo(() => {
    const q = presetQuery.trim().toLowerCase();
    return presets.filter((p) => {
      if (presetBankFilter !== 'ALL' && p.bank !== presetBankFilter) return false;
      if (presetCat !== 'All' && p.category !== presetCat) return false;
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !p.description.toLowerCase().includes(q) &&
        !p.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [presets, presetQuery, presetCat, presetBankFilter]);

  const openMpcManifestJson = useMemo(() => {
    const manifest = {
      id: 'audity-78',
      name: 'AUDITY-78',
      version: '1.1.0',
      architecture: 'Open-MPC Native Instrument / VST3 / LV2',
      targets: ['GEN1 (MPC Live/One/X/Force armv7l)', 'GEN2 (MPC Live III aarch64)', 'OS 3.10.1+'],
      license: 'MIT',
      emulatedHardware: 'L.A. Systems Audity (1978/1980 Z-80 + SSM2040 Prototype)',
      dspEngine: {
        polyphony: 16,
        oscillators: ['Wavetable VCO1 (Fourier 44-Harm)', 'Wavetable VCO2 (Sync + Cross-Mod FM)'],
        filter: 'Dual Cascaded SSM2040 (12dB HPF + 24dB LPF + OTA Soft-Clip)',
        modulation: ['TG1 Filter Env', 'TG2 Amp Env', 'LFO (5 shapes + delay)', '3-Slot Mod Matrix'],
        effects: ['Stereo BBD Ensemble Chorus', 'Warm Tape Delay', 'Algorithmic Hall Reverb', 'Limiter'],
      },
      waveformSourceRef: 'https://github.com/mattetti/e-mu-soundbanks',
      qLinks,
      midiCcMappings: midiMappings,
      wavetableCount: wavetables.length,
      presetCount: presets.length,
      activePatch: patch,
    };
    return JSON.stringify(manifest, null, 2);
  }, [patch, presets.length, qLinks, midiMappings, wavetables.length]);

  // Live oscilloscope + wavetable overlay on WAVE page
  useEffect(() => {
    if (activePage !== 'wave') return;
    let rafId = 0;
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const timeData = analyser ? new Float32Array(analyser.fftSize) : null;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
      ctx.lineWidth = 1;
      for (let gx = 1; gx < 8; gx++) {
        ctx.beginPath();
        ctx.moveTo((gx / 8) * w, 0);
        ctx.lineTo((gx / 8) * w, h);
        ctx.stroke();
      }
      for (let gy = 1; gy < 4; gy++) {
        ctx.beginPath();
        ctx.moveTo(0, (gy / 4) * h);
        ctx.lineTo(w, (gy / 4) * h);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (showLiveScope && analyser && timeData) {
        analyser.getFloatTimeDomainData(timeData);
        let maxSignal = 0;
        for (let i = 0; i < timeData.length; i++) {
          if (Math.abs(timeData[i]) > maxSignal) maxSignal = Math.abs(timeData[i]);
        }
        if (maxSignal > 0.002) {
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          const step = Math.floor(timeData.length / w);
          for (let x = 0; x < w; x++) {
            const sample = timeData[x * step] || 0;
            const y = h / 2 - sample * (h * 0.42);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      let samples = getMorphedSamples(selectedWave, selectedMorph);
      if (morphWaveBlend) {
        const idA = editingOsc === 'vco1' ? morphWaveBlend.vco1WaveIdA : morphWaveBlend.vco2WaveIdA;
        const mA = editingOsc === 'vco1' ? morphWaveBlend.vco1MorphA : morphWaveBlend.vco2MorphA;
        const idB = editingOsc === 'vco1' ? morphWaveBlend.vco1WaveIdB : morphWaveBlend.vco2WaveIdB;
        const mB = editingOsc === 'vco1' ? morphWaveBlend.vco1MorphB : morphWaveBlend.vco2MorphB;
        const wtA = wavetables.find((wt) => wt.id === idA) ?? selectedWave;
        const wtB = wavetables.find((wt) => wt.id === idB) ?? selectedWave;
        const sA = getMorphedSamples(wtA, mA);
        const sB = getMorphedSamples(wtB, mB);
        const t = morphWaveBlend.t;
        samples = sA.map((val, idx) => val * (1 - t) + (sB[idx] ?? val) * t);
      }
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const x = (i / (samples.length - 1)) * w;
        const y = h / 2 - samples[i] * (h * 0.42);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.lineTo(w, h / 2);
      ctx.lineTo(0, h / 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
      ctx.fill();

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [activePage, analyser, selectedWave, selectedMorph, showLiveScope, morphWaveBlend, editingOsc, wavetables]);

  const applyDrawPoint = (clientX: number, clientY: number) => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const relY = Math.max(-1, Math.min(1, 1 - 2 * ((clientY - rect.top) / rect.height)));

    const len = selectedWave.samples.length;
    const idx = Math.min(len - 1, Math.max(0, Math.round(relX * (len - 1))));
    const nextSamples = [...selectedWave.samples];

    if (lastDrawIdxRef.current !== null && Math.abs(idx - lastDrawIdxRef.current) > 1) {
      const start = lastDrawIdxRef.current;
      const startVal = nextSamples[start];
      const dist = idx - start;
      const steps = Math.abs(dist);
      for (let s = 1; s <= steps; s++) {
        const interpIdx = start + Math.round((dist * s) / steps);
        nextSamples[interpIdx] = startVal + ((relY - startVal) * s) / steps;
      }
    } else {
      nextSamples[idx] = relY;
    }
    lastDrawIdxRef.current = idx;

    if (selectedWave.source !== 'User Custom') {
      const customId = `custom-${editingOsc}`;
      const existingCustom = wavetables.find((w) => w.id === customId);
      const customWave: WavetableDefinition = {
        id: customId,
        name: existingCustom?.name ?? `Custom ${editingOsc.toUpperCase()}`,
        source: 'User Custom',
        bankRef: 'TOUCHSCREEN DRAW',
        description: 'Hand-drawn single-cycle wavetable sculpted on Audity touchscreen.',
        samples: nextSamples,
        morphSamples: selectedWave.morphSamples,
      };
      onUpdateWavetable(customWave);
      onPatchUpdate((prev) => ({
        ...prev,
        [editingOsc === 'vco1' ? 'vco1WaveId' : 'vco2WaveId']: customId,
      }));
    } else {
      onUpdateWavetable({
        ...selectedWave,
        samples: nextSamples,
      });
    }
  };

  // SSM2040 Dual Filter Curve Render
  useEffect(() => {
    if (activePage !== 'filter') return;
    const canvas = filterCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const freqs = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
    const freqToX = (f: number) =>
      ((Math.log10(Math.max(20, Math.min(18000, f))) - Math.log10(20)) /
        (Math.log10(18000) - Math.log10(20))) *
      w;

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.lineWidth = 1;
    for (const f of freqs) {
      const x = freqToX(f);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.44);
    ctx.lineTo(w, h * 0.44);
    ctx.stroke();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.2;
    ctx.beginPath();

    for (let x = 0; x <= w; x += 2) {
      const logF =
        Math.log10(20) + (x / w) * (Math.log10(18000) - Math.log10(20));
      const f = Math.pow(10, logF);

      const rh = f / Math.max(20, patch.hpfCutoff);
      const qh = 0.7 + patch.hpfResonance * 4.5;
      const hpfMag =
        (rh * rh) / Math.sqrt(Math.pow(1 - rh * rh, 2) + Math.pow(rh / qh, 2));

      const rl = f / Math.max(35, patch.lpfCutoff);
      const ql = 0.7 + patch.lpfResonance * 4.8;
      const lpf2Mag =
        1 / Math.sqrt(Math.pow(1 - rl * rl, 2) + Math.pow(rl / ql, 2));
      const lpf4Mag = Math.pow(lpf2Mag, 1.85);

      const totalDb = 20 * Math.log10(Math.max(0.002, hpfMag * lpf4Mag));
      const y = h * 0.44 - (totalDb / 36) * (h * 0.42);
      const clampedY = Math.max(6, Math.min(h - 4, y));
      if (x === 0) ctx.moveTo(x, clampedY);
      else ctx.lineTo(x, clampedY);
    }
    ctx.stroke();

    const hpfX = freqToX(patch.hpfCutoff);
    const hpfY = h * 0.44 - patch.hpfResonance * h * 0.28;
    const lpfX = freqToX(patch.lpfCutoff);
    const lpfY = h * 0.44 - patch.lpfResonance * h * 0.32;

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(hpfX, hpfY, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '600 9px "IBM Plex Mono", monospace';
    ctx.fillText('HPF', Math.min(w - 26, hpfX + 7), Math.max(12, hpfY - 4));

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(lpfX, lpfY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0f2fe';
    ctx.fillText('LPF24', Math.max(4, Math.min(w - 36, lpfX - 16)), Math.max(12, lpfY - 9));
  }, [activePage, patch.hpfCutoff, patch.hpfResonance, patch.lpfCutoff, patch.lpfResonance]);

  const handleFilterPointer = (clientX: number, clientY: number, isDown: boolean) => {
    const canvas = filterCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const freq = Math.pow(
      10,
      Math.log10(20) + normX * (Math.log10(18000) - Math.log10(20))
    );
    const reso = Math.max(0, Math.min(1, (0.48 - normY) / 0.36));

    if (isDown) {
      const distLpf = Math.abs(Math.log10(freq) - Math.log10(patch.lpfCutoff));
      const distHpf = Math.abs(Math.log10(freq) - Math.log10(patch.hpfCutoff));
      draggingFilterRef.current = distHpf < distLpf && distHpf < 0.35 ? 'hpf' : 'lpf';
    }

    if (draggingFilterRef.current === 'hpf') {
      onParamChange('hpfCutoff', Math.max(20, Math.min(6000, Math.round(freq))));
      onParamChange('hpfResonance', Number(reso.toFixed(2)));
    } else if (draggingFilterRef.current === 'lpf') {
      onParamChange('lpfCutoff', Math.max(35, Math.min(16000, Math.round(freq))));
      onParamChange('lpfResonance', Number(reso.toFixed(2)));
    }
  };

  const handleExportBank = () => {
    const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audity-78-preset-bank.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBankFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        onImportBankJson(parsed as AudityPatch[]);
      }
    } catch {
      // ignore invalid JSON
    }
    e.target.value = '';
  };

  const handleCopyManifest = async () => {
    try {
      await navigator.clipboard.writeText(openMpcManifestJson);
      setCopiedManifest(true);
      setTimeout(() => setCopiedManifest(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleDownloadManifest = () => {
    const blob = new Blob([openMpcManifestJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audity-78-open-mpc-bundle.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: Array<{ id: LcdPage; label: string; icon: React.ReactNode }> = [
    { id: 'patches', label: 'PATCHES', icon: <FolderOpen className="w-3 h-3" /> },
    { id: 'wave', label: 'WAVE', icon: <Activity className="w-3 h-3" /> },
    { id: 'filter', label: 'SSM2040', icon: <Sliders className="w-3 h-3" /> },
    { id: 'matrix', label: 'SEQ/MOD', icon: <Layers className="w-3 h-3" /> },
    { id: 'midi', label: 'MIDI/Q', icon: <Radio className="w-3 h-3" /> },
    { id: 'openmpc', label: 'OPEN-MPC', icon: <Cpu className="w-3 h-3" /> },
  ];

  const visibleQLinks = qLinks.slice(qLinkBank * 8, qLinkBank * 8 + 8);

  return (
    <div className="audity-lcd-screen relative rounded-[4px] border-2 border-[#081326] overflow-hidden flex flex-col h-full">
      <div className="lcd-scanlines pointer-events-none absolute inset-0 z-10 opacity-45" />

      {/* Top Alphanumeric Z-80 Status Bar */}
      <div className="relative z-20 px-2.5 py-1.5 bg-[#041024]/90 border-b border-sky-400/25 flex items-center justify-between gap-2 text-[10px] font-mono-tabular">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-amber-300 font-semibold shrink-0 whitespace-nowrap">
            {morphActive ? `MORPH ${Math.round(morphAmount * 100)}%` : `${patch.bank}-${String(patch.slot).padStart(2, '0')}`}
          </span>
          <span className="text-sky-100 font-semibold truncate">{patch.name}</span>
          <span className="text-sky-400/75 hidden sm:inline whitespace-nowrap shrink-0">· {patch.voiceMode.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[9.5px]">
          <span className="text-sky-300/90">
            {focusedDesc.shortLabel}:{' '}
            <strong className="text-amber-300">{formatParamValue(focusedDesc, focusedVal)}</strong>
          </span>
          <span className="text-sky-400/75">V:{activeVoiceCount}/16</span>
          <button
            type="button"
            onClick={onToggleLcdExpanded}
            title={lcdExpanded ? 'Restore Compact LCD View' : 'Expand Touchscreen Across Panel'}
            className="p-0.5 text-sky-300 hover:text-amber-300 cursor-pointer"
          >
            {lcdExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Touchscreen Tab Ribbon */}
      <div className="relative z-20 flex items-center justify-between px-1 py-1 bg-[#061838]/90 border-b border-sky-400/20 gap-1">
        <div className="flex items-center gap-0.5 min-w-0 flex-1 overflow-x-auto no-scrollbar">
          {tabs.map((t) => {
            const compactLabel =
              !lcdExpanded && t.id === 'openmpc'
                ? 'MPC'
                : !lcdExpanded && t.id === 'patches'
                ? 'PATCH'
                : !lcdExpanded && t.id === 'filter'
                ? 'FILTER'
                : t.label;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectPage(t.id)}
                className={`${
                  lcdExpanded ? 'px-1.5 py-1 text-[9px] gap-1' : 'px-1 py-1 text-[8px] gap-0.5'
                } rounded-[3px] font-mono-tabular font-semibold flex items-center whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  activePage === t.id
                    ? 'bg-sky-400 text-slate-950 shadow-sm'
                    : 'text-sky-200/80 hover:bg-sky-400/15 hover:text-white'
                }`}
              >
                {t.icon}
                <span>{compactLabel}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onToggleSequencer}
          className={`${
            lcdExpanded ? 'px-2 text-[9px]' : 'px-1.5 text-[8px]'
          } py-1 rounded-[3px] font-mono-tabular font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
            sequencerPlaying
              ? 'bg-amber-400 text-slate-950'
              : 'bg-sky-900/70 text-sky-200 hover:bg-sky-800'
          }`}
          title="Start/Stop Audity 16-Step Sequencer"
        >
          {sequencerPlaying ? <Square className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
          <span>SEQ</span>
        </button>
      </div>

      {/* Active Touchscreen Body */}
      <div className="relative z-20 flex-1 p-2 overflow-y-auto text-sky-100">
        {activePage === 'patches' && (
          <div className="flex flex-col gap-1.5 h-full text-[9.5px] font-mono-tabular">
            {/* Search + Save/Bank Utilities */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="relative flex-1 min-w-[120px]">
                <Search className="w-3 h-3 text-sky-400/75 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={presetQuery}
                  onChange={(e) => setPresetQuery(e.target.value)}
                  placeholder={`Search ${presets.length} patches...`}
                  className="w-full pl-6 pr-2 py-1 bg-[#030e21] border border-sky-400/30 rounded-[2px] text-[10px] text-white placeholder:text-sky-400/50 focus:outline-none focus:border-sky-300"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowSaveBar((s) => !s)}
                className={`px-2 py-1 rounded-[2px] border flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 ${
                  showSaveBar
                    ? 'bg-amber-400 text-slate-950 border-amber-300 font-bold'
                    : 'bg-sky-900/60 text-amber-300 border-amber-400/40 hover:bg-sky-800'
                }`}
                title="Save current tweaked sound to User Bank"
              >
                <Plus className="w-3 h-3" />
                <span>SAVE</span>
              </button>

              <button
                type="button"
                onClick={handleExportBank}
                className="px-1.5 py-1 rounded-[2px] bg-[#041129] border border-sky-400/30 text-sky-200 hover:text-white flex items-center gap-1 cursor-pointer"
                title="Export Preset Bank JSON"
              >
                <Download className="w-3 h-3" />
              </button>

              <label
                className="px-1.5 py-1 rounded-[2px] bg-[#041129] border border-sky-400/30 text-sky-200 hover:text-white flex items-center gap-1 cursor-pointer"
                title="Import Preset Bank JSON"
              >
                <Upload className="w-3 h-3" />
                <input type="file" accept=".json" className="hidden" onChange={handleImportBankFile} />
              </label>
            </div>

            {/* Inline Save User Patch Drawer */}
            {showSaveBar && (
              <div className="flex items-center gap-1.5 bg-[#041129] border border-amber-400/50 rounded-[2px] p-1.5">
                <input
                  type="text"
                  value={newPatchName}
                  onChange={(e) => setNewPatchName(e.target.value)}
                  placeholder="New patch name..."
                  className="flex-1 min-w-0 bg-[#020917] border border-sky-400/30 rounded-[2px] px-2 py-0.5 text-[10px] text-white focus:outline-none"
                />
                <select
                  value={newPatchCat}
                  onChange={(e) => setNewPatchCat(e.target.value as AudityPatch['category'])}
                  className="bg-[#020917] border border-sky-400/30 rounded-[2px] px-1 py-0.5 text-[9.5px] text-sky-100"
                >
                  {PRESET_CATEGORIES.filter((c) => c !== 'All').map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const trimmed =
                      newPatchName.trim() ||
                      `User Patch ${presets.filter((p) => p.bank === 'USER').length + 1}`;
                    onSaveCurrentAsUserPreset(trimmed, newPatchCat);
                    setNewPatchName('');
                    setShowSaveBar(false);
                    setPresetBankFilter('USER');
                  }}
                  className="px-2 py-0.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-[2px] text-[9.5px] cursor-pointer"
                >
                  STORE
                </button>
              </div>
            )}

            {/* Bank Filter + Category Filter Row */}
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <div className="flex items-center flex-wrap gap-0.5 bg-[#030e21] p-0.5 rounded-[2px] border border-sky-400/20">
                {(['ALL', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'USER'] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setPresetBankFilter(b)}
                    className={`px-1.5 py-0.5 rounded-[2px] text-[8.5px] cursor-pointer ${
                      presetBankFilter === b
                        ? 'bg-sky-400 text-slate-950 font-bold'
                        : 'text-sky-300/80 hover:text-white'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-0.5 overflow-x-auto pb-0.5">
                {PRESET_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setPresetCat(cat)}
                    className={`px-1.5 py-0.5 rounded-[2px] text-[8.5px] whitespace-nowrap shrink-0 cursor-pointer ${
                      presetCat === cat
                        ? 'bg-amber-400/25 text-amber-200 border border-amber-400/60'
                        : 'text-sky-300/70 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable LCD Preset Cards Grid */}
            <div
              className={`flex-1 overflow-y-auto pr-0.5 grid gap-1.5 content-start ${
                lcdExpanded ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-2'
              }`}
            >
              {filteredPresets.map((p) => {
                const isSelected = p.id === patch.id;
                const isMorphA = p.id === morphSlotAId;
                const isMorphB = p.id === morphSlotBId;
                return (
                  <div
                    key={p.id}
                    onClick={() => onSelectPreset(p)}
                    className={`p-1.5 rounded-[3px] border cursor-pointer transition-colors flex flex-col justify-between gap-1 ${
                      isSelected
                        ? 'bg-sky-500/25 border-sky-300 shadow-[inset_0_0_12px_rgba(56,189,248,0.2)]'
                        : 'bg-[#041129]/85 border-sky-400/20 hover:border-sky-400/65 hover:bg-[#081d42]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <div className="text-[8px] text-amber-300 leading-tight">
                          {p.bank}-{String(p.slot).padStart(2, '0')} · {p.category} · {p.voiceMode.toUpperCase()}
                        </div>
                        <div className="text-[10.5px] font-semibold text-white truncate leading-tight mt-0.5">
                          {p.name}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectMorphSlot('A', p.id);
                          }}
                          title="Assign to Morph Slot A"
                          className={`px-1 py-0.5 text-[7.5px] font-bold rounded-[2px] border cursor-pointer ${
                            isMorphA
                              ? 'bg-amber-400 text-slate-950 border-amber-200'
                              : 'bg-[#061838] text-amber-300/80 border-amber-400/30 hover:border-amber-300'
                          }`}
                        >
                          A
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectMorphSlot('B', p.id);
                          }}
                          title="Assign to Morph Slot B"
                          className={`px-1 py-0.5 text-[7.5px] font-bold rounded-[2px] border cursor-pointer ${
                            isMorphB
                              ? 'bg-sky-400 text-slate-950 border-sky-200'
                              : 'bg-[#061838] text-sky-300/80 border-sky-400/30 hover:border-sky-300'
                          }`}
                        >
                          B
                        </button>
                        {p.bank === 'USER' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteUserPreset(p.id);
                            }}
                            title="Delete User Preset"
                            className="text-rose-400 hover:text-rose-300 p-0.5 cursor-pointer"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {lcdExpanded && (
                      <p className="text-[8.5px] text-sky-200/70 line-clamp-2 leading-snug">
                        {p.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[7.5px] text-sky-300/80 border-t border-sky-400/15 pt-0.5">
                      <span>A:{p.tg2Attack.toFixed(2)}s R:{p.tg2Release.toFixed(2)}s</span>
                      <span>{Math.round(p.lpfCutoff)}Hz</span>
                    </div>
                  </div>
                );
              })}

              {filteredPresets.length === 0 && (
                <div className="col-span-full py-6 text-center text-[10px] text-sky-300/70">
                  No patches match your filter.
                </div>
              )}
            </div>
          </div>
        )}

        {activePage === 'wave' && (
          <div className="flex flex-col gap-1.5 h-full">
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditingOsc('vco1')}
                  className={`px-2 py-0.5 text-[9.5px] font-mono-tabular rounded-[2px] cursor-pointer ${
                    editingOsc === 'vco1'
                      ? 'bg-sky-400 text-slate-950 font-semibold'
                      : 'bg-sky-950 text-sky-300 border border-sky-500/30'
                  }`}
                >
                  VCO 1
                </button>
                <button
                  type="button"
                  onClick={() => setEditingOsc('vco2')}
                  className={`px-2 py-0.5 text-[9.5px] font-mono-tabular rounded-[2px] cursor-pointer ${
                    editingOsc === 'vco2'
                      ? 'bg-sky-400 text-slate-950 font-semibold'
                      : 'bg-sky-950 text-sky-300 border border-sky-500/30'
                  }`}
                >
                  VCO 2
                </button>
                <select
                  aria-label="Select Wavetable"
                  value={selectedWave.id}
                  onChange={(e) =>
                    onPatchUpdate((prev) => ({
                      ...prev,
                      [editingOsc === 'vco1' ? 'vco1WaveId' : 'vco2WaveId']: e.target.value,
                    }))
                  }
                  className="bg-[#041129] border border-sky-400/40 rounded-[2px] px-1.5 py-0.5 text-[10px] font-mono-tabular text-sky-100 focus:outline-none focus:border-sky-300"
                >
                  {wavetables.map((wt) => (
                    <option key={wt.id} value={wt.id}>
                      {wt.name} ({wt.source})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowLiveScope((s) => !s)}
                  className={`px-1.5 py-0.5 text-[9px] font-mono-tabular rounded-[2px] border cursor-pointer ${
                    showLiveScope
                      ? 'border-amber-400/60 text-amber-300 bg-amber-500/10'
                      : 'border-sky-500/30 text-sky-300'
                  }`}
                >
                  SCOPE
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateWavetable({
                      ...selectedWave,
                      samples: normalizeWave(selectedWave.samples),
                    })
                  }
                  className="px-1.5 py-0.5 text-[9px] font-mono-tabular rounded-[2px] border border-sky-500/30 text-sky-200 hover:bg-sky-500/20 cursor-pointer"
                >
                  NORM
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-1.5 py-0.5 text-[9px] font-mono-tabular rounded-[2px] bg-sky-500/20 border border-sky-400/50 text-sky-100 hover:bg-sky-500/35 flex items-center gap-1 cursor-pointer"
                  title="Import single-cycle wavetable from a .WAV file"
                >
                  <Upload className="w-2.5 h-2.5" />
                  <span>.WAV</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/wav,audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onImportWavFile(file);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>

            <div className="relative flex-1 min-h-[112px] bg-[#030d1e] border border-sky-400/30 rounded-[3px] overflow-hidden">
              <canvas
                ref={waveCanvasRef}
                width={420}
                height={128}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drawingWaveRef.current = true;
                  lastDrawIdxRef.current = null;
                  applyDrawPoint(e.clientX, e.clientY);
                }}
                onPointerMove={(e) => {
                  if (!drawingWaveRef.current) return;
                  applyDrawPoint(e.clientX, e.clientY);
                }}
                onPointerUp={() => {
                  drawingWaveRef.current = false;
                  lastDrawIdxRef.current = null;
                }}
                className="w-full h-full cursor-crosshair touch-none"
              />
              <div className="pointer-events-none absolute bottom-1 left-2 right-2 flex items-center justify-between text-[8.5px] font-mono-tabular text-sky-300/80">
                <span>{selectedWave.bankRef}</span>
                <span>DRAW ON SCREEN TO SCULPT WAVE</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[9.5px] font-mono-tabular">
              <span className="text-sky-300 shrink-0">MORPH</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={selectedMorph}
                onChange={(e) =>
                  onParamChange(
                    editingOsc === 'vco1' ? 'vco1Morph' : 'vco2Morph',
                    parseFloat(e.target.value)
                  )
                }
                className="flex-1 accent-sky-400 h-1.5 cursor-pointer"
              />
              <span className="w-8 text-right text-amber-300">
                {Math.round(selectedMorph * 100)}%
              </span>
            </div>
          </div>
        )}

        {activePage === 'filter' && (
          <div className="flex flex-col gap-1.5 h-full">
            <div className="flex items-center justify-between text-[9.5px] font-mono-tabular">
              <span className="text-sky-200 font-semibold">
                SSM2040 DUAL FILTER RESPONSE (DRAG NODES)
              </span>
              <span className="text-amber-300">
                LPF {Math.round(patch.lpfCutoff)}Hz · HPF {Math.round(patch.hpfCutoff)}Hz
              </span>
            </div>

            <div className="relative flex-1 min-h-[110px] bg-[#030d1e] border border-sky-400/30 rounded-[3px] overflow-hidden">
              <canvas
                ref={filterCanvasRef}
                width={420}
                height={130}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  handleFilterPointer(e.clientX, e.clientY, true);
                }}
                onPointerMove={(e) => {
                  if (draggingFilterRef.current) {
                    handleFilterPointer(e.clientX, e.clientY, false);
                  }
                }}
                onPointerUp={() => {
                  draggingFilterRef.current = null;
                }}
                className="w-full h-full cursor-crosshair touch-none"
              />
            </div>

            {/* Interactive SVG TG1 & TG2 ADSR Envelope Visualization */}
            <div className="grid grid-cols-2 gap-1.5 text-[8.5px] font-mono-tabular bg-[#041129]/90 p-1.5 rounded-[2px] border border-sky-500/20">
              <AdsrPreview
                label="TG1 FILTER ENV"
                color="#fbbf24"
                attack={patch.tg1Attack}
                decay={patch.tg1Decay}
                sustain={patch.tg1Sustain}
                release={patch.tg1Release}
              />
              <AdsrPreview
                label="TG2 AMP ENV"
                color="#38bdf8"
                attack={patch.tg2Attack}
                decay={patch.tg2Decay}
                sustain={patch.tg2Sustain}
                release={patch.tg2Release}
              />
            </div>
          </div>
        )}

        {activePage === 'matrix' && (
          <div className="flex flex-col gap-1.5 h-full text-[9.5px] font-mono-tabular">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMatrixView('seq')}
                  className={`px-1.5 py-0.5 rounded-[2px] border cursor-pointer ${
                    matrixView === 'seq'
                      ? 'bg-sky-400 text-slate-950 border-sky-300 font-bold'
                      : 'bg-[#041129] text-sky-200 border-sky-400/35'
                  }`}
                >
                  16-STEP SEQ
                </button>
                <button
                  type="button"
                  onClick={() => setMatrixView('lfo')}
                  className={`px-1.5 py-0.5 rounded-[2px] border cursor-pointer ${
                    matrixView === 'lfo'
                      ? 'bg-amber-400 text-slate-950 border-amber-300 font-bold'
                      : 'bg-[#041129] text-amber-200 border-amber-400/35'
                  }`}
                >
                  LFO SCOPE
                </button>
              </div>

              {matrixView === 'seq' ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-sky-300">BPM</span>
                  <input
                    type="range"
                    min={50}
                    max={210}
                    value={patch.sequencerTempo}
                    onChange={(e) =>
                      onPatchUpdate((prev) => ({
                        ...prev,
                        sequencerTempo: parseInt(e.target.value, 10),
                      }))
                    }
                    className="w-20 accent-amber-400 h-1"
                  />
                  <span className="text-amber-300 w-7 text-right">{patch.sequencerTempo}</span>
                </div>
              ) : (
                <div className="flex items-center gap-0.5">
                  {(['sine', 'triangle', 'saw', 'square', 'sampleHold'] as const).map((shp) => (
                    <button
                      key={shp}
                      type="button"
                      onClick={() => onPatchUpdate((prev) => ({ ...prev, lfoShape: shp }))}
                      className={`px-1 py-0.5 rounded-[2px] text-[8px] cursor-pointer ${
                        patch.lfoShape === shp
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : 'bg-[#041129] text-sky-300 border border-sky-500/25'
                      }`}
                    >
                      {shp === 'sampleHold' ? 'S&H' : shp.slice(0, 3).toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {matrixView === 'seq' ? (
              <>
                <div className="grid grid-cols-16 gap-1 flex-1 min-h-[82px] items-end bg-[#030d1e] p-1.5 rounded-[3px] border border-sky-400/25">
                  {patch.sequencerSteps.map((step, idx) => {
                    const isActive = sequencerPlaying && currentStep === idx;
                    const barPct = ((step.noteOffset + 12) / 36) * 100;
                    return (
                      <div key={idx} className="flex flex-col items-center gap-1 h-full justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            onPatchUpdate((prev) => {
                              const steps = [...prev.sequencerSteps];
                              const nextNote =
                                steps[idx].noteOffset >= 15 ? -12 : steps[idx].noteOffset + 3;
                              steps[idx] = { ...steps[idx], noteOffset: nextNote };
                              return { ...prev, sequencerSteps: steps };
                            })
                          }
                          title={`Step ${idx + 1}: ${step.noteOffset >= 0 ? '+' : ''}${step.noteOffset}st`}
                          className={`w-full flex-1 bg-[#081a38] rounded-[2px] relative overflow-hidden cursor-pointer border ${
                            isActive ? 'border-amber-400' : 'border-sky-500/20'
                          }`}
                        >
                          <div
                            className={`absolute bottom-0 inset-x-0 transition-all ${
                              !step.gate
                                ? 'bg-slate-700/50'
                                : isActive
                                ? 'bg-amber-400'
                                : 'bg-sky-400/80'
                            }`}
                            style={{ height: `${Math.max(12, Math.min(100, barPct))}%` }}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onPatchUpdate((prev) => {
                              const steps = [...prev.sequencerSteps];
                              steps[idx] = { ...steps[idx], gate: !steps[idx].gate };
                              return { ...prev, sequencerSteps: steps };
                            })
                          }
                          className={`w-full h-3 rounded-[2px] text-[7.5px] leading-none flex items-center justify-center cursor-pointer ${
                            step.gate
                              ? isActive
                                ? 'bg-amber-400 text-slate-950 font-bold'
                                : 'bg-sky-500/60 text-white'
                              : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {idx + 1}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="text-[8.5px] text-sky-300/75 flex justify-between">
                  <span>Tap bar: +3st transpose · Tap #: Gate on/off</span>
                  <span>STEP {currentStep + 1}/16</span>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col gap-1.5 min-h-0">
                <div className="flex-1 min-h-0">
                  <LfoVisualizer
                    shape={patch.lfoShape}
                    rate={patch.lfoRate}
                    delay={patch.lfoDelay}
                    toPitch={patch.lfoToPitch}
                    toFilter={patch.lfoToFilter}
                    toMorph={patch.lfoToMorph}
                  />
                </div>
                <div className="grid grid-cols-4 gap-1.5 bg-[#041129] border border-sky-500/25 rounded-[2px] p-1 text-[8px]">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-sky-300">RATE {patch.lfoRate.toFixed(1)}Hz</span>
                    <input
                      type="range"
                      min={0.05}
                      max={24}
                      step={0.05}
                      value={patch.lfoRate}
                      onChange={(e) => onParamChange('lfoRate', parseFloat(e.target.value))}
                      className="accent-sky-400 h-1 cursor-pointer"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-amber-300">VIB {Math.round(patch.lfoToPitch * 100)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={patch.lfoToPitch}
                      onChange={(e) => onParamChange('lfoToPitch', parseFloat(e.target.value))}
                      className="accent-amber-400 h-1 cursor-pointer"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-sky-300">WAH {Math.round(patch.lfoToFilter * 100)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={patch.lfoToFilter}
                      onChange={(e) => onParamChange('lfoToFilter', parseFloat(e.target.value))}
                      className="accent-sky-400 h-1 cursor-pointer"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-emerald-300">WT {Math.round(patch.lfoToMorph * 100)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={patch.lfoToMorph}
                      onChange={(e) => onParamChange('lfoToMorph', parseFloat(e.target.value))}
                      className="accent-emerald-400 h-1 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {activePage === 'midi' && (
          <div className="flex flex-col gap-1.5 h-full text-[9.5px] font-mono-tabular">
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setQLinkBank(0)}
                  className={`px-1.5 py-0.5 rounded-[2px] cursor-pointer ${
                    qLinkBank === 0 ? 'bg-sky-400 text-slate-950 font-bold' : 'bg-sky-950 text-sky-300'
                  }`}
                >
                  Q 1-8
                </button>
                <button
                  type="button"
                  onClick={() => setQLinkBank(1)}
                  className={`px-1.5 py-0.5 rounded-[2px] cursor-pointer ${
                    qLinkBank === 1 ? 'bg-sky-400 text-slate-950 font-bold' : 'bg-sky-950 text-sky-300'
                  }`}
                >
                  Q 9-16
                </button>
                <button
                  type="button"
                  onClick={() => onSetLearnTarget(learnTargetParam ? null : focusedParam)}
                  className={`px-2 py-0.5 rounded-[2px] cursor-pointer ${
                    learnTargetParam
                      ? 'bg-amber-400 text-slate-950 font-bold animate-pulse'
                      : 'bg-sky-900/70 text-amber-300 border border-amber-400/40'
                  }`}
                >
                  {learnTargetParam ? `LEARN: ${learnTargetParam}` : 'MIDI LEARN'}
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <select
                  aria-label="MIDI Input Device"
                  value={selectedDeviceId}
                  onChange={(e) => onSelectDeviceId(e.target.value)}
                  className="bg-[#041129] border border-sky-500/30 rounded-[2px] px-1.5 py-0.5 text-[9px] text-sky-100 max-w-[120px]"
                >
                  <option value="all">
                    {devicesLabel(midiPermissionState, midiDevices.length)}
                  </option>
                  {midiDevices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {lastMidiEvent && (
                  <span className="text-amber-300">
                    {lastMidiEvent.type === 'CC'
                      ? `CC${lastMidiEvent.data1}:${lastMidiEvent.data2}`
                      : `N${lastMidiEvent.data1}`}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-8 gap-1 flex-1 min-h-[96px]">
              {visibleQLinks.map((slot) => {
                const desc = PARAMETER_DESCRIPTORS[slot.param];
                const cur = patch[slot.param] as number;
                const norm =
                  desc.curve === 'log' && desc.min > 0
                    ? Math.log(Math.max(desc.min, cur) / desc.min) / Math.log(desc.max / desc.min)
                    : (cur - desc.min) / (desc.max - desc.min);
                const pct = Math.max(0, Math.min(100, norm * 100));
                const mapped = midiMappings.find((m) => m.param === slot.param);

                return (
                  <div
                    key={slot.index}
                    className="bg-[#041129] border border-sky-500/25 rounded-[2px] p-1 flex flex-col justify-between items-center"
                  >
                    <span className="text-[7.5px] text-sky-300 truncate w-full text-center">
                      {slot.label}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={127}
                      value={Math.round((pct / 100) * 127)}
                      onChange={(e) => {
                        const ccVal = parseInt(e.target.value, 10);
                        if (learnTargetParam) {
                          onTriggerVirtualCc(slot.cc, ccVal);
                        } else {
                          onParamChange(slot.param, scaleCcToParam(slot.param, ccVal));
                        }
                      }}
                      className="w-full accent-sky-400 h-1 cursor-pointer my-1"
                      title={`Q-Link ${slot.index} (CC ${mapped?.cc ?? slot.cc})`}
                    />
                    <div className="flex items-center justify-between w-full text-[7.5px]">
                      <span className="text-amber-300">CC{mapped?.cc ?? slot.cc}</span>
                      <span className="text-sky-100">{Math.round(pct)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[8.5px] text-sky-300/75">
              <span>{midiMappings.length} CC Routes · Click MIDI LEARN then knob + CC</span>
              <button
                type="button"
                onClick={() => onSetMidiMappings(qLinks.map((q) => ({ cc: q.cc, param: q.param, label: q.label })))}
                className="text-sky-300 hover:text-white underline cursor-pointer"
              >
                Reset CCs
              </button>
            </div>
          </div>
        )}

        {activePage === 'openmpc' && (
          <div className="flex flex-col justify-between gap-1.5 h-full text-[9.5px] font-mono-tabular">
            <div className="flex items-center justify-between gap-1.5 flex-wrap">
              <div className="flex items-center gap-1">
                {(['graph', 'fx8010', 'manifest'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setOpenMpcView(mode)}
                    className={`px-1.5 py-0.5 rounded-[2px] border cursor-pointer uppercase ${
                      openMpcView === mode
                        ? 'bg-sky-400 text-slate-950 border-sky-300 font-bold'
                        : 'bg-[#041129] text-sky-200 border-sky-400/35 hover:text-white'
                    }`}
                  >
                    {mode === 'graph' ? 'DSP GRAPH' : mode === 'fx8010' ? 'FX8010 CORE' : 'MANIFEST'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCopyManifest}
                  className="px-1.5 py-0.5 rounded-[2px] bg-[#041129] border border-sky-400/35 text-sky-100 flex items-center gap-1 cursor-pointer"
                  title="Copy Open-MPC Manifest JSON"
                >
                  {copiedManifest ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadManifest}
                  className="px-2 py-0.5 rounded-[2px] bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-2.5 h-2.5" />
                  <span>PKG</span>
                </button>
              </div>
            </div>

            {openMpcView === 'manifest' && (
              <pre className="flex-1 bg-[#030c1c] border border-sky-400/30 rounded-[3px] p-2 text-[8.5px] text-sky-100 overflow-auto leading-snug">
                {openMpcManifestJson}
              </pre>
            )}

            {openMpcView === 'fx8010' && (
              <div className="flex-1 flex flex-col gap-1 min-h-0">
                <div className="flex items-center justify-between gap-1.5">
                  <select
                    aria-label="Select FX8010 DANE Microcode"
                    value={fxProgramId}
                    onChange={(e) => {
                      const prog = FX8010_PROGRAMS.find((p) => p.id === e.target.value);
                      if (prog) {
                        setFxProgramId(prog.id);
                        setFxCode(prog.code);
                      }
                    }}
                    className="bg-[#041129] border border-sky-400/40 rounded-[2px] px-1.5 py-0.5 text-[9px] text-sky-100"
                  >
                    {FX8010_PROGRAMS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <span className={fxParse.valid ? 'text-emerald-300' : 'text-rose-400'}>
                    {fxParse.valid
                      ? `OK · ${fxParse.instructionCount} OPS · ${fxParse.gprCount} GPR · ${fxParse.tramReads + fxParse.tramWrites} TRAM`
                      : `ERR L${fxParse.errors[0]?.line}: ${fxParse.errors[0]?.message}`}
                  </span>
                </div>
                <textarea
                  value={fxCode}
                  onChange={(e) => setFxCode(e.target.value)}
                  spellCheck={false}
                  className="flex-1 min-h-[82px] bg-[#020b1a] border border-sky-400/30 rounded-[3px] p-1.5 text-[8.5px] font-mono-tabular text-sky-100 focus:outline-none focus:border-sky-300 resize-none leading-snug"
                />
              </div>
            )}

            {openMpcView === 'graph' && (
              <div className="grid grid-cols-5 gap-1.5 my-auto">
                {[
                  { title: 'VCO 1/2 WT', sub: 'Fourier 44-Harm', stat: `${patch.vco1WaveId.slice(0, 9)}` },
                  { title: 'X-MOD / RNG', sub: 'FM + Ring + Noise', stat: `FM ${Math.round(patch.crossModFm * 100)}%` },
                  { title: 'SSM2040', sub: '12dB HPF + 24dB LPF', stat: `${Math.round(patch.lpfCutoff)} Hz` },
                  { title: 'TG1 / TG2', sub: 'Analog RC ADSR', stat: `${activeVoiceCount}/16 Voices` },
                  { title: 'FX8010 RF', sub: 'DANE BBD + Tape + Hall', stat: `CH ${Math.round(patch.chorusMix * 100)}%` },
                ].map((blk, i) => (
                  <div
                    key={i}
                    className="bg-[#041129] border border-sky-400/35 rounded-[3px] p-1.5 flex flex-col justify-between"
                  >
                    <span className="text-[9px] font-bold text-sky-300">{blk.title}</span>
                    <span className="text-[8px] text-sky-100/70 leading-tight my-0.5">{blk.sub}</span>
                    <span className="text-[8.5px] text-amber-300">{blk.stat}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-[8.5px] text-sky-300/80 border-t border-sky-500/20 pt-1">
              <span>{presets.length} Presets · FX8010-Emulator-Core · GEN1/GEN2</span>
              <span>MIT / Open-MPC Ready</span>
            </div>
          </div>
        )}
      </div>

      {/* Always-On Compact Animated LFO Modulation Monitor Strip */}
      <LfoVisualizer
        compact
        shape={patch.lfoShape}
        rate={patch.lfoRate}
        delay={patch.lfoDelay}
        toPitch={patch.lfoToPitch}
        toFilter={patch.lfoToFilter}
        toMorph={patch.lfoToMorph}
        onClick={() => {
          onSelectPage('matrix');
          setMatrixView('lfo');
        }}
      />
    </div>
  );
};

interface AdsrPreviewProps {
  label: string;
  color: string;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

const AdsrPreview: React.FC<AdsrPreviewProps> = ({
  label,
  color,
  attack,
  decay,
  sustain,
  release,
}) => {
  const w = 160;
  const h = 34;
  // Log-scaled segment widths for readable ADSR proportions
  const aW = Math.min(46, Math.max(4, Math.log1p(attack * 6) * 14));
  const dW = Math.min(46, Math.max(5, Math.log1p(decay * 5) * 14));
  const rW = Math.min(44, Math.max(5, Math.log1p(release * 5) * 13));
  const susX = aW + dW;
  const relStartX = w - rW;
  const susY = h - 4 - sustain * (h - 8);

  const path = `M 2 ${h - 4} L ${aW} 4 L ${susX} ${susY} L ${relStartX} ${susY} L ${w - 2} ${h - 4}`;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between text-[7.5px]">
        <span style={{ color }}>{label}</span>
        <span className="text-sky-200/80">
          {attack.toFixed(2)}/{decay.toFixed(2)}/{Math.round(sustain * 100)}%/{release.toFixed(2)}
        </span>
      </div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="bg-[#020a18] rounded-[2px]">
        <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

function devicesLabel(state: string, count: number): string {
  if (count > 0) return `All MIDI (${count} connected)`;
  if (state === 'unsupported') return 'Web MIDI N/A (Virtual Q-Links)';
  if (state === 'denied') return 'MIDI Permission Denied';
  return 'No Hardware MIDI (Virtual)';
}
