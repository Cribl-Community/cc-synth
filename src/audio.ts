export const NOTCH_Q_MIN = 0.01;

export const clampNotchQ = (type: BiquadFilterType, q: number) =>
  type === 'notch' ? Math.max(NOTCH_Q_MIN, q) : q;

export const FILTER_DRIVE_MAX_K = 15;

export const FILTER_DRIVE_HEADROOM = 4;

export const makeFilterDriveCurve = (amount: number): Float32Array<ArrayBuffer> => {
  const n = 2048;
  const curve = new Float32Array(n);
  const k = (Math.max(0, amount) / 100) * FILTER_DRIVE_MAX_K;
  const norm = k > 0 ? Math.tanh(k) : 1;
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * 2 - 1;
    curve[i] = k > 0 ? (FILTER_DRIVE_HEADROOM * Math.tanh(k * u)) / norm : FILTER_DRIVE_HEADROOM * u;
  }
  return curve as Float32Array<ArrayBuffer>;
};

export const BIT_CRUSHER_WORKLET_URL = new URL('bit-crusher-processor.js', document.baseURI).href;
