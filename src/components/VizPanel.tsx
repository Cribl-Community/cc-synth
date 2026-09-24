import { useEffect, useLayoutEffect, useRef } from 'react';
import type { VizMode } from '../types';

export function VizPanel({ analyserRef: externalAnalyserRef, mode, onToggle, skin }: { analyserRef: React.MutableRefObject<AnalyserNode | null>; mode: VizMode; onToggle: () => void; skin: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = externalAnalyserRef;
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const mouseXRef = useRef<number | null>(null);
  const skinRef = useRef(skin);
  useEffect(() => { skinRef.current = skin; }, [skin]);

  const colorsRef = useRef({ accent: '#00e5ff', accentDim: '#1a1a3a', bgBase: '#0a0a14', vizGrid: '#1a1a3a' });
  useEffect(() => {
    const s = getComputedStyle(document.documentElement);
    colorsRef.current = {
      accent: s.getPropertyValue('--accent').trim() || '#00e5ff',
      accentDim: s.getPropertyValue('--accent-dim').trim() || '#1a1a3a',
      bgBase: s.getPropertyValue('--bg-base').trim() || '#0a0a14',
      vizGrid: s.getPropertyValue('--viz-grid').trim() || s.getPropertyValue('--accent-dim').trim() || '#1a1a3a',
    };
  }, [skin]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const analyser = analyserRef.current;
      const W = canvas.width;
      const H = canvas.height;
      const { accent, bgBase, vizGrid } = colorsRef.current;
      ctx2d.clearRect(0, 0, W, H);
      ctx2d.fillStyle = bgBase;
      ctx2d.fillRect(0, 0, W, H);

      if (!analyser) {
        ctx2d.strokeStyle = vizGrid;
        ctx2d.lineWidth = 1;
        for (let x = 0; x <= W; x += W / 4) { ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, H); ctx2d.stroke(); }
        for (let y = 0; y <= H; y += H / 3) { ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(W, y); ctx2d.stroke(); }
        return;
      }

      if (modeRef.current === 'scope') {
        analyser.fftSize = 2048;
        const buf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);

        ctx2d.strokeStyle = vizGrid;
        ctx2d.lineWidth = 1;
        for (let x = 0; x <= W; x += W / 4) { ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, H); ctx2d.stroke(); }
        for (let y = 0; y <= H; y += H / 3) { ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(W, y); ctx2d.stroke(); }

        const isRasta = skinRef.current === 'rasta';
        let scopeStroke: string | CanvasGradient = accent;
        let scopeShadow = accent;
        if (isRasta) {
          const g = ctx2d.createLinearGradient(0, 0, W, 0);
          g.addColorStop(0, '#00cc44');
          g.addColorStop(0.5, '#ff8800');
          g.addColorStop(1, '#ff2200');
          scopeStroke = g;
          scopeShadow = '#ff8800';
        }
        ctx2d.strokeStyle = scopeStroke;
        ctx2d.globalAlpha = 0.2;
        ctx2d.lineWidth = 1;
        ctx2d.beginPath(); ctx2d.moveTo(0, H / 2); ctx2d.lineTo(W, H / 2); ctx2d.stroke();
        ctx2d.globalAlpha = 1;

        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        const dc = sum / buf.length;

        const scale = 1.33;

        ctx2d.strokeStyle = scopeStroke;
        ctx2d.lineWidth = 1.5;
        ctx2d.shadowBlur = 6;
        ctx2d.shadowColor = scopeShadow;
        ctx2d.beginPath();
        for (let i = 0; i < buf.length; i++) {
          const x = (i / buf.length) * W;
          const y = H / 2 - (buf[i] - dc) * scale * (H / 2);
          if (i === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
        }
        ctx2d.stroke();
        ctx2d.shadowBlur = 0;
      } else {
        analyser.fftSize = 2048;
        const binCount = analyser.frequencyBinCount;
        const buf = new Uint8Array(binCount);
        analyser.getByteFrequencyData(buf);

        ctx2d.strokeStyle = vizGrid;
        ctx2d.lineWidth = 1;
        for (let x = 0; x <= W; x += W / 4) { ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, H); ctx2d.stroke(); }
        for (let y = 0; y <= H; y += H / 4) { ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(W, y); ctx2d.stroke(); }

        const logMin = Math.log10(20);
        const logMax = Math.log10(analyser.context.sampleRate / 2);
        const barCount = 480;
        const barW = W / barCount;
        const isRastaSpec = skinRef.current === 'rasta';
        let specFill: string | CanvasGradient = accent;
        if (isRastaSpec) {
          const g = ctx2d.createLinearGradient(0, 0, W, 0);
          g.addColorStop(0, '#00cc44');
          g.addColorStop(0.5, '#ff8800');
          g.addColorStop(1, '#ff2200');
          specFill = g;
        }
        for (let i = 0; i < barCount; i++) {
          const f0 = Math.pow(10, logMin + (i / barCount) * (logMax - logMin));
          const f1 = Math.pow(10, logMin + ((i + 1) / barCount) * (logMax - logMin));
          const b0 = Math.floor((f0 / (analyser.context.sampleRate / 2)) * binCount);
          const b1 = Math.ceil((f1 / (analyser.context.sampleRate / 2)) * binCount);
          let peak = 0;
          for (let b = Math.max(0, b0); b < Math.min(binCount, b1); b++) { if (buf[b] > peak) peak = buf[b]; }
          const barH = (peak / 255) * H;
          ctx2d.fillStyle = specFill;
          ctx2d.globalAlpha = 0.4 + (peak / 255) * 0.6;
          ctx2d.shadowBlur = 4;
          if (isRastaSpec) {
            const t = i / barCount;
            const sr = t < 0.5 ? Math.round(255 * (t * 2)) : 255;
            const sg = t < 0.5 ? Math.round(204 * (1 - t * 2) + 136 * (t * 2)) : Math.round(136 * (1 - (t - 0.5) * 2) + 34 * ((t - 0.5) * 2));
            const sb = t < 0.5 ? Math.round(68 * (1 - t * 2)) : 0;
            ctx2d.shadowColor = `rgb(${sr},${sg},${sb})`;
          } else {
            ctx2d.shadowColor = accent;
          }
          ctx2d.fillRect(i * barW + 1, H - barH, barW - 1, barH);
        }
        ctx2d.globalAlpha = 1;
        ctx2d.shadowBlur = 0;

        const mx = mouseXRef.current;
        if (mx !== null && analyser) {
          const logMin = Math.log10(20);
          const logMax2 = Math.log10(analyser.context.sampleRate / 2);
          const hoverFreq = Math.round(Math.pow(10, logMin + (mx / W) * (logMax2 - logMin)));
          ctx2d.strokeStyle = accent;
          ctx2d.globalAlpha = 0.5;
          ctx2d.lineWidth = 1;
          ctx2d.setLineDash([4, 3]);
          ctx2d.beginPath(); ctx2d.moveTo(mx, 0); ctx2d.lineTo(mx, H); ctx2d.stroke();
          ctx2d.setLineDash([]);
          ctx2d.globalAlpha = 1;
          const label = hoverFreq >= 1000 ? `${(hoverFreq / 1000).toFixed(1)}kHz` : `${hoverFreq}Hz`;
          ctx2d.font = '15px Courier New';
          ctx2d.fillStyle = accent;
          const textW = ctx2d.measureText(label).width;
          const tx = Math.min(mx + 6, W - textW - 4);
          ctx2d.fillText(label, tx, 14);
        }
      }
    };
    draw();
    return () => { if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    canvas.width = wrap.clientWidth;
    canvas.height = wrap.clientHeight;
  }, []);
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="panel viz-panel">
      <div className="panel-title" style={{ marginBottom: 10, flexShrink: 0 }}>
        VISUALIZER
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className={`arp-mod-btn ${mode === 'scope' ? 'active' : ''}`} style={{ flex: 'none', paddingLeft: 12, paddingRight: 12 }} onClick={onToggle}>OSCILLOSCOPE</button>
          <button className={`arp-mod-btn ${mode === 'spectrum' ? 'active' : ''}`} style={{ flex: 'none', paddingLeft: 12, paddingRight: 12, whiteSpace: 'nowrap' }} onClick={onToggle}>SPECTRUM ANALYZER</button>
        </div>
      </div>
      <div ref={wrapRef} style={{ flex: 1, minHeight: 255, borderRadius: 6, border: '1px solid #2a2a4a', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%' }}
          onMouseMove={e => {
            const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
            mouseXRef.current = (e.clientX - rect.left) * ((e.target as HTMLCanvasElement).width / rect.width);
          }}
          onMouseLeave={() => { mouseXRef.current = null; }}
        />
      </div>
    </div>
  );
}
