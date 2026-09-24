import * as React from 'react';
import { useEffect, useRef } from 'react';
import { SkinContext } from '../SkinContext';

export function Knob({ label, value, min, max, onChange, unit = '', size = 64, defaultValue, tooltip, tooltipAnchor, disabled = false, step, format, scale }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  unit?: string;
  size?: number;
  defaultValue?: number;
  tooltip?: string;
  tooltipAnchor?: 'start' | 'center' | 'end';
  disabled?: boolean;
  step?: number;
  format?: (v: number) => string;
  scale?: 'log' | number;
}) {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startNorm = useRef(0);
  const activeSkin = React.useContext(SkinContext);

  const toNorm = (v: number) => {
    if (scale === 'log') return Math.log(v / min) / Math.log(max / min);
    if (typeof scale === 'number') return Math.pow((v - min) / (max - min), scale);
    return (v - min) / (max - min);
  };
  const fromNorm = (n: number) => {
    const t = Math.max(0, Math.min(1, n));
    if (scale === 'log') return min * Math.pow(max / min, t);
    if (typeof scale === 'number') return min + Math.pow(t, 1 / scale) * (max - min);
    return min + t * (max - min);
  };

  const normalized = toNorm(value);
  const angle = -135 + normalized * 270;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.detail === 2) return;
    isDragging.current = true;
    startY.current = e.clientY;
    startNorm.current = toNorm(value);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = (startY.current - e.clientY) / 200;
      let newVal = fromNorm(startNorm.current + delta);
      newVal = Math.min(max, Math.max(min, newVal));
      if (step !== undefined) newVal = Math.round(newVal / step) * step;
      onChange(newVal);
    };
    const handleMouseUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, onChange]);

  const cx = size / 2;
  const r = size / 2 - 6;
  const rad = (angle * Math.PI) / 180;
  const tickX = cx + r * Math.sin(rad);
  const tickY = cx - r * Math.cos(rad);

  const displayVal = format ? format(value)
    : unit === 'Hz' ? (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : Math.round(value).toString())
    : unit === '%' ? Math.round(value).toString()
    : value.toFixed(2);

  const gid = `kg-${label.replace(/\s+/g, '_')}`;
  const tooltipProps = tooltip
    ? { 'data-tooltip': tooltip, ...(tooltipAnchor && tooltipAnchor !== 'center' ? { 'data-tooltip-anchor': tooltipAnchor } : {}) }
    : {};

  if (activeSkin === 'skeuomorphic') {
    const bodyR = r + 1;

    const pRad = (angle * Math.PI) / 180;
    const indInner = bodyR * 0.15;
    const indOuter = bodyR * 0.82;
    const p1x = cx + indInner * Math.sin(pRad);
    const p1y = cx - indInner * Math.cos(pRad);
    const p2x = cx + indOuter * Math.sin(pRad);
    const p2y = cx - indOuter * Math.cos(pRad);

    return (
      <div className={`knob-container${disabled ? ' disabled' : ''}`} style={{ width: size, pointerEvents: disabled ? 'none' : undefined }} {...tooltipProps}>
        <svg
          width={size}
          height={size}
          onMouseDown={handleMouseDown}
          onDoubleClick={() => { if (defaultValue !== undefined) onChange(defaultValue); }}
          style={{ cursor: 'ns-resize', display: 'block', margin: '0 auto' }}
        >
          <defs>
            <radialGradient id={`${gid}-body`} cx="33%" cy="28%" r="72%">
              <stop offset="0%" stopColor="#a87830" />
              <stop offset="25%" stopColor="#8a5e20" />
              <stop offset="60%" stopColor="#5a3e18" />
              <stop offset="100%" stopColor="#3a2610" />
            </radialGradient>
            <radialGradient id={`${gid}-spec`} cx="32%" cy="26%" r="28%">
              <stop offset="0%" stopColor="rgba(255,235,160,0.2)" />
              <stop offset="100%" stopColor="rgba(255,235,160,0)" />
            </radialGradient>
          </defs>

          <circle cx={cx} cy={cx + 2} r={bodyR + 2} fill="rgba(0,0,0,0.5)" />
          <circle cx={cx} cy={cx} r={bodyR + 1} fill="rgba(0,0,0,0.7)" />
          <circle cx={cx} cy={cx} r={bodyR} fill={`url(#${gid}-body)`} />
          <line x1={p1x} y1={p1y} x2={p2x} y2={p2y} stroke="rgba(0,0,0,0.8)" strokeWidth="3.5" strokeLinecap="round" />
          <line x1={p1x} y1={p1y} x2={p2x} y2={p2y} stroke="rgba(240,232,215,1)" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx={cx} cy={cx} r={bodyR} fill={`url(#${gid}-spec)`} />
        </svg>
        <div className="knob-value">{displayVal}{unit}</div>
        <div className="knob-label">{label}</div>
      </div>
    );
  }

  return (
    <div className={`knob-container${disabled ? ' disabled' : ''}`} style={{ width: size, pointerEvents: disabled ? 'none' : undefined }} {...tooltipProps}>
      <svg
        width={size}
        height={size}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => { if (defaultValue !== undefined) onChange(defaultValue); }}
        style={{ cursor: 'ns-resize', display: 'block', margin: '0 auto' }}
      >
        <defs>
          <radialGradient id={gid} cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#4a4a6a" />
            <stop offset="100%" stopColor="#1a1a2e" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cx} r={r + 4} fill="var(--bg-base)" />
        <circle cx={cx} cy={cx} r={r} fill={`url(#${gid})`} stroke="var(--border-mid)" strokeWidth="1.5" />
        <line
          x1={cx} y1={cx}
          x2={tickX} y2={tickY}
          stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"
        />
        <circle cx={tickX} cy={tickY} r="3" fill="var(--accent)" />
      </svg>
      <div className="knob-value">{displayVal}{unit}</div>
      <div className="knob-label">{label}</div>
    </div>
  );
}
