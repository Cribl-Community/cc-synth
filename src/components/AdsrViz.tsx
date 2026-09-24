import { useState, useEffect, useRef } from 'react';

export function AdsrViz({ attack, decay, decayCurve, sustain, release, disabled = false, envNodeRef, audioCtxRef }: {
  attack: number; decay: number; decayCurve: number; sustain: number; release: number; disabled?: boolean;
  envNodeRef?: React.MutableRefObject<{ startTime: number; releaseTime: number | null } | null>;
  audioCtxRef?: React.MutableRefObject<AudioContext | null>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(200);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 200));
    ro.observe(el);
    setW(el.clientWidth || 200);
    return () => ro.disconnect();
  }, []);

  const h = 60, pad = 8;
  const total = attack + decay + 0.3 + release;
  const ax = pad + (attack / total) * (w - pad * 2);
  const dx = ax + (decay / total) * (w - pad * 2);
  const sx = dx + (0.3 / total) * (w - pad * 2);
  const rx = w - pad;
  const top = pad, bot = h - pad;
  const sy = top + (1 - sustain) * (bot - top);

  const exp = decayCurve <= 50
    ? 0.1 + (decayCurve / 50) * 0.9
    : 1 + ((decayCurve - 50) / 50) * 9;
  const decayPts: string[] = [];
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    const x = ax + frac * (dx - ax);
    const y = top + Math.pow(frac, exp) * (sy - top);
    decayPts.push(`${x},${y}`);
  }
  const decayPath = decayPts.join(' ');
  const fillPath = `M${pad},${bot} L${ax},${top} ` +
    decayPts.map((p, i) => (i === 0 ? `L${p}` : p)).join(' ') +
    ` L${sx},${sy} L${rx},${bot} Z`;

  const color = disabled ? '#3a3a5a' : 'var(--accent)';
  const fill = disabled ? 'rgba(58,58,90,0.13)' : 'var(--accent-glow-faint)';

  const [dot, setDot] = useState<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (disabled || !envNodeRef || !audioCtxRef) return;
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const env = envNodeRef.current;
      const ctx = audioCtxRef.current;
      if (!env || !ctx) { setDot(null); return; }
      const now = ctx.currentTime;
      const elapsed = now - env.startTime;
      let nx: number, ny: number;
      if (env.releaseTime === null) {
        if (elapsed < attack) {
          const frac = elapsed / attack;
          nx = pad + frac * (ax - pad);
          ny = bot + frac * (top - bot);
        } else if (elapsed < attack + decay) {
          const frac = (elapsed - attack) / decay;
          nx = ax + frac * (dx - ax);
          ny = top + Math.pow(frac, exp) * (sy - top);
        } else {
          nx = sx;
          ny = sy;
        }
      } else {
        const relElapsed = now - env.releaseTime;
        const frac = Math.min(relElapsed / release, 1);
        nx = sx + frac * (rx - sx);
        ny = sy + frac * (bot - sy);
        if (frac >= 1) { setDot(null); return; }
      }
      setDot({ x: nx, y: ny });
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [disabled, envNodeRef, audioCtxRef, attack, decay, decayCurve, sustain, release, ax, dx, sx, rx, top, bot, sy, exp, pad]);

  return (
    <svg ref={svgRef} width="100%" height={h} style={{ display: 'block' }}>
      <path d={fillPath} fill={fill} stroke="none" />
      <polyline points={`${pad},${bot} ${ax},${top}`} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <polyline points={decayPath} fill="none" stroke={color} strokeWidth="2" />
      <polyline points={`${dx},${sy} ${sx},${sy} ${rx},${bot}`} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {dot && !disabled && <circle cx={dot.x} cy={dot.y} r={4} fill="#ffffff" stroke="var(--accent)" strokeWidth="1.5" />}
    </svg>
  );
}
