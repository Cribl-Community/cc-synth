import * as React from 'react';
import type { ModalState } from '../types';

export function useModal() {
  const [modal, setModal] = React.useState<ModalState>(null);

  const showPrompt = (message: string, defaultValue = ''): Promise<string | null> =>
    new Promise(resolve => setModal({ type: 'prompt', message, defaultValue, resolve }));

  const showConfirm = (message: string): Promise<boolean> =>
    new Promise(resolve => setModal({ type: 'confirm', message, resolve }));

  const dismiss = () => setModal(null);

  return { modal, setModal, showPrompt, showConfirm, dismiss };
}
