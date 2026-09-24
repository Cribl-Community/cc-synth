import * as React from 'react';
import type { Preset } from '../types';

export function PresetDropdown({ activePreset, presets, onAction }: {
  activePreset: string;
  presets: Preset[];
  onAction: (val: string) => void;
}) {
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

  const presetList = presets.filter(p => p.name !== 'init').sort((a, b) => a.name.localeCompare(b.name));
  const canDelete = !!activePreset && activePreset !== 'init';

  type Item =
    | { type: 'action'; value: string; label: string; disabled?: boolean }
    | { type: 'separator' }
    | { type: 'preset'; name: string };

  const items: Item[] = [
    { type: 'action', value: '__save__', label: 'Save preset' },
    { type: 'action', value: '__saveas__', label: 'Save preset as…' },
    { type: 'action', value: '__delete__', label: 'Delete preset', disabled: !canDelete },
    { type: 'action', value: 'init', label: 'Initialize' },
    { type: 'separator' },
    ...presetList.map(p => ({ type: 'preset' as const, name: p.name })),
  ];

  return (
    <div className="skin-dropdown preset-dropdown" ref={ref}>
      <button className="skin-dropdown-btn preset-dropdown-btn" onClick={() => setOpen(o => !o)}>
        <span className="preset-dropdown-label">{activePreset || 'PRESETS'}</span>
        <span className="skin-dropdown-arrow">▼</span>
      </button>
      {open && (
        <div className="skin-dropdown-menu preset-dropdown-menu">
          {items.map((item, i) => {
            if (item.type === 'separator') {
              return <div key={`sep-${i}`} className="preset-dropdown-sep" />;
            }
            if (item.type === 'action') {
              return (
                <div
                  key={item.value}
                  className={`skin-dropdown-item preset-dropdown-action${item.disabled ? ' disabled' : ''}`}
                  onMouseDown={() => { if (!item.disabled) { onAction(item.value); setOpen(false); } }}
                >
                  {item.label}
                </div>
              );
            }
            return (
              <div
                key={item.name}
                className={`skin-dropdown-item${item.name === activePreset ? ' active' : ''}`}
                onMouseDown={() => { onAction(item.name); setOpen(false); }}
              >
                {item.name}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
