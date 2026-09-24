import * as React from 'react';
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import './App.css';

import type { SynthParams, ActiveNote, Skin, Preset, VizMode, ArpPattern, LfoShape } from './types';
import { NOTES, KEY_MAP, NOTE_TO_KEY, ARP_PATTERNS, SKINS, DEFAULTS } from './constants';
import { isDeployed, isLivePreview, KV_BASE, storageGet, storageSet } from './storage';
import { clampNotchQ, FILTER_DRIVE_HEADROOM, makeFilterDriveCurve, BIT_CRUSHER_WORKLET_URL } from './audio';
import { SkinContext } from './SkinContext';

import { Knob } from './components/Knob';
import { WaveSlider, SawtoothIcon } from './components/WaveSlider';
import { VizPanel } from './components/VizPanel';
import { MatrixRain } from './components/MatrixRain';
import { PresetDropdown } from './components/PresetDropdown';
import { SkinDropdown } from './components/SkinDropdown';
import { AppModal } from './components/AppModal';
import { useModal } from './hooks/useModal';
import { AdsrViz } from './components/AdsrViz';


const presetModules = import.meta.glob('../presets/*.json', { eager: true }) as Record<string, { default: { name: string; tempo: number; octave: number; params: Record<string, unknown> } }>;
const BUNDLED_PRESETS_MAP = Object.fromEntries(
  Object.values(presetModules).map(m => [m.default.name, m.default])
);

export default function App() {
  const { modal, showPrompt, showConfirm, dismiss } = useModal();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const masterDCBlockRef = useRef<BiquadFilterNode | null>(null);
  const filterNodesRef = useRef<BiquadFilterNode[]>([]);
  const filter2NodesRef = useRef<BiquadFilterNode[]>([]);
  const filterDriveRef = useRef<WaveShaperNode | null>(null);
  const filter2DriveRef = useRef<WaveShaperNode | null>(null);
  const filterDriveInRef = useRef<GainNode | null>(null);
  const filter2DriveInRef = useRef<GainNode | null>(null);
  const preFilter2Ref = useRef<GainNode | null>(null);
  const activeNotesRef = useRef<Map<string, ActiveNote>>(new Map());
  const arpTimerRef = useRef<number | null>(null);
  const arpIndexRef = useRef(0);
  const mouseHeldNotesRef = useRef<Set<string>>(new Set());
  // Tracks whether the primary mouse button is held so dragging across keys glissandos.
  const isMouseDownRef = useRef(false);
  const bpmRepeatRef = useRef<number | null>(null);
  const startBpmRepeat = (delta: number) => {
    if (bpmRepeatRef.current !== null) return;
    const fire = () => { setTempo(t => { const n = clampTempo(t + delta); setTempoInput(String(n)); return n; }); };
    fire();
    bpmRepeatRef.current = window.setInterval(fire, 80);
  };
  const stopBpmRepeat = () => {
    if (bpmRepeatRef.current !== null) { clearInterval(bpmRepeatRef.current); bpmRepeatRef.current = null; }
  };
  const lastFreqRef = useRef<number | null>(null);
  const lfoOscRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);
  const lfoFinePitchGainRef = useRef<GainNode | null>(null);
  const lfoCutoffGainRef = useRef<GainNode | null>(null);
  const lfoResGainRef = useRef<GainNode | null>(null);
  const lfoUniRef = useRef<GainNode | null>(null);
  const lfoScaleRef = useRef<GainNode | null>(null);
  const lfoDCRef = useRef<ConstantSourceNode | null>(null);
  const lfoSyncGainRef = useRef<GainNode | null>(null);
  const lfoPolarityRef = useRef<GainNode | null>(null);
  const lfoShapeGainRef = useRef<GainNode | null>(null);
  const lfoRampGainRef = useRef<GainNode | null>(null);
  const lfoSahRef = useRef<ConstantSourceNode | null>(null);
  const lfoSahTimerRef = useRef<number | null>(null);
  const lfoNoiseRef = useRef<AudioBufferSourceNode | null>(null);
  const lfoNoiseFilterRef = useRef<BiquadFilterNode | null>(null);
  const lfoAnalyserRef = useRef<AnalyserNode | null>(null);
  const pwRafRef = useRef<number | null>(null);
  const noiseBufferRef = useRef<AudioBuffer | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const delayFeedbackRef = useRef<GainNode | null>(null);
  const delayToneFilterRef = useRef<BiquadFilterNode[] | null>(null);
  const delayWetRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const distortionRef = useRef<WaveShaperNode | null>(null);
  const distBitCrushRef = useRef<AudioWorkletNode | null>(null);
  const distDCBlockRef = useRef<BiquadFilterNode | null>(null);
  const distToneRef = useRef<BiquadFilterNode | null>(null);
  const distWetRef = useRef<GainNode | null>(null);
  const distDryRef = useRef<GainNode | null>(null);
  const preFilterRef = useRef<GainNode | null>(null);
  const fxInputRef = useRef<GainNode | null>(null);
  // Per-effect input gain nodes — rewired in series according to fxOrder
  const fxInComp = useRef<GainNode | null>(null);
  const fxOutComp = useRef<AudioNode | null>(null);
  const fxInDist = useRef<GainNode | null>(null);
  const fxOutDist = useRef<AudioNode | null>(null);
  const fxInDelay = useRef<GainNode | null>(null);
  const fxOutDelay = useRef<AudioNode | null>(null);
  const fxInMod = useRef<GainNode | null>(null);
  const fxOutMod = useRef<AudioNode | null>(null);
  // Mod effect internal nodes
  const modLfoRef = useRef<OscillatorNode | null>(null);
  const modLfoGainRef = useRef<GainNode | null>(null);
  const modFeedbackRef = useRef<GainNode | null>(null);
  const modWetRef = useRef<GainNode | null>(null);
  const modDryRef = useRef<GainNode | null>(null);
  const modPhaserFiltersRef = useRef<BiquadFilterNode[]>([]);
  const vizAnalyserRef = useRef<AnalyserNode | null>(null);
  const [vizMode, setVizMode] = useState<VizMode>('scope');

  const envNodeRef = useRef<{ startTime: number; releaseTime: number | null } | null>(null);

  const [params, setParams] = useState<SynthParams>(DEFAULTS);

  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [arpHeld, setArpHeld] = useState<string[]>([]);
  const [kbMode, setKbMode] = useState<boolean>(true);
  const kbModeRef = useRef(false);
  useEffect(() => { kbModeRef.current = kbMode; }, [kbMode]);
  useEffect(() => { storageSet('cribl-synth-kbmode', kbMode); }, [kbMode]);

  const [octave, setOctave] = useState<number>(4);
  const octaveRef = useRef(4);
  useEffect(() => { octaveRef.current = octave; }, [octave]);
  useEffect(() => { storageSet('cribl-synth-octave', octave); }, [octave]);

  const INIT_PRESET: Preset = { name: 'init', params: DEFAULTS, tempo: 120, octave: 4 };

  const bundledPresets: Preset[] = Object.values(BUNDLED_PRESETS_MAP).map(p => ({
    name: p.name,
    tempo: p.tempo ?? 120,
    octave: p.octave ?? 4,
    params: { ...DEFAULTS, ...(p.params as Partial<SynthParams>) },
  }));

  const loadPresets = (): Preset[] => {
    return [INIT_PRESET, ...bundledPresets.sort((a, b) => a.name.localeCompare(b.name))];
  };

  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [activePreset, setActivePreset] = useState<string>('');

  const presetKey = (name: string) => `preset/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

  const savePreset = (preset: Preset) => {
    const body = JSON.stringify(preset);
    if (isLivePreview()) {
      fetch('/api/presets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
      return;
    }
    if (!window.CRIBL_API_URL) return;
    storageSet(presetKey(preset.name), preset);
    // If a tombstone exists for this name, remove it
    storageGet<string[]>('presets-deleted').then(deleted => {
      if (deleted?.includes(preset.name)) {
        storageSet('presets-deleted', deleted.filter(n => n !== preset.name));
      }
    });
  };

  const deletePreset = (name: string) => {
    if (isLivePreview()) {
      fetch('/api/presets', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).catch(() => {});
      return;
    }
    if (!window.CRIBL_API_URL) return;
    fetch(`${KV_BASE()}/${presetKey(name)}`, { method: 'DELETE' }).catch(() => {});
    // Record tombstone so bundled presets with this name don't reappear on reload
    storageGet<string[]>('presets-deleted').then(deleted => {
      const current = deleted ?? [];
      if (!current.includes(name)) storageSet('presets-deleted', [...current, name]);
    });
  };

  const [tempo, setTempo] = useState<number>(120);
  const [tempoInput, setTempoInput] = useState<string>('120');
  useEffect(() => { storageSet('cribl-synth-tempo', tempo); }, [tempo]);

  const [skin, setSkin] = useState<Skin>('cyan');
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-skin', skin);
  }, [skin]);

  const [hydrated, setHydrated] = useState(false);

  // Hydrate all persisted state from storage on mount
  useEffect(() => {
    const minDelay = new Promise<void>(r => setTimeout(r, 1500));
    (async () => {
      const [savedParams, savedKbMode, savedOctave, savedTempo, savedVizMode, savedSkin] = await Promise.all([
        storageGet<SynthParams>('cribl-synth-params'),
        storageGet<boolean>('cribl-synth-kbmode'),
        storageGet<number>('cribl-synth-octave'),
        storageGet<number>('cribl-synth-tempo'),
        storageGet<VizMode>('vizMode'),
        storageGet<Skin>('cribl-synth-skin'),
      ]);
      if (savedParams != null) setParams(p => ({ ...p, ...savedParams }));
      if (savedKbMode != null) setKbMode(savedKbMode);
      if (savedOctave != null) setOctave(savedOctave);
      if (savedTempo != null) { setTempo(savedTempo); setTempoInput(String(savedTempo)); }
      if (savedVizMode != null) setVizMode(savedVizMode);
      if (savedSkin != null && SKINS.some(s => s.value === savedSkin)) setSkin(savedSkin);

      // In deployed mode (but not live preview), load user presets from KV and apply tombstones
      if (isDeployed() && !isLivePreview()) {
        try {
          const [keysRes, deleted] = await Promise.all([
            fetch(`${KV_BASE()}/keys`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prefix: 'preset/' }),
            }),
            storageGet<string[]>('presets-deleted'),
          ]);
          const tombstones = new Set(deleted ?? []);
          if (keysRes.ok) {
            const keys: string[] = await keysRes.json();
            // Keys may come back as full paths or just suffixes — normalize to full path
            const fullKeys = keys.map(k => k.startsWith('preset/') ? k : `preset/${k}`);
            const loaded = (await Promise.all(fullKeys.map(k => storageGet<Preset>(k)))).filter((p): p is Preset => p != null);
            setPresets(prev => {
              const byName = new Map(
                prev.filter(p => p.name === 'init' || !tombstones.has(p.name)).map(p => [p.name, p])
              );
              for (const p of loaded) byName.set(p.name, { ...p, params: { ...DEFAULTS, ...p.params } });
              return Array.from(byName.values()).sort((a, b) => a.name === 'init' ? -1 : b.name === 'init' ? 1 : a.name.localeCompare(b.name));
            });
          } else if (tombstones.size > 0) {
            // No KV presets but still need to filter tombstoned bundled presets
            setPresets(prev => prev.filter(p => p.name === 'init' || !tombstones.has(p.name)));
          }
        } catch { /* ignored */ }
      }
      await minDelay;
      setHydrated(true);
    })();
  }, []);

  const clampTempo = (v: number) => Math.min(200, Math.max(40, Math.round(v)));

  /* eslint-disable react-hooks/purity */
  const randomizeParams = () => {
    const rnd = (min: number, max: number) => min + Math.random() * (max - min);
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const rndInt = (min: number, max: number) => Math.floor(rnd(min, max + 1));
    // Weighted oscillator mix: pick 1-2 dominant waves
    // Distribute 100% among osc types (sine, square, sawtooth, triangle, noise)
    const oscMix = () => {
      const slots = 5;
      const active = rndInt(1, 3); // 1-3 active oscillators
      const indices: number[] = [];
      while (indices.length < active) {
        const i = rndInt(0, slots - 1);
        if (!indices.includes(i)) indices.push(i);
      }
      const vals = [0, 0, 0, 0, 0];
      let remaining = 100;
      for (let i = 0; i < indices.length - 1; i++) {
        const share = rndInt(10, remaining - (indices.length - i - 1) * 10);
        vals[indices[i]] = share;
        remaining -= share;
      }
      vals[indices[indices.length - 1]] = remaining;
      return vals;
    };
    const [sine, square, sawtooth, triangle, noise] = oscMix();
    const shuffled = (['comp', 'dist', 'mod', 'delay'] as string[]).sort(() => Math.random() - 0.5);
    const rFilter1 = Math.random() > 0.3;
    const rFilter2 = Math.random() > 0.5;
    const rArp = Math.random() > 0.7;
    const rDelay = Math.random() > 0.5;
    const rComp = Math.random() > 0.5;
    const rDist = Math.random() > 0.6;
    const rPitchEnv = Math.random() > 0.6;
    const rMod = Math.random() > 0.6;
    activeNotesRef.current.forEach((_, id) => releaseNote(id));
    setParams({
      ...DEFAULTS,
      sine, square, sawtooth, triangle,
      noise,
      syncAmount: Math.random() > 0.7 ? rndInt(0, 60) : 0,
      syncRatio: rndInt(10, 90),
      pulseWidth: square > 0 ? rndInt(10, 90) : 50,
      attack: rnd(0.001, 0.5),
      decay: rnd(0.1, 3),
      decayCurve: rndInt(10, 90),
      sustain: rnd(0, 1),
      release: rnd(0.05, 2),
      filter1Enabled: rFilter1,
      ...(rFilter1 ? {
        filterType: pick(['lowpass', 'highpass', 'bandpass'] as BiquadFilterType[]),
        cutoff: rnd(200, 18000),
        resonance: rnd(0, 20),
        filterSlope: pick([6, 12, 24, 36] as (6 | 12 | 24 | 36)[]),
        filterAttack: rnd(0.001, 0.5),
        filterDecay: rnd(0.05, 2),
        filterDecayCurve: rndInt(10, 90),
        filterSustain: rnd(0, 1),
        filterRelease: rnd(0.05, 2),
        filterEnvAmount: Math.random() > 0.4 ? rndInt(0, 100) : 0,
        filterKeyTrack: Math.random() > 0.5,
        filterResAttack: rnd(0.001, 0.5),
        filterResDecay: rnd(0.05, 2),
        filterResDecayCurve: rndInt(10, 90),
        filterResSustain: rnd(0, 1),
        filterResRelease: rnd(0.05, 2),
        filterResEnvAmount: Math.random() > 0.6 ? rndInt(0, 100) : 0,
      } : {}),
      monoMode: Math.random() > 0.7,
      slide: Math.random() > 0.7 ? rndInt(0, 60) : 0,
      lfoDiv: pick([1, 2, 4, 8, 16, 32]),
      lfoModifier: pick(['none', 'none', 'dotted', 'triplet'] as ('none' | 'dotted' | 'triplet')[]),
      lfoShape: pick(['sine', 'square', 'sawtooth', 'triangle', 'noise', 'sampleAndHold'] as LfoShape[]),
      lfoDepth: Math.random() > 0.5 ? rndInt(-100, 100) : 0,
      lfoFinePitchDepth: Math.random() > 0.7 ? rndInt(-100, 100) : 0,
      lfoPwDepth: square > 0 && Math.random() > 0.7 ? rndInt(-100, 100) : 0,
      lfoCutoffDepth: Math.random() > 0.5 ? rndInt(-100, 100) : 0,
      lfoResDepth: Math.random() > 0.6 ? rndInt(-100, 100) : 0,
      lfoSyncDepth: Math.random() > 0.7 ? rndInt(-100, 100) : 0,
      lfoRamp: Math.random() > 0.6 ? rndInt(0, 80) : 0,
      lfoPolarity: pick([1, -1] as (1 | -1)[]),
      volume: paramsRef.current.volume,
      unisonVoices: pick([1, 1, 1, 2, 2, 3, 4]),
      unisonDetune: rndInt(5, 50),
      unisonSpread: rndInt(30, 100),
      unisonRandomPhase: Math.random() > 0.7,
      arpEnabled: rArp,
      ...(rArp ? {
        arpRate: rndInt(4, 16),
        arpPattern: pick(['up', 'down', 'up-down', 'random'] as ArpPattern[]),
        arpOctaves: pick([1, 1, 2, 3]),
        arpDiv: pick([4, 8, 8, 16]),
        arpModifier: pick(['none', 'none', 'dotted', 'triplet'] as ('none' | 'dotted' | 'triplet')[]),
      } : {}),
      delayEnabled: rDelay,
      ...(rDelay ? {
        delayDiv: pick([4, 8, 8, 16]),
        delayModifier: pick(['none', 'none', 'dotted', 'triplet'] as ('none' | 'dotted' | 'triplet')[]),
        delayFeedback: rndInt(10, 70),
        delayTone: 50,
        delayWet: rndInt(10, 70),
      } : {}),
      compEnabled: rComp,
      ...(rComp ? {
        compThreshold: rndInt(-40, -6),
        compRatio: rnd(1.5, 10),
        compAttack: rnd(0.001, 0.05),
        compRelease: rnd(0.05, 0.5),
      } : {}),
      distEnabled: rDist,
      ...(rDist ? {
        distAmount: rndInt(10, 80),
        distTone: rndInt(20, 80),
        distMix: rndInt(30, 100),
      } : {}),
      pitchEnvEnabled: rPitchEnv,
      ...(rPitchEnv ? {
        pitchEnvAttack: rnd(0.001, 0.3),
        pitchEnvDecay: rnd(0.05, 1),
        pitchEnvCurve: rndInt(10, 90),
        pitchEnvSustain: rnd(0, 0.5),
        pitchEnvRelease: rnd(0.05, 0.5),
        pitchEnvAmount: Math.random() > 0.6 ? rndInt(10, 100) : 0,
      } : {}),
      syncEnvAttack: rnd(0.001, 0.3),
      syncEnvDecay: rnd(0.05, 1),
      syncEnvCurve: rndInt(10, 90),
      syncEnvSustain: rnd(0, 0.5),
      syncEnvRelease: rnd(0.05, 0.5),
      syncEnvAmount: Math.random() > 0.7 ? rndInt(0, 100) : 0,
      modEnabled: rMod,
      ...(rMod ? {
        modRate: rndInt(5, 80),
        modDepth: rndInt(10, 80),
        modMix: rndInt(20, 80),
        modFeedback: rndInt(0, 60),
      } : {}),
      fxOrder: shuffled,
      ...((() => {
        const rHarmAmount = Math.random() > 0.6 ? rndInt(10, 100) : 0;
        if (rHarmAmount === 0) return { harmonizerAmount: 0, harmonizerIntervals: [], harmonizerOctaveUp: false };
        const allIntervals = [3, 5, 7, 9];
        const intervals = allIntervals.filter(() => Math.random() > 0.5);
        const finalIntervals = intervals.length === 0 ? [pick(allIntervals)] : intervals;
        return {
          harmonizerAmount: rHarmAmount,
          harmonizerIntervals: finalIntervals,
          harmonizerOctaveUp: Math.random() > 0.7,
        };
      })()),
      activeFilter: 1,
      filter2Enabled: rFilter2,
      ...(rFilter2 ? {
        filter2Type: pick(['lowpass', 'highpass', 'bandpass'] as BiquadFilterType[]),
        filter2Cutoff: rnd(200, 18000),
        filter2Resonance: rnd(0, 20),
        filter2Slope: pick([6, 12, 24, 36] as (6 | 12 | 24 | 36)[]),
        filter2KeyTrack: Math.random() > 0.5,
      } : {}),
    });
    setActivePreset('');
  };
  /* eslint-enable react-hooks/purity */

  const commitTempo = (raw: string) => {
    const n = parseInt(raw, 10);
    const clamped = isNaN(n) ? tempo : clampTempo(n);
    setTempo(clamped);
    setTempoInput(String(clamped));
  };

  useEffect(() => { storageSet('cribl-synth-params', params); }, [params]);

  const buildFilterChain = useCallback((ctx: AudioContext, slope: number) => {
    const count = slope === 6 ? 1 : slope === 12 ? 1 : slope === 24 ? 2 : 3;
    const nodes: BiquadFilterNode[] = [];
    for (let i = 0; i < count; i++) nodes.push(ctx.createBiquadFilter());
    const pre = preFilterRef.current;
    const pre2 = preFilter2Ref.current;
    if (!pre || !pre2) return;
    // Last biquad feeds the drive input gain (driveIn → shaper → preFilter2 already wired in
    // getCtx), so saturation happens on the filtered signal. Fall back to preFilter2 if no drive.
    const sink: AudioNode = filterDriveInRef.current ?? pre2;
    pre.connect(nodes[0]);
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    nodes[nodes.length - 1].connect(sink);
    if (filterNodesRef.current.length) {
      try { pre.disconnect(filterNodesRef.current[0]); } catch { /* ignored */ }
      filterNodesRef.current.forEach(n => { try { n.disconnect(); } catch { /* ignored */ } });
    }
    filterNodesRef.current = nodes;
    if (lfoCutoffGainRef.current) {
      nodes.forEach(n => { try { lfoCutoffGainRef.current!.connect(n.frequency); } catch { /* ignored */ } });
    }
    if (lfoResGainRef.current) {
      nodes.forEach(n => { try { lfoResGainRef.current!.connect(n.Q); } catch { /* ignored */ } });
    }
  }, []);

  const buildFilter2Chain = useCallback((ctx: AudioContext, slope: number) => {
    const count = slope === 6 ? 1 : slope === 12 ? 1 : slope === 24 ? 2 : 3;
    const nodes: BiquadFilterNode[] = [];
    for (let i = 0; i < count; i++) nodes.push(ctx.createBiquadFilter());
    const pre2 = preFilter2Ref.current;
    const master = masterGainRef.current;
    if (!pre2 || !master) return;
    const sink2: AudioNode = filter2DriveInRef.current ?? master;
    pre2.connect(nodes[0]);
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    nodes[nodes.length - 1].connect(sink2);
    if (vizAnalyserRef.current) {
      try { masterDCBlockRef.current?.disconnect(vizAnalyserRef.current); } catch { /* ignored */ }
    }
    const vizAnalyser = ctx.createAnalyser();
    vizAnalyser.fftSize = 2048;
    vizAnalyser.smoothingTimeConstant = 0.8;
    const dcBlock = masterDCBlockRef.current;
    if (dcBlock) {
      dcBlock.connect(vizAnalyser);
    } else {
      master.connect(vizAnalyser);
    }
    vizAnalyser.connect(ctx.destination);
    vizAnalyserRef.current = vizAnalyser;
    if (filter2NodesRef.current.length) {
      try { pre2.disconnect(filter2NodesRef.current[0]); } catch { /* ignored */ }
      filter2NodesRef.current.forEach(n => { try { n.disconnect(); } catch { /* ignored */ } });
    }
    filter2NodesRef.current = nodes;
  }, []);

  const lfoRateHz = (div: number, modifier: string) => {
    const modFactor = modifier === 'dotted' ? 1.5 : modifier === 'triplet' ? 2 / 3 : 1;
    const beatMs = 60000 / tempoRef.current;
    const periodMs = beatMs * (4 / div) * modFactor;
    return 1000 / periodMs;
  };

  const getCtx = useCallback(async () => {
    if (!audioCtxRef.current) {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      await ctx.audioWorklet.addModule(BIT_CRUSHER_WORKLET_URL);
      masterGainRef.current = ctx.createGain();
      masterGainRef.current.gain.value = (paramsRef.current.volume / 100) * 0.75;
      const masterDCBlock = audioCtxRef.current.createBiquadFilter();
      masterDCBlock.type = 'highpass';
      masterDCBlock.frequency.value = 5;
      masterDCBlock.Q.value = 0.5;
      masterGainRef.current.connect(masterDCBlock);
      masterDCBlockRef.current = masterDCBlock;
      // fxInput is the stable entry point into the effects chain (notes connect here)
      const fxInput = audioCtxRef.current.createGain();
      fxInput.gain.value = 1;
      fxInputRef.current = fxInput;
      const compressor = audioCtxRef.current.createDynamicsCompressor();
      compressor.threshold.value = paramsRef.current.compThreshold;
      compressor.ratio.value = paramsRef.current.compRatio;
      compressor.attack.value = paramsRef.current.compAttack;
      compressor.release.value = paramsRef.current.compRelease;
      compressor.knee.value = 6;
      compressorRef.current = compressor;

      // Distortion: WaveShaper with DC-blocking and tone (lowpass) filter
      const distortion = audioCtxRef.current.createWaveShaper();
      distortion.oversample = '4x';
      const makeDistCurve = (amount: number) => {
        const n = 4096, curve = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const x = (i * 2) / n - 1;
          curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
        }
        return curve;
      };
      distortion.curve = paramsRef.current.distEnabled ? makeDistCurve(paramsRef.current.distAmount * 4) : null;
      const distBitCrush = new AudioWorkletNode(ctx, 'bit-crusher-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        parameterData: { bitDepth: paramsRef.current.distBitDepth },
      });
      // DC-blocking highpass at 10 Hz removes sub-bass buildup from hard clipping at high drive
      const distDCBlock = audioCtxRef.current.createBiquadFilter();
      distDCBlock.type = 'highpass';
      distDCBlock.frequency.value = 10;
      distDCBlock.Q.value = 0.5;
      const distTone = audioCtxRef.current.createBiquadFilter();
      distTone.type = 'lowpass';
      distTone.frequency.value = 800 + (paramsRef.current.distTone / 100) * 15000;
      distTone.Q.value = 0.5;
      distortion.connect(distBitCrush);
      distBitCrush.connect(distDCBlock);
      distDCBlock.connect(distTone);
      distortionRef.current = distortion;
      distBitCrushRef.current = distBitCrush;
      distDCBlockRef.current = distDCBlock;
      distToneRef.current = distTone;

      // preFilter → filter1 chain → drive1 → preFilter2 → filter2 chain → drive2 → masterGain
      const preFilter = audioCtxRef.current.createGain();
      preFilter.gain.value = 1;
      preFilterRef.current = preFilter;
      const preFilter2 = audioCtxRef.current.createGain();
      preFilter2.gain.value = 1;
      preFilter2Ref.current = preFilter2;
      // Drive sits AFTER each filter cascade so the saturation harmonics aren't stripped by the
      // filter that created the tone. Each stage is driveIn(1/HEADROOM) → shaper → downstream,
      // wired once here; the filter chain builders connect their last biquad into driveIn.
      const driveIn1 = audioCtxRef.current.createGain();
      driveIn1.gain.value = 1 / FILTER_DRIVE_HEADROOM;
      filterDriveInRef.current = driveIn1;
      const drive1 = audioCtxRef.current.createWaveShaper();
      drive1.oversample = '4x';
      drive1.curve = makeFilterDriveCurve(paramsRef.current.filterDrive);
      driveIn1.connect(drive1);
      drive1.connect(preFilter2);
      filterDriveRef.current = drive1;
      const driveIn2 = audioCtxRef.current.createGain();
      driveIn2.gain.value = 1 / FILTER_DRIVE_HEADROOM;
      filter2DriveInRef.current = driveIn2;
      const drive2 = audioCtxRef.current.createWaveShaper();
      drive2.oversample = '4x';
      drive2.curve = makeFilterDriveCurve(paramsRef.current.filter2Drive);
      driveIn2.connect(drive2);
      drive2.connect(masterGainRef.current);
      filter2DriveRef.current = drive2;
      buildFilterChain(audioCtxRef.current, paramsRef.current.filterSlope);
      buildFilter2Chain(audioCtxRef.current, paramsRef.current.filter2Slope);
      // Apply saved filter params immediately after chains are built
      filterNodesRef.current.forEach(n => {
        n.type = paramsRef.current.filter1Enabled ? paramsRef.current.filterType : 'allpass';
        n.frequency.value = paramsRef.current.cutoff;
        n.Q.value = clampNotchQ(paramsRef.current.filterType, paramsRef.current.resonance);
      });
      filter2NodesRef.current.forEach(n => {
        n.type = paramsRef.current.filter2Enabled ? paramsRef.current.filter2Type : 'allpass';
        n.frequency.value = paramsRef.current.filter2Cutoff;
        n.Q.value = clampNotchQ(paramsRef.current.filter2Type, paramsRef.current.filter2Resonance);
      });
      const lfoOsc = audioCtxRef.current.createOscillator();
      const lfoPolarity = audioCtxRef.current.createGain();
      lfoPolarity.gain.value = paramsRef.current.lfoPolarity;
      // Unipolar conversion: sine -1..1 → 0..1 via scale(0.5) + DC offset(0.5)
      const lfoScale = audioCtxRef.current.createGain();
      const lfoDC = audioCtxRef.current.createConstantSource();
      const lfoUni = audioCtxRef.current.createGain();
      const lfoGain = audioCtxRef.current.createGain();
      const lfoFinePitchGain = audioCtxRef.current.createGain();
      const lfoCutoffGain = audioCtxRef.current.createGain();
      const lfoResGain = audioCtxRef.current.createGain();
      const lfoSyncGain = audioCtxRef.current.createGain();
      lfoOsc.type = (paramsRef.current.lfoShape === 'sampleAndHold' || paramsRef.current.lfoShape === 'noise' ? 'sine' : paramsRef.current.lfoShape) as OscillatorType;
      lfoOsc.frequency.value = lfoRateHz(paramsRef.current.lfoDiv, paramsRef.current.lfoModifier);
      lfoScale.gain.value = 0.5;
      lfoDC.offset.value = 0.5;
      lfoUni.gain.value = 1;
      lfoGain.gain.value = paramsRef.current.lfoDepth * 12;
      lfoFinePitchGain.gain.value = paramsRef.current.lfoFinePitchDepth;
      lfoCutoffGain.gain.value = paramsRef.current.lfoCutoffDepth * 50;
      lfoResGain.gain.value = paramsRef.current.lfoResDepth;
      lfoSyncGain.gain.value = paramsRef.current.lfoSyncDepth * 247;
      const lfoShapeGain = audioCtxRef.current.createGain();
      lfoShapeGain.gain.value = 1;
      const lfoRampGain = audioCtxRef.current.createGain();
      lfoRampGain.gain.value = 1;
      lfoOsc.connect(lfoShapeGain);
      lfoShapeGain.connect(lfoRampGain);
      lfoRampGain.connect(lfoPolarity);
      lfoShapeGainRef.current = lfoShapeGain;
      lfoRampGainRef.current = lfoRampGain;
      lfoPolarity.connect(lfoScale);
      lfoScale.connect(lfoUni);
      lfoDC.connect(lfoUni);
      lfoUni.connect(lfoGain);
      lfoUni.connect(lfoFinePitchGain);
      lfoUni.connect(lfoSyncGain);
      lfoPolarity.connect(lfoCutoffGain);
      lfoPolarity.connect(lfoResGain);
      filterNodesRef.current.forEach(n => { try { lfoCutoffGain.connect(n.frequency); } catch { /* ignored */ } });
      lfoOsc.start();
      lfoDC.start();
      lfoOscRef.current = lfoOsc;
      lfoGainRef.current = lfoGain;
      lfoFinePitchGainRef.current = lfoFinePitchGain;
      lfoCutoffGainRef.current = lfoCutoffGain;
      lfoResGainRef.current = lfoResGain;
      filterNodesRef.current.forEach(n => { try { lfoResGain.connect(n.Q); } catch { /* ignored */ } });
      lfoSyncGainRef.current = lfoSyncGain;
      lfoPolarityRef.current = lfoPolarity;
      const lfoAnalyser = audioCtxRef.current.createAnalyser();
      lfoAnalyser.fftSize = 256;
      lfoUni.connect(lfoAnalyser);
      lfoAnalyserRef.current = lfoAnalyser;
      lfoUniRef.current = lfoUni;
      lfoScaleRef.current = lfoScale;
      lfoDCRef.current = lfoDC;
      // Build 2-second white noise buffer (shared, looped per voice)
      const noiseCtx = audioCtxRef.current;
      const noiseSamples = noiseCtx.sampleRate * 2;
      const noiseBuffer = noiseCtx.createBuffer(1, noiseSamples, noiseCtx.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseSamples; i++) noiseData[i] = Math.random() * 2 - 1;
      noiseBufferRef.current = noiseBuffer;

      // Delay internals (input/output exposed via fxInDelay/fxOutDelay)
      const delayNode = audioCtxRef.current.createDelay(4.0);
      const delayFeedbackGain = audioCtxRef.current.createGain();
      const delayWetGain = audioCtxRef.current.createGain();
      const delayDryGain = audioCtxRef.current.createGain();
      const delayOut = audioCtxRef.current.createGain();
      const p = paramsRef.current;
      const delayMs = (() => {
        const modFactor = p.delayModifier === 'dotted' ? 1.5 : p.delayModifier === 'triplet' ? 2 / 3 : 1;
        return (60000 / tempoRef.current) * (4 / p.delayDiv) * modFactor / 1000;
      })();
      delayNode.delayTime.value = delayMs;
      delayFeedbackGain.gain.value = p.delayEnabled ? p.delayFeedback / 100 : 0;
      delayWetGain.gain.value = p.delayEnabled ? p.delayWet / 100 : 0;
      delayDryGain.gain.value = 1;
      // Internal delay routing: input → dry + wet(delay→feedback loop)→ out
      // Tone filter: two chained biquads in the feedback path for 24dB/oct slope
      const delayToneFilter1 = audioCtxRef.current.createBiquadFilter();
      const delayToneFilter2 = audioCtxRef.current.createBiquadFilter();
      const applyDelayTone = (tone: number, f1: BiquadFilterNode, f2: BiquadFilterNode) => {
        if (tone < 50) {
          const freq = 16000 / Math.pow(80, (50 - tone) / 50); // 16000Hz–200Hz lowpass (exp: detail near 16k)
          f1.type = 'lowpass'; f1.frequency.value = freq; f1.Q.value = 0.707;
          f2.type = 'lowpass'; f2.frequency.value = freq; f2.Q.value = 0.707;
        } else if (tone > 50) {
          const freq = 100 * Math.pow(100, (tone - 50) / 50); // 100Hz–10000Hz highpass (exp: detail near 100Hz)
          f1.type = 'highpass'; f1.frequency.value = freq; f1.Q.value = 0.707;
          f2.type = 'highpass'; f2.frequency.value = freq; f2.Q.value = 0.707;
        } else {
          f1.type = 'allpass'; f1.frequency.value = 20000;
          f2.type = 'allpass'; f2.frequency.value = 20000;
        }
      };
      applyDelayTone(p.delayTone, delayToneFilter1, delayToneFilter2);
      delayToneFilterRef.current = [delayToneFilter1, delayToneFilter2];
      // Filter sits on the input to the delay node; feedback also routes back
      // through the filter so every echo entering the delay is pre-filtered.
      delayDryGain.connect(delayOut);
      delayToneFilter1.connect(delayToneFilter2);
      delayToneFilter2.connect(delayNode);
      delayNode.connect(delayFeedbackGain);
      delayFeedbackGain.connect(delayToneFilter1);
      delayNode.connect(delayWetGain);
      delayWetGain.connect(delayOut);
      delayNodeRef.current = delayNode;
      delayFeedbackRef.current = delayFeedbackGain;
      delayWetRef.current = delayWetGain;

      // Phaser effect: 4 all-pass filters modulated by an LFO
      const modIn = audioCtxRef.current.createGain();
      const modOut = audioCtxRef.current.createGain();
      const modDry = audioCtxRef.current.createGain();
      const modWet = audioCtxRef.current.createGain();
      const modFeedbackGain = audioCtxRef.current.createGain();
      const modLfo = audioCtxRef.current.createOscillator();
      const modLfoGain = audioCtxRef.current.createGain();
      const mp = paramsRef.current;

      modLfo.type = 'sine';
      modLfo.frequency.value = 0.1 + (mp.modRate / 100) * 4;
      modLfo.start();
      modLfoRef.current = modLfo;
      modLfoGainRef.current = modLfoGain;
      modFeedbackRef.current = modFeedbackGain;
      modWetRef.current = modWet;
      modDryRef.current = modDry;

      const phaserFilters: BiquadFilterNode[] = [];
      for (let i = 0; i < 4; i++) {
        const f = audioCtxRef.current.createBiquadFilter();
        f.type = 'allpass';
        f.frequency.value = 400 + i * 200;
        f.Q.value = 0.5;
        phaserFilters.push(f);
      }
      modPhaserFiltersRef.current = phaserFilters;

      modDry.gain.value = mp.modEnabled ? 1 - mp.modMix / 100 : 1;
      modWet.gain.value = mp.modEnabled ? mp.modMix / 100 : 0;
      modFeedbackGain.gain.value = mp.modEnabled ? mp.modFeedback / 100 : 0;
      modLfoGain.gain.value = mp.modEnabled ? (mp.modDepth / 100) * 1200 : 0;

      // Dry path
      modIn.connect(modDry);
      modDry.connect(modOut);
      // Wet path: modIn → allpass chain → feedbackGain → allpass[0] (loop) + modWet → modOut
      modIn.connect(phaserFilters[0]);
      for (let i = 0; i < phaserFilters.length - 1; i++) phaserFilters[i].connect(phaserFilters[i + 1]);
      phaserFilters[phaserFilters.length - 1].connect(modWet);
      phaserFilters[phaserFilters.length - 1].connect(modFeedbackGain);
      modFeedbackGain.connect(phaserFilters[0]);
      modWet.connect(modOut);
      // LFO → lfoGain → each filter's frequency
      modLfo.connect(modLfoGain);
      phaserFilters.forEach(f => modLfoGain.connect(f.frequency));

      const inMod = audioCtxRef.current.createGain();
      inMod.connect(modIn);
      fxInMod.current = inMod;
      fxOutMod.current = modOut;

      // Per-effect input/output gain nodes for dynamic rewiring
      const inComp = audioCtxRef.current.createGain();
      inComp.connect(compressor);
      fxInComp.current = inComp;
      fxOutComp.current = compressor;

      const distDry = audioCtxRef.current.createGain();
      const distWet = audioCtxRef.current.createGain();
      const distOut = audioCtxRef.current.createGain();
      distDry.gain.value = paramsRef.current.distEnabled ? 1 - paramsRef.current.distMix / 100 : 1;
      distWet.gain.value = paramsRef.current.distEnabled ? paramsRef.current.distMix / 100 : 0;
      distTone.connect(distWet);
      distWet.connect(distOut);
      distDryRef.current = distDry;
      distWetRef.current = distWet;

      const inDist = audioCtxRef.current.createGain();
      inDist.connect(distDry);
      inDist.connect(distortion);
      distDry.connect(distOut);
      fxInDist.current = inDist;
      fxOutDist.current = distOut;

      const inDelay = audioCtxRef.current.createGain();
      inDelay.connect(delayDryGain);
      inDelay.connect(delayToneFilter1);
      fxInDelay.current = inDelay;
      fxOutDelay.current = delayOut;

      // Wire effects in default order: fxInput → comp → dist → mod → delay → preFilter → filter → masterGain → destination
      fxInput.connect(inComp);
      compressor.connect(inDist);
      distOut.connect(inMod);
      modOut.connect(inDelay);
      delayOut.connect(preFilter);
    }
    return audioCtxRef.current;
  }, [buildFilterChain, buildFilter2Chain]);

  const lfoNoiseCutoff = (div: number, modifier: string, sampleRate: number) => {
    const rateHz = lfoRateHz(div, modifier);
    const maxRate = lfoRateHz(64, 'dotted');
    const t = Math.min(1, rateHz / maxRate);
    return rateHz + t * t * (sampleRate / 2 - rateHz);
  };

  const stopLfoNoise = useCallback(() => {
    try { lfoNoiseRef.current?.stop(); lfoNoiseRef.current?.disconnect(); } catch { /* ignored */ }
    try { lfoNoiseFilterRef.current?.disconnect(); } catch { /* ignored */ }
    lfoNoiseRef.current = null;
    lfoNoiseFilterRef.current = null;
  }, []);

  const startLfoNoise = useCallback((ctx: AudioContext) => {
    stopLfoNoise();
    if (!noiseBufferRef.current || !lfoRampGainRef.current) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBufferRef.current;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lfoNoiseCutoff(paramsRef.current.lfoDiv, paramsRef.current.lfoModifier, ctx.sampleRate);
    filter.Q.value = 0.707;
    src.connect(filter);
    filter.connect(lfoRampGainRef.current);
    src.start();
    lfoNoiseRef.current = src;
    lfoNoiseFilterRef.current = filter;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopLfoNoise]);

  const stopSaH = useCallback(() => {
    if (lfoSahTimerRef.current !== null) { clearInterval(lfoSahTimerRef.current); lfoSahTimerRef.current = null; }
    try { lfoSahRef.current?.stop(); lfoSahRef.current?.disconnect(); } catch { /* ignored */ }
    lfoSahRef.current = null;
  }, []);

  const startSaH = useCallback((ctx: AudioContext) => {
    stopSaH();
    const sah = ctx.createConstantSource();
    sah.offset.value = Math.random() * 2 - 1;
    sah.connect(lfoPolarityRef.current!);
    sah.start();
    lfoSahRef.current = sah;
    const intervalMs = 1000 / lfoRateHz(paramsRef.current.lfoDiv, paramsRef.current.lfoModifier);
    const rampSec = Math.min(intervalMs * 0.1, 30) / 1000;
    const tick = () => {
      const sah = lfoSahRef.current;
      if (!sah) return;
      const t = sah.context.currentTime;
      sah.offset.cancelScheduledValues(t);
      sah.offset.setValueAtTime(sah.offset.value, t);
      sah.offset.linearRampToValueAtTime(Math.random() * 2 - 1, t + rampSec);
    };
    lfoSahTimerRef.current = window.setInterval(tick, intervalMs);
  }, [stopSaH]);

  useEffect(() => {
    if (!lfoGainRef.current) return;
    const ctx = audioCtxRef.current;
    if (params.lfoShape === 'noise') {
      if (lfoOscRef.current) {
        try { lfoOscRef.current.stop(); lfoOscRef.current.disconnect(); } catch { /* ignored */ }
        lfoOscRef.current = null;
      }
      stopSaH();
      if (ctx) startLfoNoise(ctx);
    } else if (params.lfoShape === 'sampleAndHold') {
      // Switch to S&H: stop oscillator, start S&H
      if (lfoOscRef.current) {
        try { lfoOscRef.current.stop(); lfoOscRef.current.disconnect(); } catch { /* ignored */ }
        lfoOscRef.current = null;
      }
      stopLfoNoise();
      if (ctx) {
        stopSaH();
        startSaH(ctx);
      }
    } else {
      // Switch to standard oscillator shape — crossfade through zero to avoid clicks
      stopSaH();
      stopLfoNoise();
      if (lfoOscRef.current && lfoShapeGainRef.current) {
        const sg = lfoShapeGainRef.current;
        const t = sg.context.currentTime;
        const fadeTime = 0.03;
        sg.gain.cancelScheduledValues(t);
        sg.gain.setValueAtTime(sg.gain.value, t);
        sg.gain.linearRampToValueAtTime(0, t + fadeTime);
        const osc = lfoOscRef.current;
        setTimeout(() => {
          osc.type = params.lfoShape as OscillatorType;
          osc.frequency.value = lfoRateHz(params.lfoDiv, params.lfoModifier);
          const t2 = sg.context.currentTime;
          sg.gain.setValueAtTime(0, t2);
          sg.gain.linearRampToValueAtTime(1, t2 + fadeTime);
        }, fadeTime * 1000 + 5);
      } else if (ctx && lfoPolarityRef.current && lfoShapeGainRef.current) {
        // Recreate oscillator if we were in S&H mode before
        const lfoOsc = ctx.createOscillator();
        lfoOsc.type = params.lfoShape as OscillatorType;
        lfoOsc.frequency.value = lfoRateHz(params.lfoDiv, params.lfoModifier);
        lfoOsc.connect(lfoShapeGainRef.current);
        lfoOsc.start();
        lfoOscRef.current = lfoOsc;
      }
    }
    const t = (ctx ?? lfoGainRef.current.context).currentTime;
    lfoGainRef.current.gain.setTargetAtTime(params.lfoDepth * 12, t, 0.01);
    if (lfoFinePitchGainRef.current) lfoFinePitchGainRef.current.gain.setTargetAtTime(params.lfoFinePitchDepth, t, 0.01);
    if (lfoCutoffGainRef.current) lfoCutoffGainRef.current.gain.setTargetAtTime(params.lfoCutoffDepth * 50, t, 0.01);
  }, [params.lfoDiv, params.lfoModifier, params.lfoShape, params.lfoDepth, params.lfoFinePitchDepth, params.lfoCutoffDepth, tempo, startSaH, stopSaH, startLfoNoise, stopLfoNoise]);

  useEffect(() => {
    if (!lfoResGainRef.current) return;
    const t = lfoResGainRef.current.context.currentTime;
    lfoResGainRef.current.gain.setTargetAtTime(params.lfoResDepth, t, 0.01);
  }, [params.lfoResDepth]);

  useEffect(() => {
    const nodes = filterNodesRef.current;
    if (!nodes.length || !lfoCutoffGainRef.current) return;
    nodes.forEach(n => { try { lfoCutoffGainRef.current!.connect(n.frequency); } catch { /* ignored */ } });
    if (lfoResGainRef.current) nodes.forEach(n => { try { lfoResGainRef.current!.connect(n.Q); } catch { /* ignored */ } });
  }, [params.filterSlope]);

  useEffect(() => {
    if (!lfoPolarityRef.current) return;
    const t = lfoPolarityRef.current.context.currentTime;
    lfoPolarityRef.current.gain.setTargetAtTime(params.lfoPolarity, t, 0.05);
  }, [params.lfoPolarity]);

  // PW LFO: read unipolar LFO value each frame and update square osc periodic waves
  useEffect(() => {
    if (pwRafRef.current !== null) { cancelAnimationFrame(pwRafRef.current); pwRafRef.current = null; }
    if (params.lfoPwDepth === 0) return;
    const buf = new Float32Array(256);
    const buildPw = (ctx: AudioContext, duty: number): PeriodicWave => {
      const n = 256;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      const d = Math.max(0.01, Math.min(0.99, duty));
      for (let k = 1; k < n; k++) {
        real[k] = -(2 / (k * Math.PI)) * Math.sin(2 * Math.PI * k * d);
        imag[k] = (2 / (k * Math.PI)) * (1 - Math.cos(2 * Math.PI * k * d));
      }
      return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
    };
    const tick = () => {
      pwRafRef.current = requestAnimationFrame(tick);
      const analyser = lfoAnalyserRef.current;
      const ctx = audioCtxRef.current;
      if (!analyser || !ctx) return;
      analyser.getFloatTimeDomainData(buf);
      const lfoVal = buf[0]; // unipolar 0..1
      const depth = paramsRef.current.lfoPwDepth / 100;
      const basePw = paramsRef.current.pulseWidth / 100;
      const duty = basePw + (lfoVal - 0.5) * depth;
      const wave = buildPw(ctx, duty);
      activeNotesRef.current.forEach(note => {
        note.squareOscillators.forEach(osc => osc.setPeriodicWave(wave));
      });
    };
    pwRafRef.current = requestAnimationFrame(tick);
    return () => { if (pwRafRef.current !== null) { cancelAnimationFrame(pwRafRef.current); pwRafRef.current = null; } };
  }, [params.lfoPwDepth]);

  const restartLfo = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !lfoUniRef.current || !lfoGainRef.current || !lfoFinePitchGainRef.current || !lfoCutoffGainRef.current || !lfoScaleRef.current || !lfoDCRef.current) return;
    const p = paramsRef.current;
    if (p.lfoShape === 'noise') {
      try { lfoOscRef.current?.stop(); lfoOscRef.current?.disconnect(); } catch { /* ignored */ }
      lfoOscRef.current = null;
      stopSaH();
      startLfoNoise(ctx);
      return;
    }
    if (p.lfoShape === 'sampleAndHold') {
      try { lfoOscRef.current?.stop(); lfoOscRef.current?.disconnect(); } catch { /* ignored */ }
      lfoOscRef.current = null;
      stopLfoNoise();
      startSaH(ctx);
      return;
    }
    stopSaH();
    stopLfoNoise();
    try { lfoOscRef.current?.stop(); lfoOscRef.current?.disconnect(); } catch { /* ignored */ }
    const lfoOsc = ctx.createOscillator();
    lfoOsc.type = p.lfoShape as OscillatorType;
    lfoOsc.frequency.value = lfoRateHz(p.lfoDiv, p.lfoModifier);
    if (lfoShapeGainRef.current) {
      lfoOsc.connect(lfoShapeGainRef.current);
    } else if (lfoPolarityRef.current) {
      lfoOsc.connect(lfoPolarityRef.current);
    } else {
      lfoOsc.connect(lfoScaleRef.current);
      lfoOsc.connect(lfoCutoffGainRef.current);
    }
    lfoOsc.start();
    lfoOscRef.current = lfoOsc;
  }, [startSaH, stopSaH, startLfoNoise, stopLfoNoise]);

  const applyFilterParams = useCallback(() => {
    const p = paramsRef.current;
    const nodes = filterNodesRef.current;
    if (nodes.length) {
      const ctx = nodes[0].context;
      const t = ctx.currentTime;
      nodes.forEach(n => {
        try {
          n.type = p.filter1Enabled ? p.filterType : 'allpass';
          n.frequency.cancelScheduledValues(t);
          n.frequency.setValueAtTime(n.frequency.value, t);
          n.frequency.setTargetAtTime(p.cutoff, t, 0.05);
          n.Q.cancelScheduledValues(t);
          n.Q.setValueAtTime(n.Q.value, t);
          n.Q.setTargetAtTime(clampNotchQ(p.filterType, p.resonance), t, 0.05);
        } catch { /* ignored */ }
      });
    }
    const nodes2 = filter2NodesRef.current;
    if (nodes2.length) {
      const ctx = nodes2[0].context;
      const t = ctx.currentTime;
      nodes2.forEach(n => {
        try {
          n.type = p.filter2Enabled ? p.filter2Type : 'allpass';
          n.frequency.cancelScheduledValues(t);
          n.frequency.setValueAtTime(n.frequency.value, t);
          n.frequency.setTargetAtTime(p.filter2Cutoff, t, 0.05);
          n.Q.cancelScheduledValues(t);
          n.Q.setValueAtTime(n.Q.value, t);
          n.Q.setTargetAtTime(clampNotchQ(p.filter2Type, p.filter2Resonance), t, 0.05);
        } catch { /* ignored */ }
      });
    }
  }, []);

  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime((params.volume / 100) * 0.75, masterGainRef.current.context.currentTime, 0.01);
    }
  }, [params.volume]);


  useEffect(() => {
    applyFilterParams();
  }, [params.filterType, params.cutoff, params.resonance, params.filter1Enabled, params.filter2Type, params.filter2Cutoff, params.filter2Resonance, params.filter2Enabled, applyFilterParams]);

  useEffect(() => {
    if (filterDriveRef.current) filterDriveRef.current.curve = makeFilterDriveCurve(params.filterDrive);
    if (filter2DriveRef.current) filter2DriveRef.current.curve = makeFilterDriveCurve(params.filter2Drive);
  }, [params.filterDrive, params.filter2Drive]);

  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const pw = params.pulseWidth;
    const n = 256;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    const d = pw / 100;
    for (let k = 1; k < n; k++) {
      real[k] = -(2 / (k * Math.PI)) * Math.sin(2 * Math.PI * k * d);
      imag[k] = (2 / (k * Math.PI)) * (1 - Math.cos(2 * Math.PI * k * d));
    }
    const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: true });
    activeNotesRef.current.forEach(note => {
      note.squareOscillators.forEach(osc => {
        if (Math.abs(pw - 50) > 0.5) {
          osc.setPeriodicWave(wave);
        } else {
          osc.type = 'square';
        }
      });
    });
  }, [params.pulseWidth]);

  useEffect(() => {
    const voices = Math.max(1, Math.round(params.unisonVoices));
    const waveMap: { [k: string]: number } = { sine: params.sine, square: params.square, sawtooth: params.sawtooth, triangle: params.triangle, noise: params.noise };
    activeNotesRef.current.forEach(note => {
      for (const type in waveMap) { const pct = waveMap[type];
        const vol = pct / 100;
        note.waveGains[type]?.forEach(g => {
          g.gain.setTargetAtTime(vol / voices, g.context.currentTime, 0.05);
        });
      }
    });
  }, [params.sine, params.square, params.sawtooth, params.triangle, params.noise, params.unisonVoices]);

  useEffect(() => {
    activeNotesRef.current.forEach(note => {
      note.unisonVoiceData.forEach(({ osc, detuneFactor, panner }) => {
        osc.detune.setTargetAtTime(detuneFactor * params.unisonDetune, osc.context.currentTime, 0.05);
        panner.pan.setTargetAtTime(detuneFactor * 2 * (params.unisonSpread / 100), panner.context.currentTime, 0.05);
      });
    });
  }, [params.unisonDetune, params.unisonSpread]);

  useEffect(() => {
    const syncDepth = params.syncAmount / 100;
    const syncRatioVal = 1 + (params.syncRatio / 100) * 3;
    activeNotesRef.current.forEach(note => {
      note.syncData.forEach(({ modGain }) => {
        const t = modGain.context.currentTime;
        try {
          const curGain = modGain.gain.value;
          modGain.gain.cancelScheduledValues(0);
          modGain.gain.setValueAtTime(curGain, t);
          modGain.gain.setTargetAtTime(Math.min(note.freq * syncRatioVal * 14 * syncDepth, 22050 - note.freq), t, 0.05);
        } catch { /* ignored */ }
      });
    });
  }, [params.syncAmount, params.syncRatio]);

  useEffect(() => {
    const syncRatioVal = 1 + (params.syncRatio / 100) * 3;
    activeNotesRef.current.forEach(note => {
      note.syncData.forEach(({ modOsc }) => {
        const t = modOsc.context.currentTime;
        try {
          const curFreq = modOsc.frequency.value;
          modOsc.frequency.cancelScheduledValues(0);
          modOsc.frequency.setValueAtTime(curFreq, t);
          modOsc.frequency.setTargetAtTime(note.freq * syncRatioVal, t, 0.05);
        } catch { /* ignored */ }
      });
    });
  }, [params.syncRatio]);

  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const t = ctx.currentTime;
    const BASE_RATIOS: Record<number, number> = { 3: 5 / 4, 5: 3 / 2, 7: 9 / 5, 9: 9 / 4 };
    const octMult = params.harmonizerOctaveUp ? 2 : 1;
    const HARMONIZER_RATIOS: Record<number, number> = Object.fromEntries(
      Object.entries(BASE_RATIOS).map(([k, v]) => [k, v * octMult])
    );
    const p = paramsRef.current;
    const waveTypes: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];
    const waveVols = [p.sine, p.square, p.sawtooth, p.triangle];

    activeNotesRef.current.forEach(note => {
      // Remove oscillators for intervals no longer selected
      note.harmonizerData = note.harmonizerData.filter(({ osc, gain, interval }) => {
        if (!params.harmonizerIntervals.includes(interval)) {
          gain.gain.setTargetAtTime(0, t, 0.01);
          setTimeout(() => { try { osc.stop(); osc.disconnect(); gain.disconnect(); } catch { /* ignored */ } }, 100);
          return false;
        }
        return true;
      });
      // Update frequency and gain on existing harmonizer oscillators
      note.harmonizerData.forEach(({ gain, osc, interval }) => {
        const ratio = HARMONIZER_RATIOS[interval];
        if (ratio) osc.frequency.setTargetAtTime(note.freq * ratio, t, 0.02);
        const typeIdx = waveTypes.indexOf(osc.type);
        const vol = typeIdx >= 0 ? waveVols[typeIdx] / 100 : 1;
        gain.gain.setTargetAtTime((vol * params.harmonizerAmount) / 100, t, 0.02);
      });
      // Add oscillators for newly selected intervals
      const existing = new Set(note.harmonizerData.map(h => h.interval));
      for (const interval of params.harmonizerIntervals) {
        if (existing.has(interval)) continue;
        const ratio = HARMONIZER_RATIOS[interval];
        if (!ratio) continue;
        const hFreq = note.freq * ratio;
        waveTypes.forEach((type, i) => {
          const vol = waveVols[i] / 100;
          if (vol === 0) return;
          const hOsc = ctx.createOscillator();
          const hGain = ctx.createGain();
          hOsc.type = type;
          hOsc.frequency.value = hFreq;
          hGain.gain.value = 0;
          hOsc.connect(hGain);
          hGain.connect(note.gainNode);
          hOsc.start(t);
          hGain.gain.setTargetAtTime((vol * params.harmonizerAmount) / 100, t, 0.02);
          note.oscillators.push(hOsc);
          note.harmonizerData.push({ osc: hOsc, gain: hGain, interval });
        });
      }
    });
  }, [params.harmonizerAmount, params.harmonizerIntervals, params.harmonizerOctaveUp]);

  useEffect(() => {
    if (lfoSyncGainRef.current) {
      lfoSyncGainRef.current.gain.setTargetAtTime(params.lfoSyncDepth * 247, lfoSyncGainRef.current.context.currentTime, 0.01);
    }
  }, [params.lfoSyncDepth]);

  useEffect(() => {
    if (audioCtxRef.current) {
      buildFilterChain(audioCtxRef.current, params.filterSlope);
      applyFilterParams();
    }
  }, [params.filterSlope, buildFilterChain, applyFilterParams]);

  useEffect(() => {
    if (audioCtxRef.current) {
      buildFilter2Chain(audioCtxRef.current, params.filter2Slope);
      applyFilterParams();
    }
  }, [params.filter2Slope, buildFilter2Chain, applyFilterParams]);

  const rewireEffects = useCallback((order: string[]) => {
    const ctx = audioCtxRef.current;
    const fxInput = fxInputRef.current;
    const pre = preFilterRef.current;
    if (!ctx || !fxInput || !pre) return;
    const fxMap: Record<string, { in: GainNode; out: AudioNode } | null> = {
      comp: fxInComp.current && fxOutComp.current ? { in: fxInComp.current, out: fxOutComp.current } : null,
      dist: fxInDist.current && fxOutDist.current ? { in: fxInDist.current, out: fxOutDist.current } : null,
      mod: fxInMod.current && fxOutMod.current ? { in: fxInMod.current, out: fxOutMod.current } : null,
      delay: fxInDelay.current && fxOutDelay.current ? { in: fxInDelay.current, out: fxOutDelay.current } : null,
    };
    // Disconnect fxInput and all fx outputs from their current destinations
    try { fxInput.disconnect(); } catch { /* ignored */ }
    Object.values(fxMap).forEach(fx => { if (fx) { try { fx.out.disconnect(); } catch { /* ignored */ } } });
    // Reconnect in new order: fxInput → fx[0] → fx[1] → ... → pre
    let prev: AudioNode = fxInput;
    for (const id of order) {
      const fx = fxMap[id];
      if (!fx) continue;
      prev.connect(fx.in);
      prev = fx.out;
    }
    prev.connect(pre);
  }, []);

  const delayTimeSeconds = useCallback((div: number, modifier: string, offset = 0) => {
    const modFactor = modifier === 'dotted' ? 1.5 : modifier === 'triplet' ? 2 / 3 : 1;
    return (60000 / tempoRef.current) * (4 / div) * modFactor / 1000 + offset / 1000;
  }, []);

  useEffect(() => {
    if (!delayNodeRef.current || !delayFeedbackRef.current || !delayWetRef.current) return;
    const { delayEnabled, delayDiv, delayModifier, delayFeedback, delayOffset, delayWet } = params;
    delayNodeRef.current.delayTime.setTargetAtTime(delayTimeSeconds(delayDiv, delayModifier, delayOffset), delayNodeRef.current.context.currentTime, 0.05);
    delayFeedbackRef.current.gain.setTargetAtTime(delayEnabled ? delayFeedback / 100 : 0, delayFeedbackRef.current.context.currentTime, 0.05);
    delayWetRef.current.gain.setTargetAtTime(delayEnabled ? delayWet / 100 : 0, delayWetRef.current.context.currentTime, 0.05);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.delayEnabled, params.delayDiv, params.delayModifier, params.delayFeedback, params.delayOffset, params.delayWet, delayTimeSeconds]);

  useEffect(() => {
    const filters = delayToneFilterRef.current;
    if (!filters) return;
    const [f1, f2] = filters;
    const tone = params.delayTone;
    const t = f1.context.currentTime;
    if (tone < 50) {
      const freq = 16000 / Math.pow(80, (50 - tone) / 50); // 16000Hz–200Hz lowpass (exp: detail near 16k)
      f1.type = 'lowpass'; f2.type = 'lowpass';
      f1.frequency.setValueAtTime(freq, t);
      f2.frequency.setValueAtTime(freq, t);
    } else if (tone > 50) {
      const freq = 100 * Math.pow(120, (tone - 50) / 50); // 100Hz–12000Hz highpass (exp: detail near 100Hz)
      f1.type = 'highpass'; f2.type = 'highpass';
      f1.frequency.setValueAtTime(freq, t);
      f2.frequency.setValueAtTime(freq, t);
    } else {
      f1.type = 'allpass'; f2.type = 'allpass';
      f1.frequency.setValueAtTime(20000, t);
      f2.frequency.setValueAtTime(20000, t);
    }
  }, [params.delayTone]);

  useEffect(() => {
    if (!compressorRef.current) return;
    const { compEnabled, compThreshold, compRatio, compAttack, compRelease } = params;
    const comp = compressorRef.current;
    const t = comp.context.currentTime;
    comp.threshold.setTargetAtTime(compEnabled ? compThreshold : 0, t, 0.05);
    comp.ratio.setTargetAtTime(compEnabled ? compRatio : 1, t, 0.05);
    comp.attack.setTargetAtTime(compAttack, t, 0.05);
    comp.release.setTargetAtTime(compRelease, t, 0.05);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.compEnabled, params.compThreshold, params.compRatio, params.compAttack, params.compRelease]);

  useEffect(() => {
    if (!modLfoRef.current || !modLfoGainRef.current || !modWetRef.current || !modDryRef.current || !modFeedbackRef.current) return;
    const { modEnabled, modRate, modDepth, modMix, modFeedback } = params;
    const t = modLfoRef.current.context.currentTime;
    modLfoRef.current.frequency.setTargetAtTime(0.1 + (modRate / 100) * 4, t, 0.05);
    modLfoGainRef.current.gain.setTargetAtTime(modEnabled ? (modDepth / 100) * 1200 : 0, t, 0.05);
    modWetRef.current.gain.setTargetAtTime(modEnabled ? modMix / 100 : 0, t, 0.05);
    modDryRef.current.gain.setTargetAtTime(modEnabled ? 1 - modMix / 100 : 1, t, 0.05);
    modFeedbackRef.current.gain.setTargetAtTime(modEnabled ? modFeedback / 100 : 0, t, 0.05);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.modEnabled, params.modRate, params.modDepth, params.modMix, params.modFeedback]);

  useEffect(() => {
    if (!distortionRef.current || !distBitCrushRef.current || !distToneRef.current || !distWetRef.current || !distDryRef.current) return;
    const { distEnabled, distAmount, distTone, distBitDepth, distMix } = params;
    const t = distToneRef.current.context.currentTime;
    const makeDistCurve = (amount: number) => {
      const n = 4096, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
      }
      return curve;
    };
    distortionRef.current.curve = distEnabled ? makeDistCurve(distAmount * 4) : null;
    const bitDepthParam = distBitCrushRef.current.parameters.get('bitDepth');
    if (bitDepthParam) bitDepthParam.setTargetAtTime(distBitDepth, t, 0.05);
    distToneRef.current.frequency.setTargetAtTime(800 + (distTone / 100) * 15000, t, 0.05);
    distWetRef.current.gain.setTargetAtTime(distEnabled ? distMix / 100 : 0, t, 0.05);
    distDryRef.current.gain.setTargetAtTime(distEnabled ? 1 - distMix / 100 : 1, t, 0.05);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.distEnabled, params.distAmount, params.distTone, params.distBitDepth, params.distMix]);

  useEffect(() => {
    rewireEffects(params.fxOrder);
  }, [params.fxOrder, rewireEffects]);

  // Also update delay time when tempo changes
  useEffect(() => {
    if (!delayNodeRef.current) return;
    delayNodeRef.current.delayTime.setTargetAtTime(delayTimeSeconds(params.delayDiv, params.delayModifier, params.delayOffset), delayNodeRef.current.context.currentTime, 0.05);
  }, [tempo, params.delayDiv, params.delayModifier, params.delayOffset, delayTimeSeconds]);

  // curve: 0=full inward, 50=linear, 100=full outward
  // Returns a Float32Array sampling a power curve from `from` to `to`
  const makeDecayCurve = (from: number, to: number, curve: number, samples = 128): Float32Array => {
    const buf = new Float32Array(samples);
    // map curve 0–100 → exponent: inward <1, linear =1, outward >1
    const exp = curve <= 50
      ? 0.1 + (curve / 50) * 0.9   // 0.1 → 1.0
      : 1 + ((curve - 50) / 50) * 9; // 1.0 → 10.0
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      buf[i] = from + (to - from) * Math.pow(t, exp);
    }
    return buf;
  };

  const playNote = useCallback(async (noteId: string, freq: number) => {
    if (activeNotesRef.current.has(noteId)) return;
    const wasEmpty = activeNotesRef.current.size === 0;
    const ctx = await getCtx();
    if (ctx.state === 'suspended') ctx.resume();
    if (wasEmpty) restartLfo();
    const t = ctx.currentTime;
    const p = paramsRef.current;

    // LFO ramp: fade in all LFO destinations from 0 on note-on
    if (wasEmpty && lfoRampGainRef.current) {
      const rampSecs = (p.lfoRamp / 100) * 4;
      lfoRampGainRef.current.gain.cancelScheduledValues(t);
      if (p.lfoRamp > 0) {
        lfoRampGainRef.current.gain.setValueAtTime(0, t);
        lfoRampGainRef.current.gain.linearRampToValueAtTime(1, t + rampSecs);
      } else {
        lfoRampGainRef.current.gain.setValueAtTime(1, t);
      }
    }

    // Amplitude envelope
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, t);
    gainNode.gain.linearRampToValueAtTime(1, t + p.attack);
    gainNode.gain.setValueCurveAtTime(makeDecayCurve(1, p.sustain, p.decayCurve), t + p.attack, p.decay);
    gainNode.connect(fxInputRef.current!);

    // Filter 2 key tracking
    if (p.filter2KeyTrack && filter2NodesRef.current.length) {
      const f2Cutoff = Math.min(20000, p.filter2Cutoff * (freq / 261.63));
      filter2NodesRef.current.forEach(f => {
        try { f.frequency.setValueAtTime(f2Cutoff, t); } catch { /* ignored */ }
      });
    }

    // Filter envelope — applied to all nodes in the chain
    const filters = filterNodesRef.current;
    // Key tracking: shift cutoff by semitones relative to A4 (440Hz)
    const baseCutoff = p.filterKeyTrack
      ? Math.min(20000, p.cutoff * (freq / 261.63))
      : p.cutoff;
    // Bipolar: positive sweeps cutoff up toward 20kHz, negative sweeps it down toward the 20Hz floor.
    const filterEnvRange = p.filterEnvAmount >= 0 ? (20000 - baseCutoff) : (baseCutoff - 20);
    const envHz = (p.filterEnvAmount / 100) * filterEnvRange;
    const peakCutoff = Math.max(20, Math.min(20000, baseCutoff + envHz));
    const sustainCutoff = Math.max(20, Math.min(20000, baseCutoff + envHz * p.filterSustain));
    filters.forEach(f => {
      try {
        f.frequency.cancelScheduledValues(t);
        f.frequency.setValueAtTime(baseCutoff, t);
        f.frequency.linearRampToValueAtTime(peakCutoff, t + p.filterAttack);
        f.frequency.setValueCurveAtTime(makeDecayCurve(peakCutoff, sustainCutoff, p.filterDecayCurve), t + p.filterAttack, p.filterDecay);
      } catch { /* ignored */ }
    });

    // Filter resonance envelope
    if (p.filterResEnvAmount !== 0) {
      const baseRes = clampNotchQ(p.filterType, p.resonance);
      // Bipolar: positive pushes Q up toward 30, negative pulls it down toward a near-zero floor.
      const resRange = p.filterResEnvAmount >= 0 ? (30 - baseRes) : (baseRes - 0.0001);
      const peakRes = clampNotchQ(p.filterType, baseRes + (p.filterResEnvAmount / 100) * resRange);
      const sustainRes = clampNotchQ(p.filterType, baseRes + (peakRes - baseRes) * p.filterResSustain);
      filters.forEach(f => {
        try {
          f.Q.cancelScheduledValues(t);
          f.Q.setValueAtTime(baseRes, t);
          f.Q.linearRampToValueAtTime(peakRes, t + p.filterResAttack);
          f.Q.setValueCurveAtTime(makeDecayCurve(peakRes, sustainRes, p.filterResDecayCurve), t + p.filterResAttack, p.filterResDecay);
        } catch { /* ignored */ }
      });
    }

    // Pitch envelope: schedule detune automation per oscillator after they're created
    // Stored as a closure; applied to each osc.detune below after osc creation
    const applyPitchEnv = p.pitchEnvAmount !== 0 ? (detune: AudioParam) => {
      const peakCents = (p.pitchEnvAmount / 100) * 1200;
      const sustainCents = peakCents * p.pitchEnvSustain;
      detune.cancelScheduledValues(t);
      detune.setValueAtTime(detune.value, t);
      detune.linearRampToValueAtTime(detune.value + peakCents, t + p.pitchEnvAttack);
      detune.setValueCurveAtTime(makeDecayCurve(detune.value + peakCents, detune.value + sustainCents, p.pitchEnvCurve), t + p.pitchEnvAttack, p.pitchEnvDecay);
    } : null;

    const applySyncEnv = p.syncEnvAmount !== 0 ? (modGainGain: AudioParam, noteFreq: number) => {
      const peak = (p.syncEnvAmount / 100) * noteFreq * 56;
      const sustainVal = peak * p.syncEnvSustain;
      const base = modGainGain.value;
      try {
        modGainGain.cancelScheduledValues(0);
        modGainGain.setValueAtTime(base, t);
        modGainGain.linearRampToValueAtTime(base + peak, t + p.syncEnvAttack);
        modGainGain.setValueCurveAtTime(makeDecayCurve(base + peak, base + sustainVal, p.syncEnvCurve), t + p.syncEnvAttack, p.syncEnvDecay);
      } catch { /* ignored */ }
    } : null;

    const waveTypes: OscillatorType[] = ['sine', 'square', 'sawtooth', 'triangle'];
    const waveVols = [p.sine, p.square, p.sawtooth, p.triangle];
    const oscillators: OscillatorNode[] = [];
    const squareOscillators: OscillatorNode[] = [];
    const syncData: { modOsc: OscillatorNode; modGain: GainNode }[] = [];
    const unisonVoiceData: { osc: OscillatorNode; detuneFactor: number; panner: StereoPannerNode }[] = [];
    const waveGains: { [type: string]: GainNode[] } = {};
    const lfoTargets: { detune: AudioParam; modGainGain: AudioParam }[] = [];

    // Pulse wave via Fourier series (replaces square when PW ≠ 50%)
    const buildPulseWave = (duty: number): PeriodicWave => {
      const n = 256;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      const d = duty / 100;
      for (let k = 1; k < n; k++) {
        real[k] = -(2 / (k * Math.PI)) * Math.sin(2 * Math.PI * k * d);
        imag[k] = (2 / (k * Math.PI)) * (1 - Math.cos(2 * Math.PI * k * d));
      }
      return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
    };

    // Sync modulator: FM self-mod oscillator that drives carrier freq
    const syncDepth = p.syncAmount / 100;
    const syncRatioVal = 1 + (p.syncRatio / 100) * 3;

    const voices = Math.max(1, Math.round(p.unisonVoices));
    const detuneSpread = p.unisonDetune;

    waveTypes.forEach((type, i) => {
      const vol = waveVols[i] / 100;
      waveGains[type] = [];

      for (let v = 0; v < voices; v++) {
        const detuneCents = voices === 1 ? 0 : (v / (voices - 1) - 0.5) * detuneSpread;

        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        if (type === 'square' && Math.abs(p.pulseWidth - 50) > 0.5) {
          osc.setPeriodicWave(buildPulseWave(p.pulseWidth));
        } else {
          osc.type = type;
        }
        if (type === 'square') squareOscillators.push(osc);

        const slideMs = (p.slide / 100) * 500;
        if (slideMs > 0 && lastFreqRef.current !== null && lastFreqRef.current !== freq) {
          osc.frequency.setValueAtTime(lastFreqRef.current, t);
          osc.frequency.linearRampToValueAtTime(freq, t + slideMs / 1000);
        } else {
          osc.frequency.value = freq;
        }
        osc.detune.value = detuneCents;
        // Per-voice gain = vol / voices (0 vol means silent but node still runs)
        oscGain.gain.value = vol / voices;
        waveGains[type].push(oscGain);

        const detuneFactor = voices === 1 ? 0 : v / (voices - 1) - 0.5;
        const panner = ctx.createStereoPanner();
        panner.pan.value = detuneFactor * 2 * (p.unisonSpread / 100);
        unisonVoiceData.push({ osc, detuneFactor, panner });

        {
          const modOsc = ctx.createOscillator();
          const modGain = ctx.createGain();
          modOsc.type = 'sine';
          modOsc.frequency.value = freq * syncRatioVal;
          modGain.gain.value = Math.min(freq * syncRatioVal * 14 * syncDepth, 22050 - freq);
          modOsc.connect(modGain);
          modGain.connect(osc.frequency);
          if (lfoSyncGainRef.current) lfoSyncGainRef.current.connect(modGain.gain);
          modOsc.start();
          if (applySyncEnv) applySyncEnv(modGain.gain, freq);
          oscillators.push(modOsc);
          syncData.push({ modOsc, modGain });
          lfoTargets.push({ detune: osc.detune, modGainGain: modGain.gain });
        }

        if (lfoGainRef.current) lfoGainRef.current.connect(osc.detune);
        if (lfoFinePitchGainRef.current) lfoFinePitchGainRef.current.connect(osc.detune);
        if (applyPitchEnv) applyPitchEnv(osc.detune);
        osc.connect(oscGain);
        oscGain.connect(panner);
        panner.connect(gainNode);
        const phaseOffset = p.unisonRandomPhase ? Math.random() / freq : 0;
        osc.start(t + phaseOffset);
        oscillators.push(osc);
      }
    });

    // Noise voices
    if (noiseBufferRef.current) {
      waveGains['noise'] = [];
      const noiseVol = p.noise / 100;
      for (let v = 0; v < voices; v++) {
        const detuneFactor = voices === 1 ? 0 : v / (voices - 1) - 0.5;
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBufferRef.current;
        noiseSource.loop = true;
        noiseSource.loopStart = (v / voices) * 2; // offset each voice in the buffer
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = noiseVol / voices;
        waveGains['noise'].push(noiseGain);
        const noisePanner = ctx.createStereoPanner();
        noisePanner.pan.value = detuneFactor * 2 * (p.unisonSpread / 100);
        noiseSource.connect(noiseGain);
        noiseGain.connect(noisePanner);
        noisePanner.connect(gainNode);
        noiseSource.start(t);
        oscillators.push(noiseSource as unknown as OscillatorNode);
      }
    }

    // Harmonizer: mirrors the active wave mix at musical interval ratios above the fundamental.
    // Interval ratios (equal temperament): 3rd=major 3rd, 5th=perfect 5th, 7th=minor 7th, 9th=major 9th
    const BASE_HARMONIZER_RATIOS: Record<number, number> = { 3: 5 / 4, 5: 3 / 2, 7: 9 / 5, 9: 9 / 4 };
    const harmOctMult = p.harmonizerOctaveUp ? 2 : 1;
    const HARMONIZER_RATIOS: Record<number, number> = Object.fromEntries(
      Object.entries(BASE_HARMONIZER_RATIOS).map(([k, v]) => [k, v * harmOctMult])
    );
    const harmonizerData: { osc: OscillatorNode; gain: GainNode; interval: number }[] = [];
    for (const interval of p.harmonizerIntervals) {
      const ratio = HARMONIZER_RATIOS[interval];
      if (!ratio) continue;
      const hFreq = freq * ratio;
      waveTypes.forEach((type, i) => {
        const vol = waveVols[i] / 100;
        if (vol === 0) return;
        const hOsc = ctx.createOscillator();
        const hGain = ctx.createGain();
        if (type === 'square' && Math.abs(p.pulseWidth - 50) > 0.5) {
          hOsc.setPeriodicWave(buildPulseWave(p.pulseWidth));
        } else {
          hOsc.type = type;
        }
        hOsc.frequency.value = hFreq;
        hGain.gain.value = (vol * p.harmonizerAmount) / 100;
        hOsc.connect(hGain);
        hGain.connect(gainNode);
        // FM modulation for harmonizer voice
        const hModOsc = ctx.createOscillator();
        const hModGain = ctx.createGain();
        hModOsc.type = 'sine';
        hModOsc.frequency.value = hFreq * syncRatioVal;
        hModGain.gain.value = Math.min(hFreq * syncRatioVal * 14 * syncDepth, 22050 - hFreq);
        hModOsc.connect(hModGain);
        hModGain.connect(hOsc.frequency);
        hModOsc.start(t);
        if (applySyncEnv) applySyncEnv(hModGain.gain, hFreq);
        oscillators.push(hModOsc);
        syncData.push({ modOsc: hModOsc, modGain: hModGain });
        if (lfoGainRef.current) lfoGainRef.current.connect(hOsc.detune);
        if (lfoFinePitchGainRef.current) lfoFinePitchGainRef.current.connect(hOsc.detune);
        if (applyPitchEnv) applyPitchEnv(hOsc.detune);
        lfoTargets.push({ detune: hOsc.detune, modGainGain: hModGain.gain });
        hOsc.start(t);
        oscillators.push(hOsc);
        harmonizerData.push({ osc: hOsc, gain: hGain, interval });
      });
    }

    lastFreqRef.current = freq;
    activeNotesRef.current.set(noteId, { oscillators, squareOscillators, syncData, unisonVoiceData, waveGains, gainNode, freq, lfoTargets, startTime: t, releaseTime: null, harmonizerData });
    envNodeRef.current = { startTime: t, releaseTime: null };
    setActiveKeys(prev => new Set(prev).add(noteId));
  }, [getCtx, restartLfo]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const releaseNote = useCallback(async (noteId: string) => {
    const note = activeNotesRef.current.get(noteId);
    if (!note) return;
    const ctx = await getCtx();
    const t = ctx.currentTime;
    const p = paramsRef.current;
    const { gainNode, oscillators } = note;

    note.releaseTime = t;
    if (envNodeRef.current && envNodeRef.current.startTime === note.startTime) {
      envNodeRef.current = { startTime: note.startTime, releaseTime: t };
    }

    // Amplitude release
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setValueAtTime(gainNode.gain.value, t);
    gainNode.gain.linearRampToValueAtTime(0, t + p.release);

    // Filter release back to base cutoff — all nodes in chain
    filterNodesRef.current.forEach(f => {
      try {
        f.frequency.cancelScheduledValues(t);
        f.frequency.setValueAtTime(f.frequency.value, t);
        if (!p.filterKeyTrack) {
          f.frequency.linearRampToValueAtTime(p.cutoff, t + p.filterRelease);
        }
      } catch { /* ignored */ }
      if (p.filterResEnvAmount !== 0) {
        try {
          f.Q.cancelScheduledValues(t);
          f.Q.setValueAtTime(f.Q.value, t);
          f.Q.linearRampToValueAtTime(clampNotchQ(p.filterType, p.resonance), t + p.filterResRelease);
        } catch { /* ignored */ }
      }
    });

    // Disconnect LFO from this note's oscillators immediately
    note.lfoTargets.forEach(({ detune, modGainGain }) => {
      try { lfoGainRef.current?.disconnect(detune); } catch { /* ignored */ }
      try { lfoFinePitchGainRef.current?.disconnect(detune); } catch { /* ignored */ }
      try { lfoSyncGainRef.current?.disconnect(modGainGain); } catch { /* ignored */ }
      // Pitch env release
      if (p.pitchEnvAmount !== 0) {
        detune.cancelScheduledValues(t);
        detune.setValueAtTime(detune.value, t);
        detune.linearRampToValueAtTime(0, t + p.pitchEnvRelease);
      }
      // Sync env release — ramp back to pre-env base gain
      if (p.syncEnvAmount !== 0) {
        const baseGain = Math.min(note.freq * (1 + (p.syncRatio / 100) * 3) * 14 * (p.syncAmount / 100), 22050 - note.freq);
        try {
          const cur = modGainGain.value;
          modGainGain.cancelScheduledValues(0);
          modGainGain.setValueAtTime(cur, t);
          modGainGain.linearRampToValueAtTime(baseGain, t + p.syncEnvRelease);
        } catch { /* ignored */ }
      }
    });

    const releaseMs = Math.max(p.release, p.filterRelease, p.filterResEnvAmount !== 0 ? p.filterResRelease : 0, p.syncEnvAmount !== 0 ? p.syncEnvRelease : 0) * 1000 + 100;
    setTimeout(() => {
      oscillators.forEach(o => { try { o.stop(); } catch { /* ignored */ } });
      gainNode.disconnect();
      if (envNodeRef.current?.startTime === note.startTime) envNodeRef.current = null;
    }, releaseMs);
    activeNotesRef.current.delete(noteId);
    setActiveKeys(prev => { const s = new Set(prev); s.delete(noteId); return s; });
  }, [getCtx]);

  const getArpFreqs = useCallback((held: string[], octaves: number, pattern: ArpPattern) => {
    const base = held.map(id => NOTES.find(n => n.note === id)!.freq).filter(Boolean);
    if (!base.length) return [];
    let all = [...base];
    for (let o = 1; o < octaves; o++) {
      all = [...all, ...base.map(f => f * Math.pow(2, o))];
    }
    if (pattern === 'down') return [...all].reverse();
    if (pattern === 'up-down') return [...all, ...[...all].reverse().slice(1, -1)];
    if (pattern === 'random') return all.sort(() => Math.random() - 0.5);
    return all;
  }, []);

  const arpHeldRef = useRef<string[]>([]);
  const paramsRef = useRef(params);
  // eslint-disable-next-line react-hooks/immutability
  useLayoutEffect(() => { paramsRef.current = params; });
  useEffect(() => { arpHeldRef.current = arpHeld; }, [arpHeld]);
  const tempoRef = useRef(tempo);
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => { tempoRef.current = tempo; }, [tempo]);

  useEffect(() => {
    if (arpTimerRef.current) clearInterval(arpTimerRef.current);
    if (!params.arpEnabled) return;

    const scheduleNext = () => {
      const p = paramsRef.current;
      const modFactor = (mod: string) => mod === 'dotted' ? 1.5 : mod === 'triplet' ? 2 / 3 : 1;
      const intervalMs = (60000 / tempoRef.current) * (4 / p.arpDiv) * modFactor(p.arpModifier);
      arpTimerRef.current = window.setTimeout(() => {
        const p2 = paramsRef.current;
        const held = arpHeldRef.current;
        const pitchRatio = Math.pow(2, p2.masterPitch / 12);
        const freqs = getArpFreqs(held, p2.arpOctaves, p2.arpPattern).map((f: number) => f * Math.pow(2, octaveRef.current - 4) * pitchRatio);
        if (freqs.length) {
          activeNotesRef.current.forEach((_, id) => { if (id.startsWith('arp-')) releaseNote(id); });
          const idx = arpIndexRef.current % freqs.length;
          arpIndexRef.current++;
          const noteId = `arp-${Date.now()}`;
          playNote(noteId, freqs[idx]);
          const noteLen = (60000 / tempoRef.current) * (4 / p2.arpDiv) * modFactor(p2.arpModifier);
          setTimeout(() => releaseNote(noteId), noteLen * 0.8);
        }
        scheduleNext();
      }, intervalMs);
    };
    scheduleNext();

    return () => { if (arpTimerRef.current) clearTimeout(arpTimerRef.current); };
  }, [params.arpEnabled, getArpFreqs, playNote, releaseNote]);

  const handleKeyDownRef = useRef<(note: { note: string; freq: number }) => void>(() => {});
  const handleKeyUpRef = useRef<(note: { note: string }) => void>(() => {});

  // Computer keyboard → piano key mapping (uses refs so always calls latest handler)
  useEffect(() => {
    const pressedKeys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLInputElement | null;
      const tag = el?.tagName;
      if (tag === 'SELECT') return;
      if (tag === 'INPUT' && el?.type !== 'range') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setOctave(o => Math.max(0, o - 1)); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); setOctave(o => Math.min(7, o + 1)); return; }
      if (!kbModeRef.current) return;
      const noteId = KEY_MAP[e.key.toLowerCase()];
      if (!noteId || pressedKeys.has(e.key.toLowerCase())) return;
      pressedKeys.add(e.key.toLowerCase());
      const noteObj = NOTES.find(n => n.note === noteId);
      if (noteObj) handleKeyDownRef.current(noteObj);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const wasPressed = pressedKeys.has(key);
      pressedKeys.delete(key);
      if (!kbModeRef.current || !wasPressed) return;
      const noteId = KEY_MAP[key];
      if (!noteId) return;
      const noteObj = NOTES.find(n => n.note === noteId);
      if (noteObj) handleKeyUpRef.current(noteObj);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const handleKeyDown = (note: { note: string; freq: number }) => {
    const pitchRatio = Math.pow(2, paramsRef.current.masterPitch / 12);
    const shiftedFreq = note.freq * Math.pow(2, octaveRef.current - 4) * pitchRatio;
    if (paramsRef.current.arpEnabled) {
      setArpHeld(prev => prev.includes(note.note) ? prev : [...prev, note.note]);
      setActiveKeys(prev => new Set(prev).add(note.note));
    } else {
      if (paramsRef.current.monoMode) {
        activeNotesRef.current.forEach((_, id) => { if (!id.startsWith('arp-')) releaseNote(id); });
      }
      playNote(note.note, shiftedFreq);
    }
  };

  const handleKeyUp = (note: { note: string }) => {
    if (paramsRef.current.arpEnabled) {
      setArpHeld(prev => prev.filter(n => n !== note.note));
      setActiveKeys(prev => { const s = new Set(prev); s.delete(note.note); return s; });
    } else {
      releaseNote(note.note);
    }
  };

  // Press on a key, then drag across the keyboard to slide through notes like a piano glissando.
  const handleKeyMouseDown = (note: { note: string; freq: number }) => {
    isMouseDownRef.current = true;
    mouseHeldNotesRef.current.add(note.note);
    handleKeyDown(note);
  };

  const handleKeyEnter = (note: { note: string; freq: number }) => {
    if (!isMouseDownRef.current || mouseHeldNotesRef.current.has(note.note)) return;
    // Release the note(s) the cursor slid off so only the key under the cursor sounds.
    mouseHeldNotesRef.current.forEach(prevNote => handleKeyUp({ note: prevNote }));
    mouseHeldNotesRef.current.clear();
    mouseHeldNotesRef.current.add(note.note);
    handleKeyDown(note);
  };

  // Keep refs pointing at latest handlers every render
  // eslint-disable-next-line react-hooks/refs
  handleKeyDownRef.current = handleKeyDown;
  // eslint-disable-next-line react-hooks/refs
  handleKeyUpRef.current = handleKeyUp;

  const set = <K extends keyof SynthParams>(key: K, val: SynthParams[K]) =>
    setParams(p => ({ ...p, [key]: val }));

  const whiteNotes = NOTES.filter(n => !n.black);

  const whiteCount = whiteNotes.length;

  // Release all mouse-held notes on global mouseup so dragging knobs doesn't cut notes
  useEffect(() => {
    const onMouseUp = () => {
      isMouseDownRef.current = false;
      mouseHeldNotesRef.current.forEach(noteId => handleKeyUpRef.current({ note: noteId }));
      mouseHeldNotesRef.current.clear();
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

  if (!hydrated) return (
    <div className="synth-app synth-app--loading">
      <div className="synth-loading">
        <div className="synth-loading-logo">◈ CRIBL SYNTH</div>
        <div className="synth-loading-dots"><span /><span /><span /></div>
      </div>
    </div>
  );

  return (
    <SkinContext.Provider value={skin}>
    <div className="synth-app">
      <div className="synth-body">
        <MatrixRain active={skin === 'matrix'} />

        <AppModal modal={modal} dismiss={dismiss} />
        <div className="synth-content">
        <div className="synth-header">
          <div className="synth-logo">◈ CRIBL SYNTH</div>
          <div className="tempo-control">
            <button className="octave-btn" data-tooltip="Decrease BPM" onMouseDown={() => startBpmRepeat(-1)} onMouseUp={stopBpmRepeat} onMouseLeave={stopBpmRepeat} disabled={tempo <= 40}>◀</button>
            <input
              className="tempo-input"
              type="text"
              value={tempoInput}
              onChange={e => setTempoInput(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={e => commitTempo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitTempo(tempoInput); }}
              maxLength={3}
            />
            <span className="tempo-bpm-label">BPM</span>
            <button className="octave-btn" data-tooltip="Increase BPM" onMouseDown={() => startBpmRepeat(1)} onMouseUp={stopBpmRepeat} onMouseLeave={stopBpmRepeat} disabled={tempo >= 200}>▶</button>
<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                className="octave-btn"
                onClick={() => {
                  const list = presets.filter(p => p.name !== 'init').sort((a, b) => a.name.localeCompare(b.name));
                  if (!list.length) return;
                  const idx = list.findIndex(p => p.name === activePreset);
                  const prev = list[(idx - 1 + list.length) % list.length];
                  activeNotesRef.current.forEach((_, id) => releaseNote(id));
                  setParams({ ...DEFAULTS, ...prev.params });
                  setTempo(prev.tempo);
                  setTempoInput(String(prev.tempo));
                  setOctave(prev.octave ?? 4);
                  setActivePreset(prev.name);
                }}
                disabled={presets.filter(p => p.name !== 'init').length === 0}
                data-tooltip="Previous preset"
              >◀</button>
<PresetDropdown
              activePreset={activePreset}
              presets={presets}
              onAction={async val => {
                if (val === '__save__') {
                  if (!activePreset || activePreset === 'init') {
                    const name = await showPrompt('Preset name:');
                    if (!name?.trim()) return;
                    const newPreset: Preset = { name: name.trim(), params, tempo, octave };
                    savePreset(newPreset);
                    const updated = [...presets.filter(p => p.name !== name.trim()), newPreset].sort((a, b) => a.name === 'init' ? -1 : b.name === 'init' ? 1 : a.name.localeCompare(b.name));
                    setPresets(updated);
                    setActivePreset(name.trim());
                  } else {
                    const newPreset: Preset = { name: activePreset, params, tempo, octave };
                    savePreset(newPreset);
                    const updated = presets.map(p => p.name === activePreset ? newPreset : p);
                    setPresets(updated);
                  }
                } else if (val === '__saveas__') {
                  const name = await showPrompt('Preset name:', activePreset && activePreset !== 'init' ? activePreset : '');
                  if (!name?.trim()) return;
                  const exists = presets.some(p => p.name === name.trim() && p.name !== 'init');
                  if (exists && !await showConfirm(`This will overwrite the existing preset "${name.trim()}". Are you sure you want to overwrite it?`)) return;
                  const newPreset: Preset = { name: name.trim(), params, tempo, octave };
                  savePreset(newPreset);
                  const updated = [...presets.filter(p => p.name !== name.trim()), newPreset].sort((a, b) => a.name === 'init' ? -1 : b.name === 'init' ? 1 : a.name.localeCompare(b.name));
                  setPresets(updated);
                  setActivePreset(name.trim());
                } else if (val === '__delete__') {
                  if (activePreset && activePreset !== 'init' && await showConfirm(`Are you sure you want to delete the preset "${activePreset}"?`)) {
                    deletePreset(activePreset);
                    const updated = presets.filter(p => p.name !== activePreset);
                    setPresets(updated);
                    setActivePreset('');
                  }
                } else {
                  const preset = presets.find(p => p.name === val);
                  if (preset) {
                    activeNotesRef.current.forEach((_, id) => releaseNote(id));
                    setParams({ ...DEFAULTS, ...preset.params });
                    setTempo(preset.tempo);
                    setTempoInput(String(preset.tempo));
                    setOctave(preset.octave ?? 4);
                    setActivePreset(val === 'init' ? '' : preset.name);
                  }
                }
              }}
            />
              <button
                className="octave-btn"
                onClick={() => {
                  const list = presets.filter(p => p.name !== 'init').sort((a, b) => a.name.localeCompare(b.name));
                  if (!list.length) return;
                  const idx = list.findIndex(p => p.name === activePreset);
                  const next = list[(idx + 1) % list.length];
                  activeNotesRef.current.forEach((_, id) => releaseNote(id));
                  setParams({ ...DEFAULTS, ...next.params });
                  setTempo(next.tempo);
                  setTempoInput(String(next.tempo));
                  setOctave(next.octave ?? 4);
                  setActivePreset(next.name);
                }}
                disabled={presets.filter(p => p.name !== 'init').length === 0}
                data-tooltip="Next preset"
              >▶</button>
            </div>
            <SkinDropdown
              skin={skin}
              onChangeSkin={newSkin => {
                activeNotesRef.current.forEach((_, id) => releaseNote(id));
                setActiveKeys(new Set());
                setArpHeld([]);
                setSkin(newSkin);
                storageSet('cribl-synth-skin', newSkin);
              }}
            />
            <button className="init-btn" onClick={randomizeParams} data-tooltip="Randomize synth parameters">RANDOM</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="init-btn"
              onClick={() => {
                activeNotesRef.current.forEach((_, id) => releaseNote(id));
                setArpHeld([]);
                const ctx = audioCtxRef.current;
                if (!ctx || !masterGainRef.current) return;
                const t = ctx.currentTime;
                // Zero feedback and wet instantly to kill the delay loop and drain the buffer silently
                if (delayFeedbackRef.current) { delayFeedbackRef.current.gain.cancelScheduledValues(t); delayFeedbackRef.current.gain.setValueAtTime(0, t); }
                if (delayWetRef.current) { delayWetRef.current.gain.cancelScheduledValues(t); delayWetRef.current.gain.setValueAtTime(0, t); }
                // Kill master gain instantly
                masterGainRef.current.gain.cancelScheduledValues(t);
                masterGainRef.current.gain.setValueAtTime(0, t);
                // Restore after the delay buffer has fully drained (max delay is 4s, wait one full cycle)
                const delayMs = (delayNodeRef.current?.delayTime.value ?? 0) * 1000;
                setTimeout(() => {
                  const p = paramsRef.current;
                  if (masterGainRef.current) masterGainRef.current.gain.value = (p.volume / 100) * 0.75;
                  if (delayWetRef.current) delayWetRef.current.gain.value = p.delayEnabled ? p.delayWet / 100 : 0;
                  if (delayFeedbackRef.current) delayFeedbackRef.current.gain.value = p.delayEnabled ? p.delayFeedback / 100 : 0;
                }, delayMs + 100);
              }}
              data-tooltip="Kills all sound"
            >PANIC</button>
            <div className="synth-model">GOAT VA</div>
          </div>
        </div>

        <div className="synth-panels">
          {/* OSC + LFO column */}
          <div className="osc-lfo-column">
            <div className="panel osc-panel">
            <div className="panel-title">OSCILLATOR</div>
            <WaveSlider type="sine" value={params.sine} onChange={v => set('sine', v)} defaultValue={DEFAULTS.sine} />
            <WaveSlider type="square" value={params.square} onChange={v => set('square', v)} defaultValue={DEFAULTS.square} />
            <div style={{ paddingLeft: 16 }}>
              <WaveSlider type="pulse" value={params.pulseWidth} onChange={v => set('pulseWidth', v)} label="PULSE WIDTH" min={1} max={99} disabled={params.square === 0} defaultValue={DEFAULTS.pulseWidth} />
            </div>
            <WaveSlider type="sawtooth" value={params.sawtooth} onChange={v => set('sawtooth', v)} defaultValue={DEFAULTS.sawtooth} />
            <WaveSlider type="triangle" value={params.triangle} onChange={v => set('triangle', v)} defaultValue={DEFAULTS.triangle} />
            <WaveSlider type="noise" value={params.noise} onChange={v => set('noise', v)} defaultValue={DEFAULTS.noise} />
            <div className="osc-divider" />
            <div className="unison-section">
              <div className="unison-label">UNISON</div>
              <div className="unison-voices">
                {[1, 2, 3, 4, 6, 8].map(v => (
                  <button
                    key={v}
                    className={`arp-div-btn ${params.unisonVoices === v ? 'active' : ''}`}
                    onClick={() => set('unisonVoices', v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <WaveSlider
                type="sync"
                value={params.unisonDetune}
                onChange={v => set('unisonDetune', v)}
                label="DETUNE"
                min={0}
                max={100}
                disabled={params.unisonVoices <= 1}
                defaultValue={DEFAULTS.unisonDetune}
              />
              <WaveSlider
                type="sync"
                value={params.unisonSpread}
                onChange={v => set('unisonSpread', v)}
                label="SPREAD"
                min={0}
                max={100}
                disabled={params.unisonVoices <= 1}
                defaultValue={DEFAULTS.unisonSpread}
              />
              <button
                className={`arp-mod-btn ${params.unisonRandomPhase ? 'active' : ''}`}
                style={{ marginTop: 4, alignSelf: 'flex-start', paddingLeft: 12, paddingRight: 12, ...(params.unisonVoices <= 1 ? { filter: 'brightness(0.35)', pointerEvents: 'none' } : {}) }}
                disabled={params.unisonVoices <= 1}
                onClick={() => set('unisonRandomPhase', !params.unisonRandomPhase)}
              >
                RANDOM PHASE
              </button>
            </div>
            <div className="osc-divider" />
            <WaveSlider type="sync" value={params.syncAmount} onChange={v => set('syncAmount', v)} label="FM" tooltip="Frequency modulation" defaultValue={DEFAULTS.syncAmount} />
            <div style={{ paddingLeft: 16 }}>
              <WaveSlider type="sync" value={params.syncRatio} onChange={v => set('syncRatio', v)} label="RATIO" tooltip="FM frequency ratio" defaultValue={DEFAULTS.syncRatio} />
            </div>
            <WaveSlider type="sync" value={params.harmonizerAmount} onChange={v => set('harmonizerAmount', v)} label="HARMONIZER" defaultValue={DEFAULTS.harmonizerAmount} />
            <div className="arp-divs" style={{ marginTop: 6 }}>
              {([3, 5, 7, 9] as const).map(n => (
                <button
                  key={n}
                  className={`arp-div-btn ${params.harmonizerIntervals.includes(n) ? 'active' : ''}`}
                  onClick={() => {
                    const next = params.harmonizerIntervals.includes(n)
                      ? params.harmonizerIntervals.filter(i => i !== n)
                      : [...params.harmonizerIntervals, n];
                    setParams(p => ({ ...p, harmonizerIntervals: next, harmonizerOctaveUp: next.length === 0 ? false : p.harmonizerOctaveUp }));
                  }}
                  disabled={params.harmonizerAmount === 0}
                  style={{ flex: 1, filter: params.harmonizerAmount === 0 ? 'brightness(0.35)' : undefined, cursor: params.harmonizerAmount === 0 ? 'not-allowed' : 'pointer' }}
                >
                  {n === 3 ? '3RD' : n === 5 ? '5TH' : n === 7 ? '7TH' : '9TH'}
                </button>
              ))}
              <button
                className={`arp-div-btn ${params.harmonizerOctaveUp ? 'active' : ''}`}
                onClick={() => { if (params.harmonizerIntervals.length > 0 && params.harmonizerAmount > 0) set('harmonizerOctaveUp', !params.harmonizerOctaveUp); }}
                disabled={params.harmonizerIntervals.length === 0 || params.harmonizerAmount === 0}
                data-tooltip="Shifts harmonizer voices up one octave"
                style={{ flex: 1, filter: (params.harmonizerIntervals.length === 0 || params.harmonizerAmount === 0) ? 'brightness(0.35)' : undefined, cursor: (params.harmonizerIntervals.length === 0 || params.harmonizerAmount === 0) ? 'not-allowed' : 'pointer' }}
              >
                +1 OCT
              </button>
            </div>
            </div>
            <div className="panel" style={{ flex: 1 }}>
              <div className="panel-title">LFO</div>
              <div className="arp-label">TIME</div>
              <div className="arp-divs">
                {[1, 2, 4, 8, 16, 32, 64].map(d => (
                  <button key={d} className={`arp-div-btn ${params.lfoDiv === d ? 'active' : ''}`} onClick={() => set('lfoDiv', d)}>1/{d}</button>
                ))}
              </div>
              <div className="arp-modifiers">
                <button className={`arp-mod-btn ${params.lfoModifier === 'dotted' ? 'active' : ''}`} onClick={() => set('lfoModifier', params.lfoModifier === 'dotted' ? 'none' : 'dotted')}>DOTTED</button>
                <button className={`arp-mod-btn ${params.lfoModifier === 'triplet' ? 'active' : ''}`} onClick={() => set('lfoModifier', params.lfoModifier === 'triplet' ? 'none' : 'triplet')}>TRIPLET</button>
              </div>
              <div className="arp-label" style={{ marginTop: 10 }}>SHAPE</div>
              <div className="arp-divs lfo-shape-btns">
                {(['sine', 'square', 'sawtooth', 'triangle', 'noise', 'sampleAndHold'] as LfoShape[]).map(shape => (
                  <button key={shape} className={`arp-div-btn ${params.lfoShape === shape ? 'active' : ''}`} onClick={() => set('lfoShape', shape)} data-tooltip={shape === 'sampleAndHold' ? 'Sample & Hold' : shape === 'noise' ? 'Noise' : shape.charAt(0).toUpperCase() + shape.slice(1)}>
                    {shape === 'sine' ? <span style={{ fontSize: 20, lineHeight: 1 }}>∿</span> : shape === 'square' ? '⊓' : shape === 'sawtooth' ? <SawtoothIcon color="currentColor" width={16} height={12} /> : shape === 'triangle' ? '△' : shape === 'noise' ? '≋' : 'S&H'}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 8 }}>
                <button className={`arp-mod-btn ${params.lfoPolarity === -1 ? 'active' : ''}`} style={{ paddingLeft: 12, paddingRight: 12, marginBottom: 8 }} onClick={() => set('lfoPolarity', params.lfoPolarity === 1 ? -1 : 1)} data-tooltip="Invert the LFO signal">FLIP POLARITY</button>
              </div>
              <WaveSlider type="sine" value={params.lfoCutoffDepth} min={-100} onChange={v => set('lfoCutoffDepth', v)} label="FILTER CUTOFF" defaultValue={DEFAULTS.lfoCutoffDepth} />
              <WaveSlider type="sine" value={params.lfoResDepth} min={-100} onChange={v => set('lfoResDepth', v)} label="FILTER RES" tooltip="Filter resonance" defaultValue={DEFAULTS.lfoResDepth} />
              <WaveSlider type="sync" value={params.lfoDepth} min={-100} onChange={v => set('lfoDepth', v)} label="COARSE PITCH" defaultValue={DEFAULTS.lfoDepth} />
              <WaveSlider type="sync" value={params.lfoFinePitchDepth} min={-100} onChange={v => set('lfoFinePitchDepth', v)} label="FINE PITCH" max={100} defaultValue={DEFAULTS.lfoFinePitchDepth} />
              <WaveSlider type="pulse" value={params.lfoPwDepth} min={-100} onChange={v => set('lfoPwDepth', v)} label="PULSE WIDTH" disabled={params.square === 0} defaultValue={DEFAULTS.lfoPwDepth} />
              <WaveSlider type="sync" value={params.lfoSyncDepth} min={-100} onChange={v => set('lfoSyncDepth', v)} label="FM" tooltip="Frequency modulation" defaultValue={DEFAULTS.lfoSyncDepth} />
              <WaveSlider type="ramp" value={params.lfoRamp} onChange={v => set('lfoRamp', v)} label="RAMP" defaultValue={DEFAULTS.lfoRamp} style={{ marginBottom: 0 }} tooltip="Fades in LFO depth from zero on note-on. 0 = instant, 100 = 4 second fade-in." />
            </div>
          </div>{/* end osc-lfo-column */}

          {/* ADSR Column */}
          <div className="adsr-lfo-column">
            <div className="panel adsr-panel">
              <div className="panel-title">ENVELOPE</div>
              <div className="filter-env-title" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>VOLUME</div>
              <div className="knobs-row" style={{ marginTop: 8 }}>
                <Knob label="ATK" value={params.attack} min={0.001} max={2} onChange={v => set('attack', v)} size={55} defaultValue={DEFAULTS.attack} tooltip="Attack" />
                <Knob label="DEC" value={params.decay} min={0.001} max={2} onChange={v => set('decay', v)} size={55} defaultValue={DEFAULTS.decay} tooltip="Decay" />
                <Knob label="CRV" value={params.decayCurve} min={0} max={100} onChange={v => set('decayCurve', v)} size={55} defaultValue={DEFAULTS.decayCurve} tooltip="Curve" />
                <Knob label="SUS" value={params.sustain} min={0} max={1} onChange={v => set('sustain', v)} size={55} defaultValue={DEFAULTS.sustain} tooltip="Sustain" />
                <Knob label="REL" value={params.release} min={0.001} max={4} onChange={v => set('release', v)} size={55} defaultValue={DEFAULTS.release} tooltip="Release" />
              </div>
              <div className="adsr-viz">
                <AdsrViz attack={params.attack} decay={params.decay} decayCurve={params.decayCurve} sustain={params.sustain} release={params.release} envNodeRef={envNodeRef} audioCtxRef={audioCtxRef} />
              </div>
              <div className="filter-env-title">FILTER CUTOFF</div>
              <div className="knobs-row" style={{ marginTop: 8 }}>
                <Knob label="ATK" value={params.filterAttack} min={0.001} max={2} onChange={v => set('filterAttack', v)} size={55} defaultValue={DEFAULTS.filterAttack} tooltip="Attack" disabled={params.filterEnvAmount === 0} />
                <Knob label="DEC" value={params.filterDecay} min={0.001} max={2} onChange={v => set('filterDecay', v)} size={55} defaultValue={DEFAULTS.filterDecay} tooltip="Decay" disabled={params.filterEnvAmount === 0} />
                <Knob label="CRV" value={params.filterDecayCurve} min={0} max={100} onChange={v => set('filterDecayCurve', v)} size={55} defaultValue={DEFAULTS.filterDecayCurve} tooltip="Curve" disabled={params.filterEnvAmount === 0} />
                <Knob label="SUS" value={params.filterSustain} min={0} max={1} onChange={v => set('filterSustain', v)} size={55} defaultValue={DEFAULTS.filterSustain} tooltip="Sustain" disabled={params.filterEnvAmount === 0} />
                <Knob label="REL" value={params.filterRelease} min={0.001} max={4} onChange={v => set('filterRelease', v)} size={55} defaultValue={DEFAULTS.filterRelease} tooltip="Release" disabled={params.filterEnvAmount === 0} />
                <Knob label="AMOUNT" value={params.filterEnvAmount} min={-100} max={100} onChange={v => set('filterEnvAmount', v)} unit="%" size={55} defaultValue={DEFAULTS.filterEnvAmount} tooltip="Envelope depth — negative inverts direction" />
              </div>
              <div className="adsr-viz">
                <AdsrViz attack={params.filterAttack} decay={params.filterDecay} decayCurve={params.filterDecayCurve} sustain={params.filterSustain} release={params.filterRelease} disabled={params.filterEnvAmount === 0} envNodeRef={envNodeRef} audioCtxRef={audioCtxRef} />
              </div>
              <div className="filter-env-title">FILTER RESONANCE</div>
              <div className="knobs-row" style={{ marginTop: 8 }}>
                <Knob label="ATK" value={params.filterResAttack} min={0.001} max={2} onChange={v => set('filterResAttack', v)} size={55} defaultValue={DEFAULTS.filterResAttack} tooltip="Attack" disabled={params.filterResEnvAmount === 0} />
                <Knob label="DEC" value={params.filterResDecay} min={0.001} max={2} onChange={v => set('filterResDecay', v)} size={55} defaultValue={DEFAULTS.filterResDecay} tooltip="Decay" disabled={params.filterResEnvAmount === 0} />
                <Knob label="CRV" value={params.filterResDecayCurve} min={0} max={100} onChange={v => set('filterResDecayCurve', v)} size={55} defaultValue={DEFAULTS.filterResDecayCurve} tooltip="Curve" disabled={params.filterResEnvAmount === 0} />
                <Knob label="SUS" value={params.filterResSustain} min={0} max={1} onChange={v => set('filterResSustain', v)} size={55} defaultValue={DEFAULTS.filterResSustain} tooltip="Sustain" disabled={params.filterResEnvAmount === 0} />
                <Knob label="REL" value={params.filterResRelease} min={0.001} max={4} onChange={v => set('filterResRelease', v)} size={55} defaultValue={DEFAULTS.filterResRelease} tooltip="Release" disabled={params.filterResEnvAmount === 0} />
                <Knob label="AMOUNT" value={params.filterResEnvAmount} min={-100} max={100} onChange={v => set('filterResEnvAmount', v)} unit="%" size={55} defaultValue={DEFAULTS.filterResEnvAmount} tooltip="Envelope depth — negative inverts direction" />
              </div>
              <div className="adsr-viz">
                <AdsrViz attack={params.filterResAttack} decay={params.filterResDecay} decayCurve={params.filterResDecayCurve} sustain={params.filterResSustain} release={params.filterResRelease} disabled={params.filterResEnvAmount === 0} envNodeRef={envNodeRef} audioCtxRef={audioCtxRef} />
              </div>
              <div className="filter-env-title">COARSE PITCH</div>
              <div className="knobs-row" style={{ marginTop: 8 }}>
                <Knob label="ATK" value={params.pitchEnvAttack} min={0.001} max={2} onChange={v => set('pitchEnvAttack', v)} size={55} defaultValue={DEFAULTS.pitchEnvAttack} tooltip="Attack" disabled={params.pitchEnvAmount === 0} />
                <Knob label="DEC" value={params.pitchEnvDecay} min={0.001} max={2} onChange={v => set('pitchEnvDecay', v)} size={55} defaultValue={DEFAULTS.pitchEnvDecay} tooltip="Decay" disabled={params.pitchEnvAmount === 0} />
                <Knob label="CRV" value={params.pitchEnvCurve} min={0} max={100} onChange={v => set('pitchEnvCurve', v)} size={55} defaultValue={DEFAULTS.pitchEnvCurve} tooltip="Curve" disabled={params.pitchEnvAmount === 0} />
                <Knob label="SUS" value={params.pitchEnvSustain} min={0} max={1} onChange={v => set('pitchEnvSustain', v)} size={55} defaultValue={DEFAULTS.pitchEnvSustain} tooltip="Sustain" disabled={params.pitchEnvAmount === 0} />
                <Knob label="REL" value={params.pitchEnvRelease} min={0.001} max={4} onChange={v => set('pitchEnvRelease', v)} size={55} defaultValue={DEFAULTS.pitchEnvRelease} tooltip="Release" disabled={params.pitchEnvAmount === 0} />
                <Knob label="AMOUNT" value={params.pitchEnvAmount} min={-100} max={100} onChange={v => set('pitchEnvAmount', v)} unit="%" size={55} defaultValue={DEFAULTS.pitchEnvAmount} tooltip="Envelope depth — negative inverts direction" />
              </div>
              <div className="adsr-viz">
                <AdsrViz attack={params.pitchEnvAttack} decay={params.pitchEnvDecay} decayCurve={params.pitchEnvCurve} sustain={params.pitchEnvSustain} release={params.pitchEnvRelease} disabled={params.pitchEnvAmount === 0} envNodeRef={envNodeRef} audioCtxRef={audioCtxRef} />
              </div>
              <div className="filter-env-title">FM</div>
              <div className="knobs-row" style={{ marginTop: 8 }}>
                <Knob label="ATK" value={params.syncEnvAttack} min={0.001} max={2} onChange={v => set('syncEnvAttack', v)} size={55} defaultValue={DEFAULTS.syncEnvAttack} tooltip="Attack" disabled={params.syncEnvAmount === 0} />
                <Knob label="DEC" value={params.syncEnvDecay} min={0.001} max={2} onChange={v => set('syncEnvDecay', v)} size={55} defaultValue={DEFAULTS.syncEnvDecay} tooltip="Decay" disabled={params.syncEnvAmount === 0} />
                <Knob label="CRV" value={params.syncEnvCurve} min={0} max={100} onChange={v => set('syncEnvCurve', v)} size={55} defaultValue={DEFAULTS.syncEnvCurve} tooltip="Curve" disabled={params.syncEnvAmount === 0} />
                <Knob label="SUS" value={params.syncEnvSustain} min={0} max={1} onChange={v => set('syncEnvSustain', v)} size={55} defaultValue={DEFAULTS.syncEnvSustain} tooltip="Sustain" disabled={params.syncEnvAmount === 0} />
                <Knob label="REL" value={params.syncEnvRelease} min={0.001} max={4} onChange={v => set('syncEnvRelease', v)} size={55} defaultValue={DEFAULTS.syncEnvRelease} tooltip="Release" disabled={params.syncEnvAmount === 0} />
                <Knob label="AMOUNT" value={params.syncEnvAmount} min={-100} max={100} onChange={v => set('syncEnvAmount', v)} unit="%" size={55} defaultValue={DEFAULTS.syncEnvAmount} tooltip="Envelope depth — negative inverts direction" />
              </div>
              <div className="adsr-viz">
                <AdsrViz attack={params.syncEnvAttack} decay={params.syncEnvDecay} decayCurve={params.syncEnvCurve} sustain={params.syncEnvSustain} release={params.syncEnvRelease} disabled={params.syncEnvAmount === 0} envNodeRef={envNodeRef} audioCtxRef={audioCtxRef} />
              </div>
            </div>
          </div>

          {/* Volume + Arp + Filter Panel */}
          <div className="right-column">
            <div className="panel">
              <div className="panel-title">
                MASTER
                <button
                  className={`arp-toggle ${params.monoMode ? 'on' : ''}`}
                  style={{ marginLeft: 'auto' }}
                  data-tooltip="Only one note plays at a time, cutting off any previous note"
                  onClick={() => set('monoMode', !params.monoMode)}
                >
                  MONO
                </button>
              </div>
              <div className="knobs-row knobs-row-edge">
                <Knob label="VOLUME" value={params.volume} min={0} max={100} onChange={v => set('volume', v)} unit="%" size={55} defaultValue={DEFAULTS.volume} />
                <Knob label="PITCH" value={params.masterPitch} min={-12} max={12} step={1} onChange={v => set('masterPitch', v)} format={v => v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`} size={55} defaultValue={DEFAULTS.masterPitch} tooltip="Master pitch in semitones" />
                <Knob label="SLIDE" value={params.slide} min={0} max={100} onChange={v => set('slide', v)} unit="%" size={55} defaultValue={DEFAULTS.slide} />
              </div>
            </div>
            <div className="panel">
              <div className="panel-title">
                FILTER
                <button
                  className={`arp-toggle ${(params.activeFilter === 1 ? params.filter1Enabled : params.filter2Enabled) ? 'on' : ''}`}
                  style={{ marginLeft: 8 }}
                  onClick={() => params.activeFilter === 1 ? set('filter1Enabled', !params.filter1Enabled) : set('filter2Enabled', !params.filter2Enabled)}
                >
                  {(params.activeFilter === 1 ? params.filter1Enabled : params.filter2Enabled) ? 'ON' : 'OFF'}
                </button>
                <div className="filter-title-controls">
                  <button
                    className={`filter-bank-btn ${params.activeFilter === 1 ? 'active' : ''}`}
                    onClick={() => set('activeFilter', 1)}
                    data-tooltip="Filter 1"
                    style={{ position: 'relative' }}
                  >{params.filter1Enabled && <span className="filter-active-dot" />}1</button>
                  <button
                    className={`filter-bank-btn ${params.activeFilter === 2 ? 'active' : ''}`}
                    onClick={() => set('activeFilter', 2)}
                    data-tooltip="Filter 2"
                    style={{ position: 'relative' }}
                  >{params.filter2Enabled && <span className="filter-active-dot" />}2</button>
                </div>
              </div>
              {params.activeFilter === 1 ? (<>
                <div className="filter-types" style={params.filter1Enabled ? {} : { filter: 'brightness(0.35)', pointerEvents: 'none' }}>
                  {(['lowpass', 'highpass', 'bandpass', 'notch'] as BiquadFilterType[]).map(ft => (
                    <button
                      key={ft}
                      className={`filter-btn ${params.filterType === ft ? 'active' : ''}`}
                      onClick={() => set('filterType', ft)}
                      data-tooltip={ft === 'lowpass' ? 'Low pass' : ft === 'highpass' ? 'High pass' : ft === 'bandpass' ? 'Band pass' : 'Band reject'}
                    >
                      {ft === 'lowpass' ? 'LP' : ft === 'highpass' ? 'HP' : ft === 'bandpass' ? 'BP' : 'BR'}
                    </button>
                  ))}
                </div>
                <div className="knobs-row knobs-row-edge filter-knobs-row" style={!params.filter1Enabled ? { filter: 'brightness(0.35)', pointerEvents: 'none' } : undefined}>
                  <Knob label="CUTOFF" value={params.cutoff} min={20} max={20000} scale={0.4} onChange={v => set('cutoff', v)} unit="Hz" size={55} defaultValue={DEFAULTS.cutoff} />
                  <Knob label="RESONANCE" value={params.resonance} min={0} max={20} onChange={v => set('resonance', v)} size={55} defaultValue={DEFAULTS.resonance} />
                  <Knob label="DRIVE" value={params.filterDrive} min={0} max={100} onChange={v => set('filterDrive', v)} unit="%" size={55} defaultValue={DEFAULTS.filterDrive} tooltip="Saturates the filter output for added harmonics and grit" />
                  <div className="filter-key-slot">
                    <button
                      className={`arp-mod-btn ${params.filterKeyTrack ? 'active' : ''}`}
                      style={{ padding: '4px 8px' }}
                      onClick={() => set('filterKeyTrack', !params.filterKeyTrack)}
                      data-tooltip="Key tracking: filter cutoff follows note pitch"
                    >KEY</button>
                  </div>
                </div>
                <div className="filter-slope" style={params.filter1Enabled ? {} : { filter: 'brightness(0.35)', pointerEvents: 'none' }}>
                  {([6, 12, 24, 36] as const).map(s => (
                    <button
                      key={s}
                      className={`filter-btn ${params.filterSlope === s ? 'active' : ''}`}
                      onClick={() => set('filterSlope', s)}
                    >
                      {s}dB
                    </button>
                  ))}
                </div>
              </>) : (<>
                <div className="filter-types" style={params.filter2Enabled ? {} : { filter: 'brightness(0.35)', pointerEvents: 'none' }}>
                  {(['lowpass', 'highpass', 'bandpass', 'notch'] as BiquadFilterType[]).map(ft => (
                    <button
                      key={ft}
                      className={`filter-btn ${params.filter2Type === ft ? 'active' : ''}`}
                      onClick={() => set('filter2Type', ft)}
                      data-tooltip={ft === 'lowpass' ? 'Low pass' : ft === 'highpass' ? 'High pass' : ft === 'bandpass' ? 'Band pass' : 'Band reject'}
                    >
                      {ft === 'lowpass' ? 'LP' : ft === 'highpass' ? 'HP' : ft === 'bandpass' ? 'BP' : 'BR'}
                    </button>
                  ))}
                </div>
                <div className="knobs-row knobs-row-edge filter-knobs-row" style={!params.filter2Enabled ? { filter: 'brightness(0.35)', pointerEvents: 'none' } : undefined}>
                  <Knob label="CUTOFF" value={params.filter2Cutoff} min={20} max={20000} scale={0.4} onChange={v => set('filter2Cutoff', v)} unit="Hz" size={55} defaultValue={DEFAULTS.filter2Cutoff} />
                  <Knob label="RESONANCE" value={params.filter2Resonance} min={0} max={20} onChange={v => set('filter2Resonance', v)} size={55} defaultValue={DEFAULTS.filter2Resonance} />
                  <Knob label="DRIVE" value={params.filter2Drive} min={0} max={100} onChange={v => set('filter2Drive', v)} unit="%" size={55} defaultValue={DEFAULTS.filter2Drive} tooltip="Saturates the filter output for added harmonics and grit" />
                  <div className="filter-key-slot">
                    <button
                      className={`arp-mod-btn ${params.filter2KeyTrack ? 'active' : ''}`}
                      style={{ padding: '4px 8px' }}
                      onClick={() => set('filter2KeyTrack', !params.filter2KeyTrack)}
                      data-tooltip="Key tracking: filter cutoff follows note pitch"
                    >KEY</button>
                  </div>
                </div>
                <div className="filter-slope" style={params.filter2Enabled ? {} : { filter: 'brightness(0.35)', pointerEvents: 'none' }}>
                  {([6, 12, 24, 36] as const).map(s => (
                    <button
                      key={s}
                      className={`filter-btn ${params.filter2Slope === s ? 'active' : ''}`}
                      onClick={() => set('filter2Slope', s)}
                    >
                      {s}dB
                    </button>
                  ))}
                </div>
              </>)}
            </div>
            <div className="panel">
              <div className="panel-title">
                ARPEGGIATOR
                <button
                  className={`arp-toggle ${params.arpEnabled ? 'on' : ''}`}
                  style={{ marginLeft: 8 }}
                  onClick={() => set('arpEnabled', !params.arpEnabled)}
                >
                  {params.arpEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="arp-row" style={params.arpEnabled ? {} : { filter: 'brightness(0.35)', pointerEvents: 'none' }}>
                <div className="arp-controls">
                  <div className="arp-label" style={{ marginTop: 0 }}>TIME</div>
                  <div className="arp-divs">
                    {[1, 2, 4, 8, 16, 32, 64].map(d => (
                      <button
                        key={d}
                        className={`arp-div-btn ${params.arpDiv === d ? 'active' : ''}`}
                        onClick={() => set('arpDiv', d)}
                      >
                        1/{d}
                      </button>
                    ))}
                  </div>
                  <div className="arp-modifiers">
                    <button
                      className={`arp-mod-btn ${params.arpModifier === 'dotted' ? 'active' : ''}`}
                      onClick={() => set('arpModifier', params.arpModifier === 'dotted' ? 'none' : 'dotted')}
                    >
                      DOTTED
                    </button>
                    <button
                      className={`arp-mod-btn ${params.arpModifier === 'triplet' ? 'active' : ''}`}
                      onClick={() => set('arpModifier', params.arpModifier === 'triplet' ? 'none' : 'triplet')}
                    >
                      TRIPLET
                    </button>
                  </div>
                  <div className="arp-label">PATTERN</div>
                  <div className="arp-patterns">
                    {ARP_PATTERNS.map(p => (
                      <button
                        key={p}
                        className={`arp-pat-btn ${params.arpPattern === p ? 'active' : ''}`}
                        onClick={() => set('arpPattern', p)}
                      >
                        {p === 'up' ? '↑' : p === 'down' ? '↓' : p === 'up-down' ? '↕' : '?'}
                      </button>
                    ))}
                  </div>
                  <div className="arp-label">OCTAVES</div>
                  <div className="arp-octs">
                    {[1, 2, 3].map(o => (
                      <button
                        key={o}
                        className={`arp-oct-btn ${params.arpOctaves === o ? 'active' : ''}`}
                        onClick={() => set('arpOctaves', o)}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="arp-held">
                {params.arpEnabled && arpHeld.map(n => <span key={n} className="arp-held-note">{n}</span>)}
              </div>
            </div>
          </div>

          {/* Effects column */}
          <div className="panel">
            <div className="panel-title">EFFECTS</div>
            {params.fxOrder.map((fxId, idx) => {
              const moveUp = () => {
                if (idx === 0) return;
                const o = [...params.fxOrder];
                [o[idx - 1], o[idx]] = [o[idx], o[idx - 1]];
                set('fxOrder', o);
              };
              const moveDown = () => {
                if (idx === params.fxOrder.length - 1) return;
                const o = [...params.fxOrder];
                [o[idx], o[idx + 1]] = [o[idx + 1], o[idx]];
                set('fxOrder', o);
              };
              const isFirst = idx === 0;
              const isLast = idx === params.fxOrder.length - 1;
              const titleStyle: React.CSSProperties = idx === 0 ? { borderTop: 'none', paddingTop: 0, marginTop: 0 } : {};
              const reorderBtns = (
                <span className="fx-reorder-btns">
                  <button className="fx-reorder-btn" onClick={moveUp} disabled={isFirst} data-tooltip="Move up in chain">▲</button>
                  <button className="fx-reorder-btn" onClick={moveDown} disabled={isLast} data-tooltip="Move down in chain">▼</button>
                </span>
              );
              const fxDisabledStyle = (enabled: boolean): React.CSSProperties => enabled ? {} : { filter: 'brightness(0.35)', pointerEvents: 'none' };
              if (fxId === 'comp') return (
                <div key="comp">
                  <div className="filter-env-title" style={titleStyle}>
                    COMPRESSOR
                    <button className={`arp-toggle ${params.compEnabled ? 'on' : ''}`} style={{ marginLeft: 8 }} onClick={() => set('compEnabled', !params.compEnabled)}>
                      {params.compEnabled ? 'ON' : 'OFF'}
                    </button>
                    {reorderBtns}
                  </div>
                  <div className="knobs-row" style={{ marginTop: 8, ...fxDisabledStyle(params.compEnabled) }}>
                    <Knob label="THRESH" value={params.compThreshold} min={-60} max={0} onChange={v => set('compThreshold', v)} unit="dB" size={55} defaultValue={DEFAULTS.compThreshold} tooltip="Threshold" />
                    <Knob label="RATIO" value={params.compRatio} min={1} max={20} onChange={v => set('compRatio', v)} unit=":1" size={55} defaultValue={DEFAULTS.compRatio} />
                    <Knob label="ATK" value={params.compAttack * 1000} min={0} max={200} onChange={v => set('compAttack', v / 1000)} unit="ms" size={55} defaultValue={DEFAULTS.compAttack * 1000} tooltip="Attack" />
                    <Knob label="REL" value={params.compRelease * 1000} min={10} max={1000} onChange={v => set('compRelease', v / 1000)} unit="ms" size={55} defaultValue={DEFAULTS.compRelease * 1000} tooltip="Release" />
                  </div>
                </div>
              );
              if (fxId === 'dist') return (
                <div key="dist">
                  <div className="filter-env-title" style={titleStyle}>
                    DISTORTION
                    <button className={`arp-toggle ${params.distEnabled ? 'on' : ''}`} style={{ marginLeft: 8 }} onClick={() => set('distEnabled', !params.distEnabled)}>
                      {params.distEnabled ? 'ON' : 'OFF'}
                    </button>
                    {reorderBtns}
                  </div>
                  <div className="knobs-row" style={{ marginTop: 8, ...fxDisabledStyle(params.distEnabled) }}>
                    <Knob label="DRIVE" value={params.distAmount} min={0} max={100} onChange={v => set('distAmount', v)} unit="%" size={55} defaultValue={DEFAULTS.distAmount} />
                    <Knob label="TONE" value={params.distTone} min={0} max={100} onChange={v => set('distTone', v)} unit="%" size={55} defaultValue={DEFAULTS.distTone} />
                    <Knob label="BITS" value={params.distBitDepth} min={0} max={100} onChange={v => set('distBitDepth', v)} unit="%" size={55} defaultValue={DEFAULTS.distBitDepth} tooltip="Bit depth — 100% is clean, 0% is heavy bit crushing" tooltipAnchor="end" />
                    <Knob label="MIX" value={params.distMix} min={0} max={100} onChange={v => set('distMix', v)} unit="%" size={55} defaultValue={DEFAULTS.distMix} />
                  </div>
                </div>
              );
              if (fxId === 'mod') return (
                <div key="mod">
                  <div className="filter-env-title" style={titleStyle}>
                    PHASER
                    <button className={`arp-toggle ${params.modEnabled ? 'on' : ''}`} style={{ marginLeft: 8 }} onClick={() => set('modEnabled', !params.modEnabled)}>
                      {params.modEnabled ? 'ON' : 'OFF'}
                    </button>
                    {reorderBtns}
                  </div>
                  <div className="knobs-row" style={{ marginTop: 8, ...fxDisabledStyle(params.modEnabled) }}>
                    <Knob label="RATE" value={params.modRate} min={0} max={100} onChange={v => set('modRate', v)} unit="%" size={55} defaultValue={DEFAULTS.modRate} />
                    <Knob label="DEPTH" value={params.modDepth} min={0} max={100} onChange={v => set('modDepth', v)} unit="%" size={55} defaultValue={DEFAULTS.modDepth} />
                    <Knob label="FDBK" value={params.modFeedback} min={0} max={100} onChange={v => set('modFeedback', v)} unit="%" size={55} defaultValue={DEFAULTS.modFeedback} tooltip="Feedback" />
                    <Knob label="MIX" value={params.modMix} min={0} max={100} onChange={v => set('modMix', v)} unit="%" size={55} defaultValue={DEFAULTS.modMix} />
                  </div>
                </div>
              );
              if (fxId === 'delay') return (
                <div key="delay">
                  <div className="filter-env-title" style={titleStyle}>
                    DELAY
                    <button className={`arp-toggle ${params.delayEnabled ? 'on' : ''}`} style={{ marginLeft: 8 }} onClick={() => set('delayEnabled', !params.delayEnabled)}>
                      {params.delayEnabled ? 'ON' : 'OFF'}
                    </button>
                    {reorderBtns}
                  </div>
                  <div style={fxDisabledStyle(params.delayEnabled)}>
                    <div className="arp-label">TIME</div>
                    <div className="arp-divs">
                      {[1, 2, 4, 8, 16, 32, 64].map(d => (
                        <button key={d} className={`arp-div-btn ${params.delayDiv === d ? 'active' : ''}`} onClick={() => set('delayDiv', d)}>1/{d}</button>
                      ))}
                    </div>
                    <div className="arp-modifiers">
                      <button className={`arp-mod-btn ${params.delayModifier === 'dotted' ? 'active' : ''}`} onClick={() => set('delayModifier', params.delayModifier === 'dotted' ? 'none' : 'dotted')}>DOTTED</button>
                      <button className={`arp-mod-btn ${params.delayModifier === 'triplet' ? 'active' : ''}`} onClick={() => set('delayModifier', params.delayModifier === 'triplet' ? 'none' : 'triplet')}>TRIPLET</button>
                    </div>
                    <div className="knobs-row" style={{ marginTop: 12 }}>
                      <Knob label="FEEDBACK" value={params.delayFeedback} min={0} max={100} onChange={v => set('delayFeedback', v)} unit="%" size={55} defaultValue={DEFAULTS.delayFeedback} />
                      <Knob label="TONE" value={params.delayTone} min={0} max={100} onChange={v => set('delayTone', v)} size={55} defaultValue={DEFAULTS.delayTone} tooltip="Low pass ← center (no effect) → High pass" />
                      <Knob label="OFFSET" value={params.delayOffset} min={0} max={30} onChange={v => set('delayOffset', v)} unit="ms" size={55} defaultValue={DEFAULTS.delayOffset} tooltip="Adds up to 30ms of additional delay time" />
                      <Knob label="MIX" value={params.delayWet} min={0} max={100} onChange={v => set('delayWet', v)} unit="%" size={55} defaultValue={DEFAULTS.delayWet} />
                    </div>
                  </div>
                </div>
              );
              return null;
            })}
          </div>
          <VizPanel analyserRef={vizAnalyserRef} mode={vizMode} skin={skin} onToggle={() => setVizMode(m => { const next = m === 'scope' ? 'spectrum' : 'scope'; storageSet('vizMode', next); return next; })} />
        </div>

        {/* Keyboard */}
        <div className="keyboard-wrap">
          <div className="keyboard-header">
            <div className="octave-control">
              <button className="octave-btn" onClick={() => setOctave(o => Math.max(0, o - 1))} disabled={octave <= 0}>◀</button>
              <span className="octave-display">OCTAVE {octave}</span>
              <button className="octave-btn" onClick={() => setOctave(o => Math.min(7, o + 1))} disabled={octave >= 7}>▶</button>
            </div>
            <div className="kb-mode-group">
              <span className="kb-mode-label">KEYBOARD INPUT</span>
              <label className="kb-mode-toggle">
                <input type="checkbox" checked={kbMode} onChange={e => setKbMode(e.target.checked)} />
                <span className="kb-switch" />
                <span className="kb-mode-toggle-text">{kbMode ? 'ON' : 'OFF'}</span>
              </label>
            </div>
          </div>
          <div className="keyboard" style={{ '--white-count': whiteCount } as React.CSSProperties}>
            {whiteNotes.map((note, i) => {
              const kbKey = kbMode ? NOTE_TO_KEY[note.note] : undefined;
              return (
                <div
                  key={note.note}
                  className={`key white-key ${activeKeys.has(note.note) ? 'active' : ''}`}
                  style={{ left: `${(i / whiteCount) * 100}%`, width: `${100 / whiteCount}%` }}
                  onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); handleKeyMouseDown(note); }}
                  onMouseEnter={() => handleKeyEnter(note)}
                  onMouseUp={() => { mouseHeldNotesRef.current.delete(note.note); handleKeyUp(note); }}
                >
                  {kbKey && <span className="key-kb-hint">{kbKey.toUpperCase()}</span>}
                  <span className="key-label">{note.note.replace(/\d/, '')}</span>
                </div>
              );
            })}
            {NOTES.map((note, i) => {
              if (!note.black) return null;
              const prevWhites = NOTES.slice(0, i).filter(n => !n.black).length;
              return (
                <div
                  key={note.note}
                  className={`key black-key ${activeKeys.has(note.note) ? 'active' : ''}`}
                  style={{ left: `${((prevWhites - 0.3) / whiteCount) * 100}%` }}
                  onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); handleKeyMouseDown(note); }}
                  onMouseEnter={() => handleKeyEnter(note)}
                  onMouseUp={(e: React.MouseEvent) => { e.stopPropagation(); mouseHeldNotesRef.current.delete(note.note); handleKeyUp(note); }}
                >
                  <span className="black-key-label">{note.note.replace(/\d/, '')}</span>
                </div>
              );
            })}
          </div>
        </div>
        </div>
      </div>
    </div>
    </SkinContext.Provider>
  );
}

