import React, { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Printer,
  Cpu,
  Sliders,
  Radio,
  Layers,
  Activity,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { DEFAULT_QLINK_SLOTS, FACTORY_PRESETS } from '../data/presets';
import { FACTORY_WAVETABLES } from '../data/wavetables';
import { FX8010_PROGRAMS, parseFx8010Microcode } from '../dsp/fx8010Microcode';
import { AudityPatch } from '../types/synth';

interface OperatorsManualProps {
  onBackToSynth: () => void;
  userPresets: AudityPatch[];
}

const CHAPTERS = [
  { id: 'cover', num: '00', title: 'Cover Plate & Notice' },
  { id: 'architecture', num: '01', title: 'Architecture & Signal Flow' },
  { id: 'panel', num: '02', title: 'Front Panel Controls' },
  { id: 'touchscreen', num: '03', title: 'LCD Touchscreen & Wavetables' },
  { id: 'morph', num: '04', title: 'Real-Time Preset Morph (A ↔ B)' },
  { id: 'openmpc', num: '05', title: 'Open-MPC & FX8010 Core' },
  { id: 'presets', num: '06', title: '128-Preset Directory (A–H)' },
  { id: 'specs', num: '07', title: 'Technical Specifications' },
] as const;

const BANKS: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'> = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
];

const BANK_TITLES: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H', string> = {
  A: 'Bank A — Iconic 1978 Audity Signature Collection',
  B: 'Bank B — West-Coast Wavetable, FM & Ring Mod Lab',
  C: 'Bank C — Vintage Analog Heritage & L.A. Soundbanks',
  D: 'Bank D — Modern Open-MPC Hybrid, Techno & Cinematic',
  E: 'Bank E — Vintage Prog, Berlin School & Analog Cinema',
  F: 'Bank F — Electro, Acid, Dub & Experimental Rhythms',
  G: 'Bank G — Ethereal Keys, Acoustic Emulations & Choirs',
  H: 'Bank H — Lumina.Aerospace Telemetry, Space & Soundtracks',
};

const QWERTY_ROWS = [
  { keys: 'Z S X D C V G B H N J M', range: 'Lower Octave (C to B)' },
  { keys: ', (Comma)', range: 'Octave +1 C' },
  { keys: 'Q 2 W 3 E R 5 T 6 Y 7 U', range: 'Upper Octave (+12 st to +23 st)' },
  { keys: 'I 9 O 0 P', range: 'Top Extension (+24 st to +28 st)' },
  { keys: 'Spacebar', range: 'Start / Stop 16-Stage Sequencer' },
  { keys: 'Shift + Knob Drag', range: '10× Fine Parameter Resolution' },
  { keys: 'Double-Click Knob / Morph', range: 'Reset Knob to Default / Morph to 50/50' },
];

export const OperatorsManual: React.FC<OperatorsManualProps> = ({
  onBackToSynth,
  userPresets,
}) => {
  const [directoryBank, setDirectoryBank] = useState<'ALL' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'>('ALL');

  const scrollToSection = (id: string) => {
    const el = document.getElementById(`manual-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const visibleBanks = directoryBank === 'ALL' ? BANKS : [directoryBank];

  return (
    <div className="min-h-screen bg-[#0c0e12] text-slate-900 pb-16 print:bg-white print:pb-0">
      {/* Manual Action Ribbon (Hidden on Print) */}
      <div className="no-print sticky top-0 z-30 bg-[#0d1118]/95 backdrop-blur border-b border-slate-800 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToSynth}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium flex items-center gap-1.5 border border-slate-700 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Synthesizer</span>
          </button>
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono-tabular text-sky-300 truncate">
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              LUMINA.AEROSPACE · AUDITY &apos;78 OPERATOR&apos;S MANUAL (DOC LA-AUD78-OM-R4)
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="px-3.5 py-1.5 rounded bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print / Export PDF</span>
        </button>
      </div>

      {/* Main Layout: Sticky TOC + Paper Technical Manual */}
      <div className="max-w-[1260px] mx-auto px-3 sm:px-6 pt-6 flex items-start gap-6 print:block print:p-0 print:max-w-none">
        {/* Left Navigation Sidebar (Hidden on Print) */}
        <aside className="no-print hidden lg:block w-64 shrink-0 sticky top-16 bg-[#121721] border border-slate-800 rounded-md p-3.5 text-slate-200">
          <div className="text-[10px] font-mono-tabular tracking-widest uppercase text-sky-400 font-semibold pb-2 mb-2 border-b border-slate-800">
            Table of Contents
          </div>
          <nav className="flex flex-col gap-1">
            {CHAPTERS.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => scrollToSection(ch.id)}
                className="text-left px-2 py-1.5 rounded text-xs hover:bg-sky-500/15 hover:text-sky-300 transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span className="font-mono-tabular text-[10px] text-amber-300 font-semibold w-5">
                  {ch.num}
                </span>
                <span className="truncate">{ch.title}</span>
              </button>
            ))}
          </nav>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[10.5px] font-mono-tabular text-slate-400 space-y-1">
            <div>Factory Patches: <strong className="text-slate-200">128 (A–H)</strong></div>
            <div>User Patches: <strong className="text-amber-300">{userPresets.length} Saved</strong></div>
            <div>Wavetables: <strong className="text-slate-200">12 ROM + Custom</strong></div>
            <div>DSP Core: <strong className="text-sky-300">SSM2040 + FX8010</strong></div>
          </div>
        </aside>

        {/* Technical Manual Pages */}
        <article className="flex-1 min-w-0 space-y-8 print:space-y-4">
          {/* =============================================================== */}
          {/* PAGE 1: COVER PLATE                                             */}
          {/* =============================================================== */}
          <section
            id="manual-cover"
            className="print-break-after bg-[#f6f4ee] border border-slate-300 rounded-md shadow-2xl overflow-hidden print:shadow-none print:border-none print:rounded-none"
          >
            {/* Top Aerospace Masthead Strip */}
            <div className="bg-[#0d2b57] text-white px-6 sm:px-10 py-4 flex flex-wrap items-center justify-between gap-4 border-b-4 border-[#72b0da]">
              <div>
                <div className="text-[11px] font-mono-tabular tracking-[0.26em] text-sky-300 uppercase font-semibold">
                  LUMINA.AEROSPACE // INSTRUMENTATION &amp; SYNTHESIS DIVISION
                </div>
                <div className="text-[10px] font-mono-tabular text-sky-100/80 mt-0.5">
                  OPEN-MPC ARCHITECTURE · Z-80 / SSM2040 / FX8010-DANE HYBRID WORKSTATION
                </div>
              </div>
              <div className="text-right font-mono-tabular text-[10.5px]">
                <div className="text-amber-300 font-bold">DOC NO. LA-AUD78-OM-REV4</div>
                <div className="text-sky-200">RELEASE 4.0 · 128 PROGRAMS</div>
              </div>
            </div>

            <div className="p-6 sm:p-10 space-y-6">
              {/* Main Display Title */}
              <div className="border-b-2 border-[#0d2b57]/20 pb-5">
                <div className="inline-block px-2.5 py-1 bg-[#133f83] text-amber-300 font-mono-tabular text-[10px] font-bold tracking-[0.2em] uppercase rounded-[2px] mb-3">
                  OPERATOR&apos;S &amp; TECHNICAL REFERENCE MANUAL
                </div>
                <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-[0.06em] text-[#0b2347] leading-none">
                  LUMINA.AEROSPACE AUDITY &apos;78
                </h1>
                <p className="text-base sm:text-lg text-slate-700 mt-2.5 max-w-3xl leading-snug">
                  16-Voice Polyphonic Wavetable &amp; Dual-SSM2040 Synthesizer with Real-Time Preset Morphing, Integrated LCD Touchscreen Workflow, and Open-MPC FX8010 DSP Engine.
                </p>
              </div>

              {/* Cover Hardware Plate */}
              <figure className="bg-[#0e1522] p-3 sm:p-4 rounded-[4px] border-2 border-[#113a78] shadow-lg">
                <figcaption className="mt-3 pt-2.5 border-t border-slate-700/80 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[10px] font-mono-tabular text-sky-200">
                  <div><strong className="text-amber-300">[01]</strong> Z-80 LCD Touchscreen</div>
                  <div><strong className="text-amber-300">[02]</strong> 16-Memory Matrix</div>
                  <div><strong className="text-amber-300">[03]</strong> Dual Wavetable VCOs</div>
                  <div><strong className="text-amber-300">[04]</strong> Dual SSM2040 + TG1/2</div>
                  <div><strong className="text-amber-300">[05]</strong> Preset Morph A ↔ B</div>
                  <div><strong className="text-amber-300">[06]</strong> 61-Key Performance Bed</div>
                </figcaption>
              </figure>

              {/* Cover Highlights & Notice */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="bg-white border border-slate-300 p-3.5 rounded-[3px]">
                  <div className="text-[10px] font-mono-tabular font-bold text-[#133f83] uppercase tracking-wider mb-1">
                    1978 Prototype Heritage
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Faithfully models the Z-80 microprocessor architecture, sky-blue anodized panel, walnut cabinet framing, and cascaded SSM2040 resonant filter topology of the legendary 1978 L.A. Audity prototype.
                  </p>
                </div>
                <div className="bg-white border border-slate-300 p-3.5 rounded-[3px]">
                  <div className="text-[10px] font-mono-tabular font-bold text-[#133f83] uppercase tracking-wider mb-1">
                    Beyond Original Hardware
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Expands the 1978 design with 16-voice polyphony, real-time Fourier cross-wavetable Preset Morphing (A ↔ B), custom .WAV extraction, 128 factory patches, and live touchscreen filter/wave sculpting.
                  </p>
                </div>
                <div className="bg-white border border-slate-300 p-3.5 rounded-[3px]">
                  <div className="text-[10px] font-mono-tabular font-bold text-[#133f83] uppercase tracking-wider mb-1">
                    Open-MPC &amp; FX8010 Core
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    Engineered for standalone Akai MPC (GEN1 / GEN2) and desktop DAWs with 16 Q-Link fader routes, MIDI Learn, and programmable L.A. FX8010 DANE assembly microcode effects.
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-300 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono-tabular text-slate-500">
                <span>PUBLISHED BY LUMINA.AEROSPACE SYNTHESIS SYSTEMS · OWNER@LUMINOUSWORKSLLC.COM</span>
                <span>WAVETABLE REF: MATTETTI/E-MU-SOUNDBANKS · DSP: EASYPX/FX8010-EMULATOR-CORE</span>
              </div>
            </div>
          </section>

          {/* =============================================================== */}
          {/* SECTION 1: ARCHITECTURE & SIGNAL FLOW                           */}
          {/* =============================================================== */}
          <section
            id="manual-architecture"
            className="print-avoid-break bg-[#f6f4ee] border border-slate-300 rounded-md p-6 sm:p-10 shadow-xl space-y-6 print:shadow-none"
          >
            <SectionHeader
              num="01"
              title="Architecture & Signal Flow"
              subtitle="16-Voice Polyphonic Hybrid Architecture · Z-80 Digital Control + Analog SSM2040 Topology"
              icon={<Cpu className="w-5 h-5" />}
            />

            <p className="text-sm text-slate-700 leading-relaxed">
              The original <strong>1978/1980 L.A. Systems Audity</strong> was designed by Dave Rossum and Scott Wedge as one of the earliest microprocessor-controlled polyphonic synthesizers—combining a Z-80 host CPU with 16 modular voice cards built around Solid State Micro Technology (SSM) analog chips. Because only one prototype chassis was ever completed, few musicians ever touched its panel. <strong>Lumina.Aerospace Audity &apos;78</strong> resurrects that architecture for the Open-MPC ecosystem while replacing fixed analog oscillators with band-limited 44-harmonic Fourier wavetable synthesis and real-time Preset Morphing.
            </p>

            {/* Voice Signal Flow SVG Schematic */}
            <div className="bg-[#081a38] border-2 border-[#133f83] rounded-[4px] p-4 sm:p-5 text-white">
              <div className="flex items-center justify-between mb-3 text-[10px] font-mono-tabular text-sky-300 uppercase tracking-wider">
                <span>FIGURE 1.1 — PER-VOICE DSP SIGNAL FLOW &amp; MASTER FX8010 BUS</span>
                <span className="text-amber-300">16 VOICES · 48kHz / FLOAT32</span>
              </div>

              <svg
                viewBox="0 0 920 220"
                className="w-full h-auto"
                role="img"
                aria-label="Audity '78 Per-Voice and Master Effects Signal Flow Diagram"
              >
                <defs>
                  <marker id="arrowBlue" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L7,3 z" fill="#38bdf8" />
                  </marker>
                  <marker id="arrowAmber" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L7,3 z" fill="#fbbf24" />
                  </marker>
                </defs>

                {/* Oscillators Column */}
                <rect x="14" y="16" width="146" height="44" rx="3" fill="#0d2b57" stroke="#38bdf8" strokeWidth="1.5" />
                <text x="87" y="34" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="700" fontFamily="IBM Plex Mono, monospace">VCO 1 WAVETABLE</text>
                <text x="87" y="49" textAnchor="middle" fill="#7dd3fc" fontSize="9" fontFamily="IBM Plex Mono, monospace">44-Harm Fourier + Sub</text>

                <rect x="14" y="74" width="146" height="44" rx="3" fill="#0d2b57" stroke="#38bdf8" strokeWidth="1.5" />
                <text x="87" y="92" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="700" fontFamily="IBM Plex Mono, monospace">VCO 2 WT + SYNC</text>
                <text x="87" y="107" textAnchor="middle" fill="#7dd3fc" fontSize="9" fontFamily="IBM Plex Mono, monospace">Cross-Mod FM -&gt; VCO1</text>

                <rect x="14" y="132" width="146" height="36" rx="3" fill="#0d2b57" stroke="#fbbf24" strokeWidth="1.2" />
                <text x="87" y="149" textAnchor="middle" fill="#fde68a" fontSize="10" fontWeight="700" fontFamily="IBM Plex Mono, monospace">RING MOD (1 × 2)</text>
                <text x="87" y="161" textAnchor="middle" fill="#cbd5e1" fontSize="8.5" fontFamily="IBM Plex Mono, monospace">Bipolar Carrier/Mod</text>

                <rect x="14" y="176" width="146" height="32" rx="3" fill="#0d2b57" stroke="#94a3b8" strokeWidth="1.2" />
                <text x="87" y="196" textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="700" fontFamily="IBM Plex Mono, monospace">NOISE + COLOR LPF</text>

                {/* Cross-Mod vertical arrow */}
                <line x1="55" y1="74" x2="55" y2="62" stroke="#fbbf24" strokeWidth="1.5" markerEnd="url(#arrowAmber)" />

                {/* Mixer Node */}
                <rect x="195" y="76" width="54" height="68" rx="3" fill="#133f83" stroke="#ffffff" strokeWidth="1.2" />
                <text x="222" y="107" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="700" fontFamily="IBM Plex Mono, monospace">SUM</text>
                <text x="222" y="121" textAnchor="middle" fill="#7dd3fc" fontSize="8.5" fontFamily="IBM Plex Mono, monospace">MIX</text>

                <line x1="160" y1="38" x2="193" y2="92" stroke="#38bdf8" strokeWidth="1.4" markerEnd="url(#arrowBlue)" />
                <line x1="160" y1="96" x2="193" y2="106" stroke="#38bdf8" strokeWidth="1.4" markerEnd="url(#arrowBlue)" />
                <line x1="160" y1="150" x2="193" y2="120" stroke="#fbbf24" strokeWidth="1.4" markerEnd="url(#arrowAmber)" />
                <line x1="160" y1="192" x2="193" y2="132" stroke="#38bdf8" strokeWidth="1.4" markerEnd="url(#arrowBlue)" />

                {/* HPF */}
                <rect x="275" y="80" width="98" height="60" rx="3" fill="#0d2b57" stroke="#fbbf24" strokeWidth="1.5" />
                <text x="324" y="104" textAnchor="middle" fill="#fde68a" fontSize="11" fontWeight="700" fontFamily="IBM Plex Mono, monospace">SSM HPF</text>
                <text x="324" y="120" textAnchor="middle" fill="#e2e8f0" fontSize="9" fontFamily="IBM Plex Mono, monospace">12dB Resonant</text>
                <line x1="249" y1="110" x2="273" y2="110" stroke="#38bdf8" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

                {/* Cascaded SSM2040 + Drive */}
                <rect x="398" y="64" width="160" height="92" rx="3" fill="#0d2b57" stroke="#38bdf8" strokeWidth="1.8" />
                <text x="478" y="84" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="700" fontFamily="IBM Plex Mono, monospace">DUAL SSM2040 LPF</text>
                <text x="478" y="100" textAnchor="middle" fill="#7dd3fc" fontSize="9" fontFamily="IBM Plex Mono, monospace">LPF1 (12dB) -&gt; OTA DRIVE</text>
                <text x="478" y="114" textAnchor="middle" fill="#7dd3fc" fontSize="9" fontFamily="IBM Plex Mono, monospace">-&gt; LPF2 (12dB) = 24dB/oct</text>
                <text x="478" y="138" textAnchor="middle" fill="#fbbf24" fontSize="9" fontFamily="IBM Plex Mono, monospace">TG1 Filter Env + KeyTrack</text>
                <line x1="373" y1="110" x2="396" y2="110" stroke="#38bdf8" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

                {/* VCA + Pan */}
                <rect x="584" y="80" width="110" height="60" rx="3" fill="#0d2b57" stroke="#38bdf8" strokeWidth="1.5" />
                <text x="639" y="104" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="700" fontFamily="IBM Plex Mono, monospace">VCA · TG2</text>
                <text x="639" y="120" textAnchor="middle" fill="#7dd3fc" fontSize="9" fontFamily="IBM Plex Mono, monospace">RC ADSR + Stereo Pan</text>
                <line x1="558" y1="110" x2="582" y2="110" stroke="#38bdf8" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

                {/* FX8010 Stereo RF Stage */}
                <rect x="720" y="54" width="184" height="112" rx="3" fill="#133f83" stroke="#fbbf24" strokeWidth="1.6" />
                <text x="812" y="76" textAnchor="middle" fill="#fde68a" fontSize="11" fontWeight="700" fontFamily="IBM Plex Mono, monospace">FX8010 / RF STAGE</text>
                <text x="812" y="96" textAnchor="middle" fill="#e2e8f0" fontSize="9.5" fontFamily="IBM Plex Mono, monospace">1. Stereo BBD Chorus</text>
                <text x="812" y="112" textAnchor="middle" fill="#e2e8f0" fontSize="9.5" fontFamily="IBM Plex Mono, monospace">2. Warm Tape Delay</text>
                <text x="812" y="128" textAnchor="middle" fill="#e2e8f0" fontSize="9.5" fontFamily="IBM Plex Mono, monospace">3. Hall Convolver Reverb</text>
                <text x="812" y="148" textAnchor="middle" fill="#7dd3fc" fontSize="9.5" fontFamily="IBM Plex Mono, monospace">4. Limiter + Master Out</text>
                <line x1="694" y1="110" x2="718" y2="110" stroke="#38bdf8" strokeWidth="1.5" markerEnd="url(#arrowBlue)" />

                {/* Global LFO Callout */}
                <rect x="398" y="176" width="296" height="30" rx="3" fill="#061630" stroke="#fbbf24" strokeDasharray="4 3" strokeWidth="1.1" />
                <text x="546" y="195" textAnchor="middle" fill="#fde68a" fontSize="9.5" fontFamily="IBM Plex Mono, monospace">LFO (5 Shapes + Fade Delay) -&gt; Pitch / Filter / VCA</text>
                <line x1="478" y1="176" x2="478" y2="158" stroke="#fbbf24" strokeWidth="1.3" markerEnd="url(#arrowAmber)" />
                <line x1="639" y1="176" x2="639" y2="142" stroke="#fbbf24" strokeWidth="1.3" markerEnd="url(#arrowAmber)" />
              </svg>
            </div>

            {/* Voice Modes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-300 p-4 rounded-[3px]">
                <div className="font-mono-tabular text-xs font-bold text-[#133f83] mb-1">F6 · POLY16 MODE</div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Full 16-voice polyphonic voice allocation with subtle per-card stereo panning spread (emulating individual Audity voice card tolerances) and automatic oldest-voice stealing beyond 16 held notes.
                </p>
              </div>
              <div className="bg-white border border-slate-300 p-4 rounded-[3px]">
                <div className="font-mono-tabular text-xs font-bold text-[#133f83] mb-1">F7 · UNISON MODE</div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Stacks 3 stereo-panned voice cards per note (<code>-18 ct</code>, <code>0 ct</code>, <code>+18 ct</code> scaled by <strong>UNISON+ / SPREAD</strong>) for massive detuned leads and sub-zero basslines. Press <strong>F9 (UNISON+)</strong> to toggle extra spread depth.
                </p>
              </div>
              <div className="bg-white border border-slate-300 p-4 rounded-[3px]">
                <div className="font-mono-tabular text-xs font-bold text-[#133f83] mb-1">F8 · MONO MODE</div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Single-voice monophonic lead and bass mode with continuous exponential portamento (<strong>GLIDE</strong>) between overlapping or sequential notes.
                </p>
              </div>
            </div>
          </section>

          {/* =============================================================== */}
          {/* SECTION 2: FRONT PANEL & KEYBOARD CONTROLS                      */}
          {/* =============================================================== */}
          <section
            id="manual-panel"
            className="bg-[#f6f4ee] border border-slate-300 rounded-md p-6 sm:p-10 shadow-xl space-y-6 print:shadow-none"
          >
            <SectionHeader
              num="02"
              title="Front Panel & Performance Controls"
              subtitle="Complete Guide to the Sky-Blue Anodized Control Surface & 61-Key Bed"
              icon={<Sliders className="w-5 h-5" />}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <PanelCard title="Z-80 Computer, Keypad & 16-Memory Matrix">
                <ul className="space-y-1.5 text-xs text-slate-700">
                  <li><strong>3×4 Numeric Keypad (0–9, -, +):</strong> Type any 2-digit slot (<code>01</code>–<code>16</code>) to jump directly to a program in the active bank, or use <strong>- / +</strong> to step sequentially through slots 1–16.</li>
                  <li><strong>BNK A–D &amp; BNK E–H Pushbuttons:</strong> Cycle the 16-Memory Matrix across Factory Banks <strong>A–D</strong> (first button) and <strong>E–H</strong> (second button). Selecting any factory patch from the LCD browser automatically syncs the active matrix bank.</li>
                  <li><strong>INIT / RAND:</strong> <code>INIT</code> loads a clean initialized subtractive template (Slot A-16); <code>RAND</code> generates an instant musical mutation across wavetables, filter drive, ADSR, and stereo FX.</li>
                  <li><strong>PATCH / MIDI / SEQ / MCP:</strong> Dedicated hardware shortcuts to jump to the LCD Preset Browser, toggle <code>MIDI LEARN</code>, start/stop the 16-stage sequencer, or inspect the FX8010 Core.</li>
                </ul>
              </PanelCard>

              <PanelCard title="NOISE / RING & LFO Modulation Section">
                <ul className="space-y-1.5 text-xs text-slate-700">
                  <li><strong>NOISE &amp; COLOR:</strong> Injects white-to-dark-pink noise into the SSM2040 filter input; <code>COLOR</code> sweeps a dedicated pre-filter noise tone lowpass from <code>400 Hz</code> (warm wind/tape hiss) to <code>9.9 kHz</code> (crisp snare/breath).</li>
                  <li><strong>RING:</strong> Analog-style four-quadrant multiplier combining VCO 1 and VCO 2 to synthesize metallic bells, gong partials, and Dalek-like sidebands.</li>
                  <li><strong>LFO 5-Shape Matrix (SIN / TRI / SAW / SQR / S&amp;H):</strong> Global modulation oscillator (<code>0.05–24 Hz</code>) with <strong>DELAY</strong> fade-in (<code>0–2.5 s</code>) for expressive delayed vibrato, plus dedicated depth knobs for <strong>VIB</strong> (Pitch), <strong>WAH</strong> (Filter Cutoff), <strong>WT MOD</strong> (Wavetable Morph), and <strong>GLIDE</strong>.</li>
                </ul>
              </PanelCard>

              <PanelCard title="VCO 1 & VCO 2 (Dual Wavetable Oscillators)">
                <ul className="space-y-1.5 text-xs text-slate-700">
                  <li><strong>Wavetable Selector Silkscreen:</strong> Click the amber wavetable name in the VCO 1 or VCO 2 header bar to cycle through all 12 L.A. / SSM wavetables plus any custom drawn or imported <code>.WAV</code> tables.</li>
                  <li><strong>COARSE / FINE (DETUNE):</strong> Adjust oscillator tuning across <code>±12 semitones</code> (octave/fifth intervals) and <code>±50 cents</code> fine detune for thick analog chorusing.</li>
                  <li><strong>MORPH &amp; LEVEL:</strong> Sweeps smoothly between the primary waveform frame and its secondary harmonic target frame (<code>0–100%</code>) before mixing into the SSM2040 bus.</li>
                  <li><strong>X-MOD &amp; SYNC (VCO 2):</strong> Linear FM Cross-Modulation routes VCO 2 into VCO 1&apos;s frequency input; <strong>SYNC ON</strong> engages aggressive harmonic sync bite.</li>
                </ul>
              </PanelCard>

              <PanelCard title="SSM2040 Dual Filter, TG1/TG2 & RF Stereo FX">
                <ul className="space-y-1.5 text-xs text-slate-700">
                  <li><strong>HPF · TG1 (12dB):</strong> Resonant 2-pole High-Pass Filter (<code>20 Hz–6 kHz</code>) preceding the LPF, paired with <strong>TG1</strong> (Transient Generator 1 Filter ADSR).</li>
                  <li><strong>LPF SSM2040 (24dB):</strong> Two cascaded 12dB lowpass stages sandwiching an oversampled 2× <code>tanh</code> OTA soft-clipper (<strong>DRIVE</strong>), bipolar envelope depth (<strong>ENV</strong> <code>-100%..+100%</code>), and keyboard tracking (<strong>KYBD</strong>).</li>
                  <li><strong>VCA · TG2 (AMP):</strong> Dedicated exponential-decay amplifier envelope (<strong>ATK 2, DEC 2, SUS 2, REL 2</strong>) plus <strong>VELO</strong> dynamic response and <strong>MASTER</strong> output gain.</li>
                  <li><strong>RF · DSP FX:</strong> Stereo Bucket-Brigade Ensemble <strong>CHORUS</strong> (<code>CH RT</code> rate), <strong>TAPE DELAY</strong> (<code>D TIME</code>), and algorithmic Hall <strong>REVERB</strong> (<code>SPACE</code> decay) feeding a master studio limiter.</li>
                </ul>
              </PanelCard>
            </div>

            {/* Function Strip & Performance Keyboard Reference */}
            <div className="bg-white border border-slate-300 rounded-[4px] p-4 space-y-3">
              <div className="text-xs font-mono-tabular font-bold text-[#133f83] uppercase tracking-wider">
                Function Strip (F1–F12) &amp; QWERTY Studio Keyboard Mapping
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1 font-mono-tabular text-[11px] text-slate-700">
                  <div><strong>F1–F5:</strong> Select Touchscreen Pages (<code>WAVE</code>, <code>FILTER</code>, <code>SEQ/MOD</code>, <code>MIDI/Q</code>, <code>OPEN-MPC</code>)</div>
                  <div><strong>F6–F8:</strong> Polyphony Mode (<code>POLY16</code>, <code>UNISON</code>, <code>MONO</code>)</div>
                  <div><strong>F9–F10:</strong> Toggle Extra Unison Detune (<code>UNISON+</code>) / Zero Master Tune (<code>TUNE 0</code>)</div>
                  <div><strong>F11–F12:</strong> Jump to Integrated Preset Browser (<code>PATCHES</code>) / Expand 12-Col Wide Touchscreen (<code>WIDE LCD</code>)</div>
                  <div className="pt-1 text-slate-600"><strong>Left Console:</strong> Spring-return Pitch Wheel (<code>±2 st</code>), Mod Wheel (CC 1), <code>-OCT/+OCT</code>, <code>HOLD</code> sustain latch, and <code>CLR</code> All-Notes-Off panic.</div>
                </div>
                <table className="w-full text-[11px] font-mono-tabular border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-300">
                      <th className="text-left py-1 px-2">Key / Action</th>
                      <th className="text-left py-1 px-2">Musical Assignment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {QWERTY_ROWS.map((r) => (
                      <tr key={r.keys} className="border-b border-slate-200 last:border-0">
                        <td className="py-1 px-2 font-semibold text-[#133f83]">{r.keys}</td>
                        <td className="py-1 px-2 text-slate-700">{r.range}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* =============================================================== */}
          {/* SECTION 3: LCD TOUCHSCREEN & WAVETABLES                         */}
          {/* =============================================================== */}
          <section
            id="manual-touchscreen"
            className="bg-[#f6f4ee] border border-slate-300 rounded-md p-6 sm:p-10 shadow-xl space-y-6 print:shadow-none"
          >
            <SectionHeader
              num="03"
              title="Integrated LCD Touchscreen & Wavetables"
              subtitle="Open-MPC Single-Screen Workflow — Zero Pop-Out Modals"
              icon={<Activity className="w-5 h-5" />}
            />

            <p className="text-sm text-slate-700 leading-relaxed">
              Following standalone Open-MPC instrument conventions, every browser, oscilloscope, filter curve, sequencer, and FX8010 debugger operates directly inside the backlit Z-80 LCD touchscreen. Tap <strong>F12 (WIDE LCD)</strong> or the top-right expand icon at any time to stretch the touchscreen across all 12 panel columns for detailed wave drawing and patch browsing.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <TouchTabCard
                tab="PATCH (F11)"
                summary="Search all 128 Factory & User patches by name/description, filter by Bank (ALL, A–H, USER) or Category, assign Morph Slots [A]/[B], + SAVE new User presets, or Export/Import .json banks."
              />
              <TouchTabCard
                tab="WAVE (F1)"
                summary="Real-time wavetable editor & audio oscilloscope. Draw directly on the canvas with mouse/touch to sculpt custom waveforms, toggle live SCOPE overlay, normalize DC/peak (NORM), or import single-cycle .WAV files."
              />
              <TouchTabCard
                tab="FILTER (F2)"
                summary="Interactive SSM2040 dual-filter response plot. Drag the amber HPF or cyan LPF24 nodes directly to sweep cutoff & resonance while monitoring real-time TG1 & TG2 ADSR envelope shapes below."
              />
              <TouchTabCard
                tab="SEQ/MOD (F3)"
                summary="16-stage Audity step sequencer (50–210 BPM). Tap any vertical bar to transpose +3 semitones (-12 to +15 st); tap any step number button (1–16) to toggle step Gate on/off."
              />
              <TouchTabCard
                tab="MIDI/Q (F4)"
                summary="16 Open-MPC Q-Link faders (Q 1-8 / Q 9-16), Web MIDI hardware device selector, and one-click MIDI LEARN to map any physical knob/CC to any Audity parameter."
              />
              <TouchTabCard
                tab="MPC (F5)"
                summary="Inspect the 5-stage DSP graph, edit & validate L.A. FX8010 DANE assembly microcode live, or copy/download the full Open-MPC manifest bundle."
              />
            </div>

            {/* 12 Factory Wavetables Table */}
            <div className="bg-white border border-slate-300 rounded-[4px] overflow-hidden">
              <div className="bg-[#133f83] text-white px-4 py-2 text-xs font-mono-tabular font-bold uppercase tracking-wider flex items-center justify-between">
                <span>Factory Wavetable ROM Library (12 Single-Cycle Tables + Custom .WAV Import)</span>
                <span className="text-sky-200 font-normal">Ref: mattetti/e-mu-soundbanks</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-mono-tabular text-[10.5px] border-b border-slate-300">
                      <th className="text-left py-2 px-3">Wavetable Name</th>
                      <th className="text-left py-2 px-3">Source</th>
                      <th className="text-left py-2 px-3">ROM / Bank Ref</th>
                      <th className="text-left py-2 px-3">Harmonic Profile &amp; Morph Character</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FACTORY_WAVETABLES.map((wt) => (
                      <tr key={wt.id} className="border-b border-slate-200 last:border-0">
                        <td className="py-1.5 px-3 font-semibold text-[#0b2347] whitespace-nowrap">{wt.name}</td>
                        <td className="py-1.5 px-3 font-mono-tabular text-[11px] text-[#133f83] whitespace-nowrap">{wt.source}</td>
                        <td className="py-1.5 px-3 font-mono-tabular text-[10.5px] text-slate-500 whitespace-nowrap">{wt.bankRef}</td>
                        <td className="py-1.5 px-3 text-slate-700">{wt.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* =============================================================== */}
          {/* SECTION 4: REAL-TIME PRESET MORPH (A <-> B)                     */}
          {/* =============================================================== */}
          <section
            id="manual-morph"
            className="print-avoid-break bg-[#f6f4ee] border border-slate-300 rounded-md p-6 sm:p-10 shadow-xl space-y-5 print:shadow-none"
          >
            <SectionHeader
              num="04"
              title="Real-Time Preset Morph (A ↔ B)"
              subtitle="Continuous Logarithmic Parameter & 44-Harmonic Fourier Wavetable Interpolation"
              icon={<Sparkles className="w-5 h-5" />}
            />

            <p className="text-sm text-slate-700 leading-relaxed">
              Positioned immediately above the F1–F12 function strip, the <strong>PRESET MORPH · A ↔ B</strong> performance bar turns two completely unrelated patches into a continuous sonic continuum. Unlike simple crossfaders that merely blend audio volumes, Audity &apos;78 computes a live synthesized voice architecture at every slider position.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-white border border-slate-300 p-4 rounded-[3px] space-y-2">
                <div className="font-mono-tabular font-bold text-[#133f83] uppercase">
                  How the Morph Engine Works
                </div>
                <ul className="space-y-1.5 text-slate-700 list-disc pl-4">
                  <li><strong>Perceptual Logarithmic Scaling:</strong> HPF/LPF cutoffs, LFO rate, and all 6 TG1/TG2 envelope attack, decay, and release times interpolate geometrically (<code>a · (b/a)^t</code>) so filter sweeps and envelope openings feel smooth and linear to the human ear.</li>
                  <li><strong>Fourier Cross-Wavetable Blending:</strong> When Slot A and Slot B use different wavetables (for instance, <em>SSM Sawtooth</em> vs. <em>L.A. Glass Bell</em>), the DSP engine blends both 128-sample waveforms sample-by-sample and recalculates 44-harmonic <code>PeriodicWave</code> tables in real time—updating held notes with zero clicks or abrupt switches.</li>
                  <li><strong>Mod Matrix Merging:</strong> Enabled modulation matrix slots from Patch A (weighted by <code>1 - t</code>) and Patch B (weighted by <code>t</code>) are merged into a unified active routing table.</li>
                </ul>
              </div>

              <div className="bg-white border border-slate-300 p-4 rounded-[3px] space-y-2">
                <div className="font-mono-tabular font-bold text-[#133f83] uppercase">
                  Studio Morph Workflow
                </div>
                <ol className="space-y-1.5 text-slate-700 list-decimal pl-4">
                  <li><strong>Assign Source A &amp; Target B:</strong> Pick any two User or Factory patches from the <strong>A</strong> and <strong>B</strong> dropdowns (User presets always appear first under <em>★ User Presets</em>), or tap <strong>[A]</strong> and <strong>[B]</strong> directly on any preset card inside the LCD <strong>PATCH</strong> browser.</li>
                  <li><strong>Filter to User Presets (Optional):</strong> Press <strong>USR</strong> to restrict both A and B pickers strictly to your saved User Presets.</li>
                  <li><strong>Capture Tweaked Sounds (`CAP`):</strong> Press <strong>CAP</strong> next to A or B at any time to snapshot the current panel state into your User Bank and lock it into that Morph slot.</li>
                  <li><strong>Perform &amp; Store:</strong> Hold a chord or start the <strong>SEQ</strong>, glide the horizontal Morph slider from <code>0%</code> to <code>100%</code> (double-click jumps to <code>50/50</code>), press <strong>⇄</strong> to flip A/B seamlessly, or press <strong>STORE</strong> to freeze the hybrid blend as a permanent User Preset.</li>
                </ol>
              </div>
            </div>
          </section>

          {/* =============================================================== */}
          {/* SECTION 5: OPEN-MPC & FX8010 DANE MICROCODE CORE                */}
          {/* =============================================================== */}
          <section
            id="manual-openmpc"
            className="bg-[#f6f4ee] border border-slate-300 rounded-md p-6 sm:p-10 shadow-xl space-y-6 print:shadow-none"
          >
            <SectionHeader
              num="05"
              title="Open-MPC Integration & FX8010 Microcode Core"
              subtitle="Q-Link Hardware Mapping, MIDI CC Table & Programmable DANE DSP Assembly"
              icon={<Radio className="w-5 h-5" />}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Q-Link & Default MIDI CC Table */}
              <div className="bg-white border border-slate-300 rounded-[4px] overflow-hidden">
                <div className="bg-[#133f83] text-white px-4 py-2 text-xs font-mono-tabular font-bold uppercase tracking-wider">
                  Default Open-MPC Q-Link &amp; MIDI CC Map (1–16)
                </div>
                <table className="w-full text-[11px] font-mono-tabular border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-300">
                      <th className="text-left py-1.5 px-3">Q-Link</th>
                      <th className="text-left py-1.5 px-3">Parameter</th>
                      <th className="text-left py-1.5 px-3">Param Key</th>
                      <th className="text-right py-1.5 px-3">MIDI CC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEFAULT_QLINK_SLOTS.map((q) => (
                      <tr key={q.index} className="border-b border-slate-200 last:border-0">
                        <td className="py-1 px-3 font-bold text-[#133f83]">Q{String(q.index).padStart(2, '0')}</td>
                        <td className="py-1 px-3 text-slate-800">{q.label}</td>
                        <td className="py-1 px-3 text-slate-500">{q.param}</td>
                        <td className="py-1 px-3 text-right font-semibold text-amber-700">CC {q.cc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* FX8010 Microcode Programs & Syntax */}
              <div className="space-y-4">
                <div className="bg-white border border-slate-300 rounded-[4px] p-4 space-y-2">
                  <div className="text-xs font-mono-tabular font-bold text-[#133f83] uppercase">
                    FX8010 / DANE Microcode Architecture (easypx/FX8010-Emulator-Core)
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    The <strong>MPC → FX8010 CORE</strong> touchscreen view exposes a live DANE-compatible microcode assembler and register validator. The engine parses 16-bit/32-bit DSP opcodes (<code>MACS</code>, <code>MACW</code>, <code>ACC3</code>, <code>INTERP</code>, <code>LIMIT</code>, <code>ANDXOR</code>), general-purpose registers (<code>GPR</code>), delay memory declarations (<code>idelay</code>, <code>xdelay</code>), and I/O ports (<code>IN_L</code>, <code>OUT_L</code>).
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-1 text-[10.5px] font-mono-tabular bg-slate-50 p-2.5 rounded border border-slate-200 text-slate-700">
                    <div><code>MACS R, A, X, Y</code> → A + X·Y</div>
                    <div><code>ACC3 R, A, B, C</code> → A + B + C</div>
                    <div><code>INTERP R, A, X, Y</code> → A + X·(Y-A)</div>
                    <div><code>LIMIT R, A, B, C</code> → Clamp/Thresh</div>
                  </div>
                </div>

                <div className="bg-white border border-slate-300 rounded-[4px] overflow-hidden">
                  <div className="bg-[#0d2b57] text-white px-4 py-2 text-xs font-mono-tabular font-bold uppercase tracking-wider">
                    Built-In Audity FX8010 Microcode Programs
                  </div>
                  <div className="divide-y divide-slate-200">
                    {FX8010_PROGRAMS.map((prog) => {
                      const stats = parseFx8010Microcode(prog.code);
                      return (
                        <div key={prog.id} className="p-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-[#0b2347]">{prog.name}</span>
                            <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 bg-sky-100 text-[#133f83] rounded-[2px]">
                              {stats.instructionCount} OPS · {stats.gprCount} GPR
                            </span>
                          </div>
                          <p className="text-slate-600 mt-0.5 text-[11.5px]">{prog.description}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* =============================================================== */}
          {/* SECTION 6: COMPLETE 128-PRESET FACTORY DIRECTORY                */}
          {/* =============================================================== */}
          <section
            id="manual-presets"
            className="bg-[#f6f4ee] border border-slate-300 rounded-md p-6 sm:p-10 shadow-xl space-y-5 print:shadow-none"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SectionHeader
                num="06"
                title="Complete 128-Preset Factory Directory"
                subtitle="Banks A through H (16 Programs Per Bank) — Sculpted Wavetables, SSM2040 & TG1/TG2 Envelopes"
                icon={<Layers className="w-5 h-5" />}
              />

              {/* Interactive Bank Filter (Hidden on Print so all 128 print) */}
              <div className="no-print flex items-center flex-wrap gap-1 bg-white p-1 rounded border border-slate-300">
                {(['ALL', ...BANKS] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setDirectoryBank(b)}
                    className={`px-2 py-1 text-[10.5px] font-mono-tabular font-semibold rounded-[2px] cursor-pointer ${
                      directoryBank === b
                        ? 'bg-[#133f83] text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {b === 'ALL' ? 'ALL (128)' : `BANK ${b}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              {visibleBanks.map((bank) => {
                const bankPatches = FACTORY_PRESETS.filter((p) => p.bank === bank);
                return (
                  <div
                    key={bank}
                    className="print-avoid-break bg-white border border-slate-300 rounded-[4px] overflow-hidden"
                  >
                    <div className="bg-[#133f83] text-white px-4 py-2 text-xs font-mono-tabular font-bold uppercase tracking-wider flex items-center justify-between">
                      <span>{BANK_TITLES[bank]}</span>
                      <span className="text-amber-300">{bankPatches.length} PROGRAMS</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 font-mono-tabular text-[10px] border-b border-slate-300">
                            <th className="text-left py-1.5 px-2.5">Slot</th>
                            <th className="text-left py-1.5 px-2.5">Program Name</th>
                            <th className="text-left py-1.5 px-2.5">Cat</th>
                            <th className="text-left py-1.5 px-2.5">Mode</th>
                            <th className="text-left py-1.5 px-2.5">VCO 1 / VCO 2</th>
                            <th className="text-right py-1.5 px-2.5">LPF</th>
                            <th className="text-right py-1.5 px-2.5">TG2 A/R</th>
                            <th className="text-left py-1.5 px-2.5">Character Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bankPatches.map((p) => (
                            <tr key={p.id} className="border-b border-slate-200 last:border-0">
                              <td className="py-1.5 px-2.5 font-mono-tabular font-bold text-[#133f83] whitespace-nowrap">
                                {p.bank}-{String(p.slot).padStart(2, '0')}
                              </td>
                              <td className="py-1.5 px-2.5 font-semibold text-[#0b2347] whitespace-nowrap">
                                {p.name}
                              </td>
                              <td className="py-1.5 px-2.5 font-mono-tabular text-slate-600 whitespace-nowrap">
                                {p.category}
                              </td>
                              <td className="py-1.5 px-2.5 font-mono-tabular uppercase text-slate-600 whitespace-nowrap">
                                {p.voiceMode}
                              </td>
                              <td className="py-1.5 px-2.5 font-mono-tabular text-[10px] text-slate-600 whitespace-nowrap">
                                {p.vco1WaveId} / {p.vco2WaveId}
                              </td>
                              <td className="py-1.5 px-2.5 font-mono-tabular text-right text-slate-700 whitespace-nowrap">
                                {Math.round(p.lpfCutoff)}Hz
                              </td>
                              <td className="py-1.5 px-2.5 font-mono-tabular text-right text-slate-700 whitespace-nowrap">
                                {p.tg2Attack.toFixed(2)}s / {p.tg2Release.toFixed(2)}s
                              </td>
                              <td className="py-1.5 px-2.5 text-slate-600 min-w-[220px]">
                                {p.description}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* =============================================================== */}
          {/* SECTION 7: TECHNICAL SPECIFICATIONS                             */}
          {/* =============================================================== */}
          <section
            id="manual-specs"
            className="print-avoid-break bg-[#f6f4ee] border border-slate-300 rounded-md p-6 sm:p-10 shadow-xl space-y-5 print:shadow-none"
          >
            <SectionHeader
              num="07"
              title="Technical Specifications & Calibration"
              subtitle="Lumina.Aerospace Audity '78 Open-MPC Reference Specification"
              icon={<Volume2 className="w-5 h-5" />}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono-tabular bg-white border border-slate-300 rounded-[4px] p-5">
              <div className="space-y-2">
                <SpecRow k="Synthesis Engine" v="16-Voice Polyphonic Wavetable + Subtractive" />
                <SpecRow k="Oscillators Per Voice" v="VCO 1 (44-Harm Fourier + Sub), VCO 2 (Sync + FM)" />
                <SpecRow k="Wavetable Storage" v="12 L.A. / SSM ROM Tables + Draw & .WAV Import" />
                <SpecRow k="Preset Morph Engine" v="Logarithmic Param + Real-Time Cross-Table Blend" />
                <SpecRow k="High-Pass Filter" v="12dB/Octave Resonant (20 Hz – 6,000 Hz)" />
                <SpecRow k="Low-Pass Filter" v="24dB/Oct Dual SSM2040 + 2× OTA Soft-Clip Drive" />
              </div>
              <div className="space-y-2">
                <SpecRow k="Transient Generators" v="TG1 (Filter RC ADSR) + TG2 (VCA Amp RC ADSR)" />
                <SpecRow k="LFO & Mod Matrix" v="5 Shapes (0.05–24 Hz) + Delay + 3–6 Mod Slots" />
                <SpecRow k="FX8010 / RF Stage" v="Stereo BBD Chorus, Tape Delay, Hall Reverb, Limiter" />
                <SpecRow k="Sequencer" v="16-Stage Step Sequencer (50–210 BPM + Gate/Accent)" />
                <SpecRow k="Control & MIDI" v="Web MIDI API, MIDI Learn, 16 Open-MPC Q-Links" />
                <SpecRow k="Program Memory" v="128 Factory Presets (Banks A–H) + Local User Bank" />
              </div>
            </div>

            <div className="text-[10.5px] font-mono-tabular text-slate-500 pt-2 border-t border-slate-300 flex flex-wrap items-center justify-between gap-2">
              <span>END OF DOCUMENT — LUMINA.AEROSPACE AUDITY &apos;78 OPERATOR&apos;S MANUAL</span>
              <span>DOC LA-AUD78-OM-REV4</span>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
};

const SectionHeader: React.FC<{
  num: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}> = ({ num, title, subtitle, icon }) => (
  <div className="border-b-2 border-[#133f83]/25 pb-3 flex items-start justify-between gap-4">
    <div>
      <div className="text-[10.5px] font-mono-tabular font-bold tracking-[0.2em] text-[#133f83] uppercase">
        SECTION {num}
      </div>
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0b2347] tracking-wide mt-0.5">
        {title}
      </h2>
      <p className="text-xs font-mono-tabular text-slate-600 mt-1">{subtitle}</p>
    </div>
    <div className="w-10 h-10 rounded-[3px] bg-[#133f83] text-amber-300 flex items-center justify-center shrink-0">
      {icon}
    </div>
  </div>
);

const PanelCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white border border-slate-300 rounded-[4px] p-4 space-y-2">
    <div className="text-xs font-mono-tabular font-bold text-[#133f83] uppercase border-b border-slate-200 pb-1.5">
      {title}
    </div>
    {children}
  </div>
);

const TouchTabCard: React.FC<{ tab: string; summary: string }> = ({ tab, summary }) => (
  <div className="bg-white border border-slate-300 rounded-[4px] p-3.5 space-y-1.5">
    <div className="inline-block px-2 py-0.5 bg-[#081a38] text-sky-300 font-mono-tabular text-[10px] font-bold rounded-[2px]">
      {tab}
    </div>
    <p className="text-xs text-slate-700 leading-relaxed">{summary}</p>
  </div>
);

const SpecRow: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-1 last:border-0">
    <span className="text-slate-500 uppercase text-[10.5px] shrink-0">{k}</span>
    <span className="text-[#0b2347] font-semibold text-right">{v}</span>
  </div>
);
