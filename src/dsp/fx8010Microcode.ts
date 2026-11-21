export interface Fx8010Program {
  id: string;
  name: string;
  description: string;
  code: string;
}

export interface Fx8010ParseResult {
  valid: boolean;
  instructionCount: number;
  gprCount: number;
  tramReads: number;
  tramWrites: number;
  errors: Array<{ line: number; message: string }>;
  instructions: Array<{ op: string; args: string[] }>;
}

const VALID_FX8010_OPS = new Set([
  'MACS',
  'MACS1',
  'MACW',
  'MACW1',
  'MACINTS',
  'MACINTW',
  'ACC3',
  'MACMV',
  'ANDXOR',
  'TSTNEG',
  'LIMIT',
  'LIMIT1',
  'LOG',
  'EXP',
  'INTERP',
  'SKIP',
]);

export const FX8010_PROGRAMS: Fx8010Program[] = [
  {
    id: 'fx-audity-chorus',
    name: 'Audity BBD Ensemble (FX8010)',
    description: 'Modulated dual-tap TRAM delay with LFO interpolation modeled for L.A. FX8010.',
    code: `; FX8010 / DANE Microcode — Stereo BBD Ensemble
; Ref: easypx/FX8010-Emulator-Core
input inL, inR
output outL, outR
control chorusMix=0.35, chorusRate=0.65
static lfoPhase=0, lfoVal=0
idelay write tapW at 0
idelay read tapL at 480
idelay read tapR at 720

MACS   tapW, inL, 0.5, 0
INTERP lfoVal, tapL, lfoPhase, tapR
MACS   outL, inL, lfoVal, chorusMix
MACS   outR, inR, lfoVal, chorusMix
LIMIT  outL, outL, 0.98, -0.98`,
  },
  {
    id: 'fx-tape-tram',
    name: 'Warm Tape TRAM Echo',
    description: 'One-pole damped TRAM feedback delay line with soft saturation.',
    code: `; FX8010 / DANE Microcode — Warm Tape Echo
input inL, inR
output outL, outR
control delayMix=0.28, feedback=0.44, damp=0.35
static lpState=0
xdelay write dlyW at 0
xdelay read dlyR at 16384

INTERP lpState, lpState, damp, dlyR
MACS   dlyW, inL, lpState, feedback
ACC3   outL, inL, lpState, delayMix
ACC3   outR, inR, lpState, delayMix`,
  },
  {
    id: 'fx-ota-drive',
    name: 'SSM2040 OTA Soft-Clipper',
    description: 'FX8010 LOG/LIMIT saturator stage emulating analog OTA transistor compression.',
    code: `; FX8010 / DANE Microcode — OTA Nonlinear Drive
input inL, inR
output outL, outR
control drive=0.45, ceiling=0.92
static satL=0, satR=0

MACS   satL, 0, inL, drive
LIMIT  outL, satL, ceiling, -ceiling
MACS   satR, 0, inR, drive
LIMIT  outR, satR, ceiling, -ceiling`,
  },
];

export function parseFx8010Microcode(source: string): Fx8010ParseResult {
  const lines = source.split('\n');
  const errors: Array<{ line: number; message: string }> = [];
  const instructions: Array<{ op: string; args: string[] }> = [];
  const gprs = new Set<string>();
  let tramReads = 0;
  let tramWrites = 0;

  lines.forEach((rawLine, idx) => {
    const lineNum = idx + 1;
    const stripped = rawLine.split(';')[0].trim();
    if (!stripped) return;

    const lower = stripped.toLowerCase();
    if (
      lower.startsWith('input ') ||
      lower.startsWith('output ') ||
      lower.startsWith('control ') ||
      lower.startsWith('static ') ||
      lower.startsWith('const ')
    ) {
      const decls = stripped.slice(stripped.indexOf(' ') + 1).split(',');
      decls.forEach((d) => {
        const name = d.split('=')[0].trim();
        if (name) gprs.add(name);
      });
      return;
    }

    if (lower.startsWith('idelay ') || lower.startsWith('xdelay ')) {
      if (lower.includes(' read ')) tramReads++;
      else if (lower.includes(' write ')) tramWrites++;
      else errors.push({ line: lineNum, message: 'TRAM delay must specify read or write' });
      return;
    }

    const parts = stripped.split(/\s+/);
    const op = parts[0].toUpperCase();
    if (!VALID_FX8010_OPS.has(op)) {
      errors.push({ line: lineNum, message: `Unknown FX8010 opcode "${parts[0]}"` });
      return;
    }

    const argStr = stripped.slice(parts[0].length).trim();
    const args = argStr ? argStr.split(',').map((a) => a.trim()).filter(Boolean) : [];
    if (args.length < 2) {
      errors.push({ line: lineNum, message: `${op} requires 4 operands (R, A, X, Y)` });
      return;
    }
    args.forEach((a) => {
      if (!/^-?\d+(\.\d+)?$/.test(a)) gprs.add(a);
    });
    instructions.push({ op, args });
  });

  return {
    valid: errors.length === 0,
    instructionCount: instructions.length,
    gprCount: gprs.size,
    tramReads,
    tramWrites,
    errors,
    instructions,
  };
}
