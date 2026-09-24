import type { Skin, SynthParams } from './types';

export const NOTES = [
  { note: 'C4', freq: 261.63, black: false },
  { note: 'C#4', freq: 277.18, black: true },
  { note: 'D4', freq: 293.66, black: false },
  { note: 'D#4', freq: 311.13, black: true },
  { note: 'E4', freq: 329.63, black: false },
  { note: 'F4', freq: 349.23, black: false },
  { note: 'F#4', freq: 369.99, black: true },
  { note: 'G4', freq: 392.00, black: false },
  { note: 'G#4', freq: 415.30, black: true },
  { note: 'A4', freq: 440.00, black: false },
  { note: 'A#4', freq: 466.16, black: true },
  { note: 'B4', freq: 493.88, black: false },
  { note: 'C5', freq: 523.25, black: false },
  { note: 'C#5', freq: 554.37, black: true },
  { note: 'D5', freq: 587.33, black: false },
  { note: 'D#5', freq: 622.25, black: true },
  { note: 'E5', freq: 659.25, black: false },
];

export const KEY_MAP: { [k: string]: string } = {
  a: 'C4', s: 'D4', d: 'E4', f: 'F4', g: 'G4', h: 'A4', j: 'B4', k: 'C5', l: 'D5', ';': 'E5',
  w: 'C#4', e: 'D#4', t: 'F#4', y: 'G#4', u: 'A#4', o: 'C#5', p: 'D#5',
};

export const NOTE_TO_KEY: { [k: string]: string } = {};
for (const k in KEY_MAP) NOTE_TO_KEY[KEY_MAP[k]] = k;

export const ARP_PATTERNS = ['up', 'down', 'up-down', 'random'] as const;

export const SKINS: { value: Skin; label: string }[] = [
  { value: 'cyan', label: 'CYAN' },
  { value: 'red', label: 'RED' },
  { value: 'green', label: 'GREEN' },
  { value: 'purple', label: 'PURPLE' },
  { value: 'orange', label: 'ORANGE' },
  { value: 'yellow', label: 'YELLOW' },
  { value: 'white', label: 'WHITE' },
  { value: 'zebra', label: 'ZEBRA' },
  { value: 'tiger', label: 'TIGER' },
  { value: 'matrix', label: 'MATRIX' },
  { value: 'rasta', label: 'RASTA' },
  { value: 'skeuomorphic', label: 'SKEUOMORPHIC' },
  { value: 'juno', label: 'JUNO' },
];

export const DEFAULTS: SynthParams = {
  sine: 0, square: 0, sawtooth: 100, triangle: 0, noise: 0, syncAmount: 0, syncRatio: 0, pulseWidth: 50,
  attack: 0.1, decay: 2, decayCurve: 50, sustain: 1, release: 0.1,
  activeFilter: 1, filter1Enabled: false,
  filterType: 'lowpass', cutoff: 8000, resonance: 0, filterDrive: 0, filterSlope: 24,
  filterKeyTrack: false,
  filter2Enabled: false, filter2Type: 'lowpass', filter2Cutoff: 8000, filter2Resonance: 0, filter2Drive: 0, filter2Slope: 24, filter2KeyTrack: false,
  filterAttack: 0.01, filterDecay: 0.3, filterDecayCurve: 50, filterSustain: 0.4, filterRelease: 0.5, filterEnvAmount: 0,
  filterResAttack: 0.01, filterResDecay: 0.3, filterResDecayCurve: 50, filterResSustain: 0.4, filterResRelease: 0.5, filterResEnvAmount: 0,
  monoMode: false,
  slide: 0,
  lfoDiv: 4, lfoModifier: 'none', lfoShape: 'sine', lfoDepth: 0, lfoFinePitchDepth: 0, lfoPwDepth: 0, lfoCutoffDepth: 0, lfoResDepth: 0, lfoSyncDepth: 0, lfoRamp: 0, lfoPolarity: 1,
  volume: 25,
  masterPitch: 0,
  unisonVoices: 1, unisonDetune: 20, unisonSpread: 100, unisonRandomPhase: false,
  arpEnabled: false, arpRate: 8, arpPattern: 'up', arpOctaves: 1, arpDiv: 8, arpModifier: 'none',
  delayEnabled: false, delayDiv: 8, delayModifier: 'none', delayFeedback: 40, delayTone: 50, delayOffset: 0, delayWet: 50,
  compEnabled: false, compThreshold: -24, compRatio: 4, compAttack: 0.003, compRelease: 0.25,
  distEnabled: false, distAmount: 50, distTone: 50, distBitDepth: 100, distMix: 100,
  pitchEnvEnabled: false, pitchEnvAttack: 0.01, pitchEnvDecay: 0.3, pitchEnvCurve: 50, pitchEnvSustain: 0, pitchEnvRelease: 0.1, pitchEnvAmount: 0,
  syncEnvAttack: 0.01, syncEnvDecay: 0.3, syncEnvCurve: 50, syncEnvSustain: 0, syncEnvRelease: 0.1, syncEnvAmount: 0,
  modEnabled: false, modRate: 30, modDepth: 50, modMix: 50, modFeedback: 20,
  fxOrder: ['comp', 'dist', 'mod', 'delay'],
  harmonizerAmount: 0, harmonizerIntervals: [], harmonizerOctaveUp: false,
};
