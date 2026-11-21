import React from 'react';
import {
  AudityPatch,
  LcdPage,
  LfoShape,
  MidiCcMapping,
  OpenMpcQLinkSlot,
  ParamKey,
  WaveMorphBlend,
  WavetableDefinition,
} from '../types/synth';
import { RotaryKnob } from './RotaryKnob';
import { HardwarePushButton } from './HardwarePushButton';
import { LcdTouchscreen } from './LcdTouchscreen';
import { MidiActivityEvent, MidiDeviceInfo } from '../hooks/useMidiController';
import { ArrowLeftRight } from 'lucide-react';

interface HardwarePanelProps {
  patch: AudityPatch;
  presets: AudityPatch[];
  wavetables: WavetableDefinition[];
  lcdPage: LcdPage;
  onSelectLcdPage: (page: LcdPage) => void;
  focusedParam: ParamKey;
  onFocusParam: (key: ParamKey) => void;
  onParamChange: (key: ParamKey, val: number) => void;
  onPatchUpdate: (updater: (prev: AudityPatch) => AudityPatch) => void;
  onSelectPreset: (patch: AudityPatch) => void;
  onSaveCurrentAsUserPreset: (name: string, category: AudityPatch['category']) => void;
  onDeleteUserPreset: (id: string) => void;
  onImportBankJson: (patches: AudityPatch[]) => void;
  onInitPatch: () => void;
  onRandomizePatch: () => void;
  onUpdateWavetable: (wt: WavetableDefinition) => void;
  onImportWavFile: (file: File) => Promise<void>;
  analyser: AnalyserNode | null;
  activeVoiceCount: number;
  // Sequencer
  sequencerPlaying: boolean;
  currentStep: number;
  onToggleSequencer: () => void;
  // MIDI
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
  // Preset Morph A <-> B
  morphActive: boolean;
  morphAmount: number;
  morphSlotAId: string;
  morphSlotBId: string;
  morphWaveBlend: WaveMorphBlend | null;
  onMorphAmountChange: (val: number) => void;
  onSelectMorphSlot: (slot: 'A' | 'B', id: string) => void;
  onToggleMorphActive: () => void;
  onSwapMorphSlots: () => void;
  onCaptureToMorphSlot: (slot: 'A' | 'B') => void;
  onStoreMorphedHybrid: () => void;
}

const LFO_SHAPES: Array<{ id: LfoShape; label: string }> = [
  { id: 'sine', label: 'SIN' },
  { id: 'triangle', label: 'TRI' },
  { id: 'saw', label: 'SAW' },
  { id: 'square', label: 'SQR' },
  { id: 'sampleHold', label: 'S&H' },
];

export const HardwarePanel: React.FC<HardwarePanelProps> = ({
  patch,
  presets,
  wavetables,
  lcdPage,
  onSelectLcdPage,
  focusedParam,
  onFocusParam,
  onParamChange,
  onPatchUpdate,
  onSelectPreset,
  onSaveCurrentAsUserPreset,
  onDeleteUserPreset,
  onImportBankJson,
  onInitPatch,
  onRandomizePatch,
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
  morphActive,
  morphAmount,
  morphSlotAId,
  morphSlotBId,
  morphWaveBlend,
  onMorphAmountChange,
  onSelectMorphSlot,
  onToggleMorphActive,
  onSwapMorphSlots,
  onCaptureToMorphSlot,
  onStoreMorphedHybrid,
}) => {
  const [activeBank, setActiveBank] = React.useState<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'>(
    patch.bank !== 'USER' ? patch.bank : 'A'
  );
  const [keypadEntry, setKeypadEntry] = React.useState<string>('');
  const [lcdExpanded, setLcdExpanded] = React.useState<boolean>(false);
  const [morphUserOnly, setMorphUserOnly] = React.useState<boolean>(false);
  const [storedFlash, setStoredFlash] = React.useState<boolean>(false);

  const userPresetList = React.useMemo(
    () => presets.filter((p) => p.bank === 'USER'),
    [presets]
  );
  const factoryPresetList = React.useMemo(
    () => presets.filter((p) => p.bank !== 'USER'),
    [presets]
  );

  React.useEffect(() => {
    if (patch.bank !== 'USER') {
      setActiveBank(patch.bank);
    }
  }, [patch.bank]);

  const ccMapByParam = React.useMemo(() => {
    const map = new Map<ParamKey, number>();
    for (const m of midiMappings) {
      map.set(m.param, m.cc);
    }
    return map;
  }, [midiMappings]);

  const midiLearnActive = learnTargetParam !== null;

  const knobProps = (key: ParamKey, label?: string, bipolar = false) => ({
    paramKey: key,
    value: patch[key] as number,
    onChange: onParamChange,
    onFocusParam,
    label,
    bipolar,
    midiLearnActive,
    isLearnTarget: learnTargetParam === key,
    mappedCc: ccMapByParam.get(key),
    onSelectForMidiLearn: (k: ParamKey) => onSetLearnTarget(k),
  });

  const handleKeypadDigit = (digit: string) => {
    const next = (keypadEntry + digit).slice(-2);
    setKeypadEntry(next);
    const num = parseInt(next, 10);
    if (num >= 1 && num <= 16) {
      const target = presets.find((p) => p.bank === activeBank && p.slot === num);
      if (target) {
        onSelectPreset(target);
      }
    }
  };

  const cycleWave = (osc: 'vco1' | 'vco2') => {
    const currentId = osc === 'vco1' ? patch.vco1WaveId : patch.vco2WaveId;
    const idx = wavetables.findIndex((w) => w.id === currentId);
    const nextWave = wavetables[(idx + 1) % wavetables.length];
    onPatchUpdate((prev) => ({
      ...prev,
      [osc === 'vco1' ? 'vco1WaveId' : 'vco2WaveId']: nextWave.id,
    }));
  };

  const bankPresets = presets.filter((p) => p.bank === activeBank);

  return (
    <div className="walnut-wood pt-3 px-3 pb-2 rounded-t-lg shadow-2xl border-b border-black/80">
      <div className="flex items-stretch">
        {/* Left Walnut Cheek Accent */}
        <div className="w-2.5 shrink-0 walnut-wood-vertical rounded-l-sm border-r border-black/50 hidden lg:block" />

        {/* Iconic 1978 Sky-Blue Anodized Aluminum Panel */}
        <div className="flex-1 audity-sky-panel border-2 border-[#16345c] rounded-[2px] p-2 shadow-inner">
          {/* Main Modular Panel Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-1.5">
            {/* COLUMN 1 (4 cols or 12 cols when expanded): Z-80 Computer, LCD Touchscreen, Keypad, 16 Program Buttons */}
            <div
              className={`${
                lcdExpanded ? 'lg:col-span-12' : 'lg:col-span-4'
              } border border-white/80 rounded-[2px] p-1.5 flex flex-col justify-between gap-1.5 bg-black/5`}
            >
              {/* LCD Touchscreen */}
              <div className={lcdExpanded ? 'h-[416px]' : 'h-[296px]'}>
                <LcdTouchscreen
                  patch={patch}
                  presets={presets}
                  wavetables={wavetables}
                  activePage={lcdPage}
                  onSelectPage={onSelectLcdPage}
                  focusedParam={focusedParam}
                  onParamChange={onParamChange}
                  onPatchUpdate={onPatchUpdate}
                  onSelectPreset={onSelectPreset}
                  onSaveCurrentAsUserPreset={onSaveCurrentAsUserPreset}
                  onDeleteUserPreset={onDeleteUserPreset}
                  onImportBankJson={onImportBankJson}
                  onUpdateWavetable={onUpdateWavetable}
                  onImportWavFile={onImportWavFile}
                  analyser={analyser}
                  activeVoiceCount={activeVoiceCount}
                  sequencerPlaying={sequencerPlaying}
                  currentStep={currentStep}
                  onToggleSequencer={onToggleSequencer}
                  qLinks={qLinks}
                  midiMappings={midiMappings}
                  onSetMidiMappings={onSetMidiMappings}
                  midiDevices={midiDevices}
                  midiPermissionState={midiPermissionState}
                  selectedDeviceId={selectedDeviceId}
                  onSelectDeviceId={onSelectDeviceId}
                  learnTargetParam={learnTargetParam}
                  onSetLearnTarget={onSetLearnTarget}
                  lastMidiEvent={lastMidiEvent}
                  onTriggerVirtualCc={onTriggerVirtualCc}
                  lcdExpanded={lcdExpanded}
                  onToggleLcdExpanded={() => setLcdExpanded((e) => !e)}
                  morphActive={morphActive}
                  morphAmount={morphAmount}
                  morphSlotAId={morphSlotAId}
                  morphSlotBId={morphSlotBId}
                  morphWaveBlend={morphWaveBlend}
                  onSelectMorphSlot={onSelectMorphSlot}
                />
              </div>

              {/* Z-80 Numeric Keypad + Mode Control Navy Block */}
              <div className="audity-navy-block border border-white/75 rounded-[2px] p-1.5 flex items-center justify-between gap-2">
                {/* 3x4 Numeric Keypad */}
                <div className="grid grid-cols-3 gap-1 shrink-0">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', '+'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        if (k === '+') {
                          const nextSlot = patch.slot >= 16 ? 1 : patch.slot + 1;
                          const target = presets.find((p) => p.bank === activeBank && p.slot === nextSlot);
                          if (target) onSelectPreset(target);
                        } else if (k === '-') {
                          const prevSlot = patch.slot <= 1 ? 16 : patch.slot - 1;
                          const target = presets.find((p) => p.bank === activeBank && p.slot === prevSlot);
                          if (target) onSelectPreset(target);
                        } else {
                          handleKeypadDigit(k);
                        }
                      }}
                      className="audity-key-button w-6 h-5 text-[9.5px] font-mono-tabular font-semibold text-white rounded-[2px] border border-black/80 cursor-pointer hover:brightness-125"
                    >
                      {k}
                    </button>
                  ))}
                </div>

                {/* Bank / Patch Utility Buttons */}
                <div className="flex-1 grid grid-cols-4 gap-1.5 items-center">
                  <HardwarePushButton
                    label={
                      activeBank === 'A' || activeBank === 'B' || activeBank === 'C' || activeBank === 'D'
                        ? `BNK ${activeBank}`
                        : 'BNK A-D'
                    }
                    active={activeBank === 'A' || activeBank === 'B' || activeBank === 'C' || activeBank === 'D'}
                    onClick={() => {
                      const group: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
                      const idx = group.indexOf(activeBank as 'A' | 'B' | 'C' | 'D');
                      setActiveBank(idx === -1 ? 'A' : group[(idx + 1) % group.length]);
                    }}
                    size="sm"
                    title="Cycle Hardware Preset Banks A / B / C / D (1-16)"
                  />
                  <HardwarePushButton
                    label={
                      activeBank === 'E' || activeBank === 'F' || activeBank === 'G' || activeBank === 'H'
                        ? `BNK ${activeBank}`
                        : 'BNK E-H'
                    }
                    active={activeBank === 'E' || activeBank === 'F' || activeBank === 'G' || activeBank === 'H'}
                    onClick={() => {
                      const group: Array<'E' | 'F' | 'G' | 'H'> = ['E', 'F', 'G', 'H'];
                      const idx = group.indexOf(activeBank as 'E' | 'F' | 'G' | 'H');
                      setActiveBank(idx === -1 ? 'E' : group[(idx + 1) % group.length]);
                    }}
                    size="sm"
                    title="Cycle Hardware Preset Banks E / F / G / H (1-16)"
                  />
                  <HardwarePushButton
                    label="INIT"
                    ledColor="none"
                    onClick={onInitPatch}
                    size="sm"
                    title="Initialize Clean Audity Patch"
                  />
                  <HardwarePushButton
                    label="RAND"
                    ledColor="none"
                    onClick={onRandomizePatch}
                    size="sm"
                    title="Randomize Sound Parameters"
                  />
                  <HardwarePushButton
                    label="PATCH"
                    ledColor="cyan"
                    active={lcdPage === 'patches'}
                    onClick={() => onSelectLcdPage('patches')}
                    size="sm"
                    title="Open Integrated Preset Browser on LCD"
                  />
                  <HardwarePushButton
                    label="MIDI"
                    ledColor="amber"
                    active={midiLearnActive}
                    onClick={() => onSetLearnTarget(midiLearnActive ? null : focusedParam)}
                    size="sm"
                    title="Toggle MIDI CC Learn Mode"
                  />
                  <HardwarePushButton
                    label="SEQ"
                    ledColor="red"
                    active={sequencerPlaying}
                    onClick={onToggleSequencer}
                    size="sm"
                    title="Start / Stop 16-Step Sequencer"
                  />
                  <HardwarePushButton
                    label="MCP"
                    ledColor="cyan"
                    active={lcdPage === 'openmpc'}
                    onClick={() => onSelectLcdPage('openmpc')}
                    size="sm"
                    title="Open FX8010 & Open-MPC Page on LCD"
                  />
                </div>
              </div>

              {/* Dual Row of 16 Tactile Preset / Sequence Step Buttons with LEDs */}
              <div className="bg-[#0e2d5e]/35 border border-white/70 rounded-[2px] p-1.5">
                <div className="flex items-center justify-between text-[8.5px] font-bold tracking-wider text-[#08224a] uppercase mb-1 px-0.5">
                  <span>PROGRAM SELECT · BANK {activeBank}</span>
                  <span>{sequencerPlaying ? `SEQ STEP ${currentStep + 1}` : '16-MEMORY MATRIX'}</span>
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {Array.from({ length: 16 }, (_, idx) => {
                    const slot = idx + 1;
                    const preset = bankPresets.find((p) => p.slot === slot);
                    const isSelected = patch.bank === activeBank && patch.slot === slot;
                    const isSeqLit = sequencerPlaying && currentStep === idx;
                    return (
                      <HardwarePushButton
                        key={slot}
                        label={String(slot)}
                        active={isSelected || isSeqLit}
                        ledColor={isSeqLit ? 'red' : 'amber'}
                        size="xs"
                        title={preset ? `${activeBank}-${slot}: ${preset.name}` : `Slot ${slot}`}
                        onClick={() => {
                          if (preset) onSelectPreset(preset);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* COLUMN 2 (2 cols): NOISE, RING MOD, LFO, PITCH / VOICE MODES */}
            <div className="lg:col-span-2 flex flex-col gap-1.5">
              {/* NOISE & RING MOD */}
              <div className="border border-white/80 rounded-[2px] p-1.5 flex flex-col gap-1.5">
                <div className="audity-navy-block px-1.5 py-0.5 rounded-[2px] flex items-center justify-between">
                  <span className="text-[9.5px] font-bold tracking-wider text-white uppercase">
                    NOISE / RING
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 py-0.5">
                  <RotaryKnob {...knobProps('noiseLevel', 'NOISE')} size="sm" />
                  <RotaryKnob {...knobProps('noiseColor', 'COLOR')} size="sm" />
                  <RotaryKnob {...knobProps('ringModLevel', 'RING')} size="sm" />
                </div>
              </div>

              {/* LFO MODULE */}
              <div className="border border-white/80 rounded-[2px] p-1.5 flex-1 flex flex-col justify-between gap-1.5">
                <div className="audity-navy-block px-1.5 py-0.5 rounded-[2px] flex items-center justify-between">
                  <span className="text-[9.5px] font-bold tracking-wider text-white uppercase">
                    LFO
                  </span>
                  <span className="text-[8.5px] font-mono-tabular text-sky-200 uppercase">
                    {patch.lfoShape}
                  </span>
                </div>

                {/* 5 LFO Waveform Tactile Buttons */}
                <div className="grid grid-cols-5 gap-0.5 audity-navy-block p-1 rounded-[2px]">
                  {LFO_SHAPES.map((s) => (
                    <HardwarePushButton
                      key={s.id}
                      label={s.label}
                      active={patch.lfoShape === s.id}
                      ledColor="amber"
                      size="xs"
                      onClick={() => onPatchUpdate((prev) => ({ ...prev, lfoShape: s.id }))}
                    />
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-y-1.5 gap-x-1">
                  <RotaryKnob {...knobProps('lfoRate', 'RATE')} size="sm" />
                  <RotaryKnob {...knobProps('lfoDelay', 'DELAY')} size="sm" />
                  <RotaryKnob {...knobProps('lfoToPitch', 'VIB')} size="sm" />
                  <RotaryKnob {...knobProps('lfoToFilter', 'WAH')} size="sm" />
                </div>
                <div className="flex justify-around pt-1 border-t border-white/40">
                  <RotaryKnob {...knobProps('lfoToMorph', 'WT MOD')} size="sm" />
                  <RotaryKnob {...knobProps('glide', 'GLIDE')} size="sm" />
                </div>
              </div>
            </div>

            {/* COLUMN 3 (2 cols): VCO 1 & VCO 2 (WAVETABLE / SSM HYBRID) */}
            <div className="lg:col-span-2 flex flex-col gap-1.5">
              {/* VCO 1 */}
              <div className="border border-white/80 rounded-[2px] p-1.5 flex-1 flex flex-col justify-between gap-1">
                <div className="audity-navy-block px-1.5 py-0.5 rounded-[2px] flex items-center justify-between gap-1">
                  <span className="text-[9.5px] font-bold tracking-wider text-white uppercase">
                    VCO 1
                  </span>
                  <button
                    type="button"
                    onClick={() => cycleWave('vco1')}
                    className="text-[8.5px] font-mono-tabular text-amber-300 hover:text-white truncate max-w-[92px] cursor-pointer"
                    title="Click to cycle E-mu wavetable for VCO 1"
                  >
                    {wavetables.find((w) => w.id === patch.vco1WaveId)?.name ?? 'Saw'}
                  </button>
                </div>

                <div className="audity-navy-block p-1.5 rounded-[2px] grid grid-cols-2 gap-1.5">
                  <RotaryKnob {...knobProps('vco1Tune', 'COARSE', true)} size="sm" />
                  <RotaryKnob {...knobProps('vco1Fine', 'FINE', true)} size="sm" />
                  <RotaryKnob {...knobProps('vco1Morph', 'MORPH')} size="sm" />
                  <RotaryKnob {...knobProps('vco1Level', 'LEVEL')} size="sm" />
                </div>

                <div className="flex items-center justify-between gap-1 px-0.5">
                  <span className="text-[8px] font-bold text-[#09244b] uppercase">OCT</span>
                  <div className="flex gap-0.5">
                    {[-2, -1, 0, 1, 2].map((oct) => (
                      <button
                        key={oct}
                        type="button"
                        onClick={() => onPatchUpdate((p) => ({ ...p, vco1Octave: oct }))}
                        className={`px-1.5 py-0.5 text-[8.5px] font-mono-tabular rounded-[2px] cursor-pointer ${
                          patch.vco1Octave === oct
                            ? 'bg-[#10356d] text-amber-300 font-bold border border-white/60'
                            : 'bg-white/30 text-[#09244b] hover:bg-white/50'
                        }`}
                      >
                        {oct > 0 ? `+${oct}` : oct}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* VCO 2 */}
              <div className="border border-white/80 rounded-[2px] p-1.5 flex-1 flex flex-col justify-between gap-1">
                <div className="audity-navy-block px-1.5 py-0.5 rounded-[2px] flex items-center justify-between gap-1">
                  <span className="text-[9.5px] font-bold tracking-wider text-white uppercase">
                    VCO 2
                  </span>
                  <button
                    type="button"
                    onClick={() => cycleWave('vco2')}
                    className="text-[8.5px] font-mono-tabular text-amber-300 hover:text-white truncate max-w-[92px] cursor-pointer"
                    title="Click to cycle E-mu wavetable for VCO 2"
                  >
                    {wavetables.find((w) => w.id === patch.vco2WaveId)?.name ?? 'Brass'}
                  </button>
                </div>

                <div className="audity-navy-block p-1.5 rounded-[2px] grid grid-cols-2 gap-1.5">
                  <RotaryKnob {...knobProps('vco2Tune', 'COARSE', true)} size="sm" />
                  <RotaryKnob {...knobProps('vco2Fine', 'DETUNE', true)} size="sm" />
                  <RotaryKnob {...knobProps('vco2Morph', 'MORPH')} size="sm" />
                  <RotaryKnob {...knobProps('vco2Level', 'LEVEL')} size="sm" />
                </div>

                <div className="flex items-center justify-between gap-1 px-0.5">
                  <RotaryKnob {...knobProps('crossModFm', 'X-MOD')} size="sm" />
                  <div className="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={() => onPatchUpdate((p) => ({ ...p, vco2Sync: !p.vco2Sync }))}
                      className={`px-2 py-0.5 text-[8.5px] font-mono-tabular font-bold rounded-[2px] border cursor-pointer ${
                        patch.vco2Sync
                          ? 'bg-amber-400 text-slate-950 border-black'
                          : 'bg-[#10356d] text-white/80 border-white/40'
                      }`}
                    >
                      SYNC {patch.vco2Sync ? 'ON' : 'OFF'}
                    </button>
                    <div className="flex gap-0.5">
                      {[-2, -1, 0, 1].map((oct) => (
                        <button
                          key={oct}
                          type="button"
                          onClick={() => onPatchUpdate((p) => ({ ...p, vco2Octave: oct }))}
                          className={`px-1 py-0.5 text-[8px] font-mono-tabular rounded-[2px] cursor-pointer ${
                            patch.vco2Octave === oct
                              ? 'bg-[#10356d] text-amber-300 font-bold'
                              : 'bg-white/30 text-[#09244b]'
                          }`}
                        >
                          {oct > 0 ? `+${oct}` : oct}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMN 4 (2 cols): SSM2040 HPF & LPF + TG1 & TG2 TRANSIENT GENERATORS */}
            <div className="lg:col-span-2 flex flex-col gap-1.5">
              {/* HPF + TG1 (FILTER ENV) */}
              <div className="border border-white/80 rounded-[2px] p-1.5 flex flex-col gap-1.5">
                <div className="audity-navy-block px-1.5 py-0.5 rounded-[2px] flex items-center justify-between">
                  <span className="text-[9.5px] font-bold tracking-wider text-white uppercase">
                    HPF · TG1
                  </span>
                  <span className="text-[8px] font-mono-tabular text-sky-200">12dB</span>
                </div>
                <div className="audity-navy-block p-1.5 rounded-[2px] grid grid-cols-2 gap-1">
                  <RotaryKnob {...knobProps('hpfCutoff', 'HPF CUT')} size="sm" />
                  <RotaryKnob {...knobProps('hpfResonance', 'HPF RES')} size="sm" />
                </div>
                <div className="grid grid-cols-2 gap-1 pt-0.5">
                  <RotaryKnob {...knobProps('tg1Attack', 'ATK 1')} size="sm" />
                  <RotaryKnob {...knobProps('tg1Decay', 'DEC 1')} size="sm" />
                  <RotaryKnob {...knobProps('tg1Sustain', 'SUS 1')} size="sm" />
                  <RotaryKnob {...knobProps('tg1Release', 'REL 1')} size="sm" />
                </div>
              </div>

              {/* LPF SSM2040 */}
              <div className="border border-white/80 rounded-[2px] p-1.5 flex-1 flex flex-col justify-between gap-1">
                <div className="audity-navy-block px-1.5 py-0.5 rounded-[2px] flex items-center justify-between">
                  <span className="text-[9.5px] font-bold tracking-wider text-white uppercase">
                    LPF SSM2040
                  </span>
                  <span className="text-[8px] font-mono-tabular text-amber-300">24dB</span>
                </div>
                <div className="audity-navy-block p-1.5 rounded-[2px] flex items-center justify-around">
                  <RotaryKnob {...knobProps('lpfCutoff', 'CUTOFF')} size="md" />
                  <RotaryKnob {...knobProps('lpfResonance', 'RESO')} size="md" />
                </div>
                <div className="grid grid-cols-3 gap-0.5">
                  <RotaryKnob {...knobProps('lpfDrive', 'DRIVE')} size="sm" />
                  <RotaryKnob {...knobProps('lpfEnvAmount', 'ENV', true)} size="sm" />
                  <RotaryKnob {...knobProps('lpfKeyTrack', 'KYBD')} size="sm" />
                </div>
              </div>
            </div>

            {/* COLUMN 5 (2 cols): VCA / TG2 / RF STEREO FX / MASTER */}
            <div className="lg:col-span-2 flex flex-col gap-1.5">
              {/* VCA & TG2 AMP ENV */}
              <div className="border border-white/80 rounded-[2px] p-1.5 flex flex-col gap-1.5">
                <div className="audity-navy-block px-1.5 py-0.5 rounded-[2px] flex items-center justify-between">
                  <span className="text-[9.5px] font-bold tracking-wider text-white uppercase">
                    VCA · TG2
                  </span>
                  <span className="text-[8px] font-mono-tabular text-sky-200">AMP</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <RotaryKnob {...knobProps('tg2Attack', 'ATK 2')} size="sm" />
                  <RotaryKnob {...knobProps('tg2Decay', 'DEC 2')} size="sm" />
                  <RotaryKnob {...knobProps('tg2Sustain', 'SUS 2')} size="sm" />
                  <RotaryKnob {...knobProps('tg2Release', 'REL 2')} size="sm" />
                </div>
                <div className="audity-navy-block p-1 rounded-[2px] flex items-center justify-around">
                  <RotaryKnob {...knobProps('vcaVelocitySens', 'VELO')} size="sm" />
                  <RotaryKnob {...knobProps('masterVolume', 'MASTER')} size="md" />
                </div>
              </div>

              {/* RF STEREO FX STAGE */}
              <div className="border border-white/80 rounded-[2px] p-1.5 flex-1 flex flex-col justify-between gap-1">
                <div className="audity-navy-block px-1.5 py-0.5 rounded-[2px] flex items-center justify-between">
                  <span className="text-[9.5px] font-bold tracking-wider text-white uppercase">
                    RF · DSP FX
                  </span>
                  <span className="text-[8px] font-mono-tabular text-sky-200">STEREO</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <RotaryKnob {...knobProps('chorusMix', 'CHORUS')} size="sm" />
                  <RotaryKnob {...knobProps('delayMix', 'DELAY')} size="sm" />
                  <RotaryKnob {...knobProps('reverbMix', 'REVERB')} size="sm" />
                  <RotaryKnob {...knobProps('chorusRate', 'CH RT')} size="sm" />
                  <RotaryKnob {...knobProps('delayTime', 'D TIME')} size="sm" />
                  <RotaryKnob {...knobProps('reverbDecay', 'SPACE')} size="sm" />
                </div>
              </div>
            </div>
          </div>

          {/* Real-Time Dual-Preset Morph A <-> B Performance Bar */}
          <div className="mt-1.5 audity-navy-block border border-white/80 rounded-[2px] px-2 py-1.5 flex flex-wrap lg:flex-nowrap items-center justify-between gap-2">
            {/* Left Controls: MORPH Toggle + USER Filter + Slot A Picker */}
            <div className="flex items-center gap-1.5 min-w-0">
              <HardwarePushButton
                label="MORPH"
                ledColor="amber"
                active={morphActive}
                onClick={onToggleMorphActive}
                size="sm"
                title="Activate / Bypass Real-Time Preset Morph Interpolation"
              />
              <HardwarePushButton
                label="USR"
                ledColor="cyan"
                active={morphUserOnly}
                onClick={() => setMorphUserOnly((u) => !u)}
                size="sm"
                title={`Filter Morph A/B pickers to User Presets only (${userPresetList.length} saved)`}
              />

              <div className="flex items-center gap-1 bg-[#071c42] border border-amber-400/50 rounded-[2px] px-1.5 py-1">
                <span className="text-[9px] font-mono-tabular font-bold text-amber-300 shrink-0">
                  A
                </span>
                <select
                  aria-label="Morph Preset A"
                  value={morphSlotAId}
                  onChange={(e) => onSelectMorphSlot('A', e.target.value)}
                  className="bg-transparent text-[9.5px] font-mono-tabular text-white focus:outline-none max-w-[145px] truncate cursor-pointer"
                >
                  {userPresetList.length > 0 && (
                    <optgroup label={`★ User Presets (${userPresetList.length})`} className="bg-[#061836] text-amber-300">
                      {userPresetList.map((p) => (
                        <option key={p.id} value={p.id} className="bg-[#061836] text-white">
                          USR-{String(p.slot).padStart(2, '0')} {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {(!morphUserOnly || userPresetList.length === 0) && (
                    <optgroup label="Factory Library (A–H)" className="bg-[#061836] text-sky-300">
                      {factoryPresetList.map((p) => (
                        <option key={p.id} value={p.id} className="bg-[#061836] text-white">
                          {p.bank}-{String(p.slot).padStart(2, '0')} {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => onCaptureToMorphSlot('A')}
                  title="Capture current sound into User Bank & assign to Morph Slot A"
                  className="px-1 py-0.5 text-[8px] font-mono-tabular font-bold bg-amber-400/20 hover:bg-amber-400 hover:text-slate-950 text-amber-200 border border-amber-400/40 rounded-[2px] cursor-pointer shrink-0"
                >
                  CAP
                </button>
              </div>
            </div>

            {/* Center: Precision Real-Time Morph Crossfader Slider */}
            <div className="flex-1 min-w-[200px] flex flex-col gap-0.5 px-1">
              <div className="flex items-center justify-between text-[8.5px] font-mono-tabular leading-none">
                <span className="text-sky-200 font-semibold tracking-wider uppercase">
                  PRESET MORPH · A ↔ B
                </span>
                <span className={morphActive ? 'text-amber-300 font-bold' : 'text-sky-300/80'}>
                  A {Math.round((1 - morphAmount) * 100)}% / B {Math.round(morphAmount * 100)}%
                </span>
                <span className="text-sky-300/70 hidden sm:inline">DBL-CLICK 50/50</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-mono-tabular text-amber-300 font-bold">0%</span>
                <input
                  type="range"
                  aria-label="Real-Time Preset Morph Slider"
                  min={0}
                  max={1}
                  step={0.005}
                  value={morphAmount}
                  onChange={(e) => onMorphAmountChange(parseFloat(e.target.value))}
                  onDoubleClick={() => onMorphAmountChange(0.5)}
                  className="audity-morph-slider w-full cursor-ew-resize"
                />
                <span className="text-[8px] font-mono-tabular text-sky-300 font-bold">100%</span>
              </div>
            </div>

            {/* Right Controls: Slot B Picker + Swap + Store Morphed Hybrid */}
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="flex items-center gap-1 bg-[#071c42] border border-sky-400/50 rounded-[2px] px-1.5 py-1">
                <span className="text-[9px] font-mono-tabular font-bold text-sky-300 shrink-0">
                  B
                </span>
                <select
                  aria-label="Morph Preset B"
                  value={morphSlotBId}
                  onChange={(e) => onSelectMorphSlot('B', e.target.value)}
                  className="bg-transparent text-[9.5px] font-mono-tabular text-white focus:outline-none max-w-[145px] truncate cursor-pointer"
                >
                  {userPresetList.length > 0 && (
                    <optgroup label={`★ User Presets (${userPresetList.length})`} className="bg-[#061836] text-amber-300">
                      {userPresetList.map((p) => (
                        <option key={p.id} value={p.id} className="bg-[#061836] text-white">
                          USR-{String(p.slot).padStart(2, '0')} {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {(!morphUserOnly || userPresetList.length === 0) && (
                    <optgroup label="Factory Library (A–H)" className="bg-[#061836] text-sky-300">
                      {factoryPresetList.map((p) => (
                        <option key={p.id} value={p.id} className="bg-[#061836] text-white">
                          {p.bank}-{String(p.slot).padStart(2, '0')} {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => onCaptureToMorphSlot('B')}
                  title="Capture current sound into User Bank & assign to Morph Slot B"
                  className="px-1 py-0.5 text-[8px] font-mono-tabular font-bold bg-sky-400/20 hover:bg-sky-400 hover:text-slate-950 text-sky-200 border border-sky-400/40 rounded-[2px] cursor-pointer shrink-0"
                >
                  CAP
                </button>
              </div>

              <button
                type="button"
                onClick={onSwapMorphSlots}
                title="Swap Morph Presets A & B"
                className="audity-key-button px-1.5 py-1.5 rounded-[2px] border border-black/80 text-sky-200 hover:text-white cursor-pointer shrink-0"
              >
                <ArrowLeftRight className="w-3 h-3" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onStoreMorphedHybrid();
                  setStoredFlash(true);
                  setTimeout(() => setStoredFlash(false), 1400);
                }}
                title="Store current interpolated morph blend as a new User Preset"
                className={`px-2 py-1.5 rounded-[2px] text-[8.5px] font-mono-tabular font-bold border cursor-pointer shrink-0 transition-colors ${
                  storedFlash
                    ? 'bg-emerald-400 text-slate-950 border-emerald-200'
                    : 'bg-amber-400/90 hover:bg-amber-300 text-slate-950 border-black/70'
                }`}
              >
                {storedFlash ? 'SAVED!' : 'STORE'}
              </button>
            </div>
          </div>

          {/* Bottom Strip: F1–F12 Soft Function Switches & Iconic AUDITY E-MU Logo */}
          <div className="mt-1.5 pt-1.5 border-t border-white/80 flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { fn: 'F1', sub: 'WAVE', active: lcdPage === 'wave', onClick: () => onSelectLcdPage('wave') },
                { fn: 'F2', sub: 'FILTER', active: lcdPage === 'filter', onClick: () => onSelectLcdPage('filter') },
                { fn: 'F3', sub: 'SEQ/MOD', active: lcdPage === 'matrix', onClick: () => onSelectLcdPage('matrix') },
                { fn: 'F4', sub: 'MIDI/Q', active: lcdPage === 'midi', onClick: () => onSelectLcdPage('midi') },
                { fn: 'F5', sub: 'OPEN-MPC', active: lcdPage === 'openmpc', onClick: () => onSelectLcdPage('openmpc') },
              ].map((b) => (
                <HardwarePushButton
                  key={b.fn}
                  label={b.fn}
                  subLabel={b.sub}
                  active={b.active}
                  ledColor="cyan"
                  size="xs"
                  onClick={b.onClick}
                />
              ))}

              <div className="w-px h-7 bg-white/60 mx-1" />

              {(['poly16', 'unison', 'mono'] as const).map((vm, i) => (
                <HardwarePushButton
                  key={vm}
                  label={`F${6 + i}`}
                  subLabel={vm.toUpperCase()}
                  active={patch.voiceMode === vm}
                  ledColor="amber"
                  size="xs"
                  onClick={() => onPatchUpdate((prev) => ({ ...prev, voiceMode: vm }))}
                />
              ))}

              <div className="w-px h-7 bg-white/60 mx-1" />

              <HardwarePushButton
                label="F9"
                subLabel="UNISON+"
                active={patch.unisonDetune > 0.35}
                ledColor="none"
                size="xs"
                onClick={() =>
                  onParamChange('unisonDetune', patch.unisonDetune > 0.35 ? 0.18 : 0.6)
                }
              />
              <HardwarePushButton
                label="F10"
                subLabel="TUNE 0"
                active={false}
                ledColor="none"
                size="xs"
                onClick={() => onParamChange('masterTune', 0)}
              />
              <HardwarePushButton
                label="F11"
                subLabel="PATCHES"
                active={lcdPage === 'patches'}
                ledColor="cyan"
                size="xs"
                onClick={() => onSelectLcdPage('patches')}
              />
              <HardwarePushButton
                label="F12"
                subLabel="WIDE LCD"
                active={lcdExpanded}
                ledColor="cyan"
                size="xs"
                onClick={() => setLcdExpanded((e) => !e)}
              />
            </div>

            {/* Iconic 1978 AUDITY / E-MU SYSTEMS, INC. Silkscreen Logo */}
            <div className="flex flex-col items-end leading-none select-none pr-1">
              <span className="font-display text-2xl sm:text-[26px] font-bold tracking-[0.14em] text-[#113a78] drop-shadow-[0_1px_0_rgba(255,255,255,0.45)]">
                AUDITY
              </span>
              <span className="text-[9.5px] font-bold tracking-[0.26em] text-white/95 uppercase mt-0.5">
                E-MU SYSTEMS, INC.
              </span>
            </div>
          </div>
        </div>

        {/* Right Walnut Cheek Accent */}
        <div className="w-2.5 shrink-0 walnut-wood-vertical rounded-r-sm border-l border-black/50 hidden lg:block" />
      </div>
    </div>
  );
};
