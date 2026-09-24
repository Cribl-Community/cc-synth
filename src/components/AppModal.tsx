import * as React from 'react';
import { useEffect, useRef } from 'react';
import type { ModalState } from '../types';

export function AppModal({ modal, dismiss }: { modal: ModalState; dismiss: () => void }) {
  const [inputValue, setInputValue] = React.useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (modal?.type === 'prompt') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInputValue(modal.defaultValue);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [modal]);

  if (!modal) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') confirm();
    if (e.key === 'Escape') cancel();
  };

  const confirm = () => {
    if (modal.type === 'prompt') modal.resolve(inputValue || null);
    else modal.resolve(true);
    dismiss();
  };

  const cancel = () => {
    if (modal.type === 'prompt') modal.resolve(null);
    else modal.resolve(false);
    dismiss();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="modal-box" onKeyDown={handleKeyDown}>
        <p className="modal-message">{modal.message}</p>
        {modal.type === 'prompt' && (
          <input
            ref={inputRef}
            className="modal-input"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            autoFocus
          />
        )}
        <div className="modal-buttons">
          <button className="modal-btn modal-btn-cancel" onClick={cancel}>Cancel</button>
          <button className="modal-btn modal-btn-ok" onClick={confirm}>OK</button>
        </div>
      </div>
    </div>
  );
}
