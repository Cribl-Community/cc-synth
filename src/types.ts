export type ArpPattern = 'up' | 'down' | 'up-down' | 'random';
export type LfoShape = OscillatorType | 'noise' | 'sampleAndHold';
export type VizMode = 'scope' | 'spectrum';
export type Skin = 'cyan' | 'red' | 'green' | 'purple' | 'orange' | 'yellow' | 'white' | 'zebra' | 'matrix' | 'skeuomorphic' | 'juno' | 'tiger' | 'rasta';

export type ModalState =
  | { type: 'prompt'; message: string; defaultValue: string; resolve: (v: string | null) => void }
  | { type: 'confirm'; message: string; resolve: (v: boolean) => void }
  | null;

export interface SynthParams {
  sine: number;
  square: number;
  sawtooth: number;
  triangle: number;
  noise: number;
  syncAmount: number;
  syncRatio: number;
  pulseWidth: number;
  attack: number;
  decay: number;
  decayCurve: number;
  sustain: number;
  release: number;
  activeFilter: 1 | 2;
  filter1Enabled: boolean;
  filterType: BiquadFilterType;
  cutoff: number;
  resonance: number;
  filterDrive: number;
  filterSlope: 6 | 12 | 24 | 36;
  filterKeyTrack: boolean;
  filter2Enabled: boolean;
  filter2Type: BiquadFilterType;
  filter2Cutoff: number;
  filter2Resonance: number;
  filter2Drive: number;
  filter2Slope: 6 | 12 | 24 | 36;
  filter2KeyTrack: boolean;
  filterAttack: number;
  filterDecay: number;
  filterDecayCurve: number;
  filterSustain: number;
  filterRelease: number;
  filterEnvAmount: number;
  filterResAttack: number;
  filterResDecay: number;
  filterResDecayCurve: number;
  filterResSustain: number;
  filterResRelease: number;
  filterResEnvAmount: number;
  volume: number;
  masterPitch: number;
  monoMode: boolean;
  slide: number;
  lfoDiv: number;
  lfoModifier: 'none' | 'dotted' | 'triplet';
  lfoShape: LfoShape;
  lfoDepth: number;
  lfoFinePitchDepth: number;
  lfoPwDepth: number;
  lfoCutoffDepth: number;
  lfoResDepth: number;
  lfoSyncDepth: number;
  lfoRamp: number;
  lfoPolarity: 1 | -1;
  unisonVoices: number;
  unisonDetune: number;
  unisonSpread: number;
  unisonRandomPhase: boolean;
  arpEnabled: boolean;
  arpRate: number;
  arpDiv: number;
  arpModifier: 'none' | 'dotted' | 'triplet';
  arpPattern: ArpPattern;
  arpOctaves: number;
  delayEnabled: boolean;
  delayDiv: number;
  delayModifier: 'none' | 'dotted' | 'triplet';
  delayFeedback: number;
  delayTone: number;
  delayOffset: number;
  delayWet: number;
  compEnabled: boolean;
  compThreshold: number;
  compRatio: number;
  compAttack: number;
  compRelease: number;
  distEnabled: boolean;
  distAmount: number;
  distTone: number;
  distBitDepth: number;
  distMix: number;
  pitchEnvEnabled: boolean;
  pitchEnvAttack: number;
  pitchEnvDecay: number;
  pitchEnvCurve: number;
  pitchEnvSustain: number;
  pitchEnvRelease: number;
  pitchEnvAmount: number;
  syncEnvAttack: number;
  syncEnvDecay: number;
  syncEnvCurve: number;
  syncEnvSustain: number;
  syncEnvRelease: number;
  syncEnvAmount: number;
  modEnabled: boolean;
  modRate: number;
  modDepth: number;
  modMix: number;
  modFeedback: number;
  fxOrder: string[];
  harmonizerAmount: number;
  harmonizerIntervals: number[];
  harmonizerOctaveUp: boolean;
}

export interface ActiveNote {
  oscillators: OscillatorNode[];
  squareOscillators: OscillatorNode[];
  syncData: { modOsc: OscillatorNode; modGain: GainNode }[];
  unisonVoiceData: { osc: OscillatorNode; detuneFactor: number; panner: StereoPannerNode }[];
  waveGains: { [type: string]: GainNode[] };
  gainNode: GainNode;
  freq: number;
  lfoTargets: { detune: AudioParam; modGainGain: AudioParam }[];
  startTime: number;
  releaseTime: number | null;
  harmonizerData: { osc: OscillatorNode; gain: GainNode; interval: number }[];
}

export interface Preset {
  name: string;
  params: SynthParams;
  tempo: number;
  octave: number;
}
