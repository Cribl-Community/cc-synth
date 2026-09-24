import * as React from 'react';
import type { Skin } from '../types';
import { SKINS } from '../constants';

export function SkinDropdown({ skin, onChangeSkin }: { skin: Skin; onChangeSkin: (s: Skin) => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const idx = SKINS.findIndex(s => s.value === skin);
  const prev = SKINS[(idx - 1 + SKINS.length) % SKINS.length];
  const next = SKINS[(idx + 1) % SKINS.length];
  const current = SKINS[idx];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button className="octave-btn" onClick={() => onChangeSkin(prev.value)} data-tooltip="Previous theme">◀</button>
      <div className="skin-dropdown" ref={ref} style={{ position: 'relative' }}>
        <button className="skin-dropdown-btn" onClick={() => setOpen(o => !o)}>
          {current.label}<span className="skin-dropdown-arrow">▼</span>
        </button>
        {open && (
          <div className="skin-dropdown-menu">
            {SKINS.map(s => (
              <div
                key={s.value}
                className={`skin-dropdown-item${s.value === skin ? ' active' : ''}`}
                onMouseDown={() => { onChangeSkin(s.value); setOpen(false); }}
              >
                {s.label}
              </div>
            ))}
          </div>
        )}
      </div>
      <button className="octave-btn" onClick={() => onChangeSkin(next.value)} data-tooltip="Next theme">▶</button>
    </div>
  );
}
