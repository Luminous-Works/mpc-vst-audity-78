import { useEffect, useRef, useState, useCallback } from 'react';
import { MidiCcMapping, ParamKey } from '../types/synth';
import { PARAMETER_DESCRIPTORS } from '../data/wavetables';

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
}

export interface MidiActivityEvent {
  type: 'Note On' | 'Note Off' | 'CC' | 'Pitch Bend';
  channel: number;
  data1: number;
  data2: number;
  timestamp: number;
}

interface UseMidiOptions {
  mappings: MidiCcMapping[];
  onSetMappings: (next: MidiCcMapping[]) => void;
  onParamChange: (key: ParamKey, value: number) => void;
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
  onPitchBend: (semitones: number) => void;
  onModWheel: (value: number) => void;
}

export function scaleCcToParam(key: ParamKey, ccValue: number): number {
  const desc = PARAMETER_DESCRIPTORS[key];
  const norm = Math.max(0, Math.min(1, ccValue / 127));
  if (desc.curve === 'log' && desc.min > 0) {
    return desc.min * Math.pow(desc.max / desc.min, norm);
  }
  const raw = desc.min + norm * (desc.max - desc.min);
  return Math.round(raw / desc.step) * desc.step;
}

export function useMidiController({
  mappings,
  onSetMappings,
  onParamChange,
  onNoteOn,
  onNoteOff,
  onPitchBend,
  onModWheel,
}: UseMidiOptions) {
  const [midiSupported, setMidiSupported] = useState(false);
  const [midiPermissionState, setMidiPermissionState] = useState<'idle' | 'granted' | 'denied' | 'unsupported'>('idle');
  const [devices, setDevices] = useState<MidiDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all');
  const [learnTargetParam, setLearnTargetParam] = useState<ParamKey | null>(null);
  const [lastEvent, setLastEvent] = useState<MidiActivityEvent | null>(null);
  const [ccValues, setCcValues] = useState<Record<number, number>>({});

  const mappingsRef = useRef(mappings);
  const learnTargetRef = useRef(learnTargetParam);
  const selectedDeviceRef = useRef(selectedDeviceId);

  mappingsRef.current = mappings;
  learnTargetRef.current = learnTargetParam;
  selectedDeviceRef.current = selectedDeviceId;

  const callbacksRef = useRef({
    onSetMappings,
    onParamChange,
    onNoteOn,
    onNoteOff,
    onPitchBend,
    onModWheel,
  });
  callbacksRef.current = {
    onSetMappings,
    onParamChange,
    onNoteOn,
    onNoteOff,
    onPitchBend,
    onModWheel,
  };

  const handleIncomingCc = useCallback((cc: number, value: number, channel = 1) => {
    setCcValues((prev) => ({ ...prev, [cc]: value }));
    setLastEvent({
      type: 'CC',
      channel,
      data1: cc,
      data2: value,
      timestamp: Date.now(),
    });

    // MIDI Learn active?
    if (learnTargetRef.current) {
      const targetParam = learnTargetRef.current;
      const desc = PARAMETER_DESCRIPTORS[targetParam];
      const filtered = mappingsRef.current.filter((m) => m.cc !== cc && m.param !== targetParam);
      const updated = [...filtered, { cc, param: targetParam, label: desc.shortLabel }];
      callbacksRef.current.onSetMappings(updated);
      setLearnTargetParam(null);
      callbacksRef.current.onParamChange(targetParam, scaleCcToParam(targetParam, value));
      return;
    }

    // Standard CC1 Mod Wheel
    if (cc === 1) {
      callbacksRef.current.onModWheel(value / 127);
    }

    // Mapped CCs
    for (const m of mappingsRef.current) {
      if (m.cc === cc) {
        callbacksRef.current.onParamChange(m.param, scaleCcToParam(m.param, value));
      }
    }
  }, []);

  const connectMidi = useCallback(async () => {
    if (!('requestMIDIAccess' in navigator)) {
      setMidiSupported(false);
      setMidiPermissionState('unsupported');
      return;
    }
    setMidiSupported(true);
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      setMidiPermissionState('granted');

      const refreshInputs = () => {
        const list: MidiDeviceInfo[] = [];
        access.inputs.forEach((input) => {
          list.push({
            id: input.id,
            name: input.name || 'MIDI Device',
            manufacturer: input.manufacturer || 'Generic',
          });
          input.onmidimessage = (ev) => {
            if (
              selectedDeviceRef.current !== 'all' &&
              selectedDeviceRef.current !== input.id
            ) {
              return;
            }
            const data = ev.data;
            if (!data || data.length < 2) return;
            const status = data[0] & 0xf0;
            const ch = (data[0] & 0x0f) + 1;
            const d1 = data[1];
            const d2 = data[2] ?? 0;

            if (status === 0x90 && d2 > 0) {
              callbacksRef.current.onNoteOn(d1, d2 / 127);
              setLastEvent({ type: 'Note On', channel: ch, data1: d1, data2: d2, timestamp: Date.now() });
            } else if (status === 0x80 || (status === 0x90 && d2 === 0)) {
              callbacksRef.current.onNoteOff(d1);
              setLastEvent({ type: 'Note Off', channel: ch, data1: d1, data2: d2, timestamp: Date.now() });
            } else if (status === 0xb0) {
              handleIncomingCc(d1, d2, ch);
            } else if (status === 0xe0) {
              const bend14 = (d2 << 7) | d1;
              const norm = (bend14 - 8192) / 8192;
              callbacksRef.current.onPitchBend(norm * 2);
              setLastEvent({ type: 'Pitch Bend', channel: ch, data1: d1, data2: d2, timestamp: Date.now() });
            }
          };
        });
        setDevices(list);
      };

      refreshInputs();
      access.onstatechange = refreshInputs;
    } catch {
      setMidiPermissionState('denied');
    }
  }, [handleIncomingCc]);

  useEffect(() => {
    if ('requestMIDIAccess' in navigator) {
      setMidiSupported(true);
      void connectMidi();
    } else {
      setMidiPermissionState('unsupported');
    }
  }, [connectMidi]);

  return {
    midiSupported,
    midiPermissionState,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    learnTargetParam,
    setLearnTargetParam,
    lastEvent,
    ccValues,
    connectMidi,
    triggerVirtualCc: handleIncomingCc,
  };
}
