import * as React from 'react';

const PulseIcon = ({ color = 'var(--accent)', width = 18, height = 18 }: { color?: string; width?: number; height?: number }) => (
  <svg width={width} height={height} viewBox="0 0 22 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <polyline points="1,14 1,14 6,14 6,4 10,4 10,14 21,14" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none" />
  </svg>
);

const RampIcon = ({ color = 'var(--accent)', width = 18, height = 18 }: { color?: string; width?: number; height?: number }) => (
  <svg width={width} height={height} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <polyline points="2,16 16,2 16,16 2,16" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" fill="none" />
  </svg>
);

export const SawtoothIcon = ({ color = 'var(--accent)', width = 18, height = 18 }: { color?: string; width?: number; height?: number }) => (
  <svg width={width} height={height} viewBox="0 0 22 18" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <line x1="1" y1="16" x2="10" y2="2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <line x1="10" y1="2" x2="10" y2="16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <line x1="10" y1="16" x2="20" y2="2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <line x1="20" y1="2" x2="20" y2="16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export function WaveSlider({ type, value, onChange, label, min = 0, max = 100, disabled = false, defaultValue, style, tooltip }: { type: string; value: number; onChange: (v: number) => void; label?: string; min?: number; max?: number; disabled?: boolean; defaultValue?: number; style?: React.CSSProperties; tooltip?: string }) {
  const waveIcons: { [k: string]: React.ReactNode } = {
    sine: <span style={{ fontSize: 24, lineHeight: 1 }}>∿</span>,
    square: '⊓',
    sawtooth: <SawtoothIcon />,
    triangle: '△',
    sync: <span style={{ fontSize: 24, lineHeight: 1 }}>⟳</span>,
    ramp: <RampIcon width={14} height={14} />,
    pulse: <PulseIcon />,
    noise: '≋',
  };
  const [localValue, setLocalValue] = React.useState(value);
  const rafRef = React.useRef<number | null>(null);
  const pendingRef = React.useRef<number>(value);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => { setLocalValue(value); }, [value]);
  const handleChange = (v: number) => {
    setLocalValue(v);
    pendingRef.current = v;
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        onChange(pendingRef.current);
        rafRef.current = null;
      });
    }
  };
  const pct = Math.round(((localValue - min) / (max - min)) * 100);
  return (
    <div
      className={`wave-slider${disabled ? ' disabled' : ''}`}
      style={{ pointerEvents: disabled ? 'none' : undefined, ...style }}
      onDoubleClick={() => { if (defaultValue !== undefined) { setLocalValue(defaultValue); onChange(defaultValue); } }}
    >
      <div className="wave-icon">{waveIcons[type] ?? '·'}</div>
      <div className="wave-label" data-tooltip={tooltip}>{label ?? type}</div>
      <input
        type="range" min={min} max={max} value={localValue}
        onChange={e => handleChange(Number(e.target.value))}
        className="wave-range"
        disabled={disabled}
        style={{ '--val': `${pct}%` } as React.CSSProperties}
      />
      <div className="wave-pct">{localValue}%</div>
    </div>
  );
}
