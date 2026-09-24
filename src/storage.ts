declare global {
  interface Window {
    CRIBL_API_URL?: string;
    CRIBL_APP_ID?: string;
  }
}

export const isDeployed = (): boolean => !!window.CRIBL_API_URL;

export const isLivePreview = (): boolean =>
  typeof window.CRIBL_APP_ID === 'string' && window.CRIBL_APP_ID.startsWith('__dev__');

export const KV_BASE = (): string => window.CRIBL_API_URL! + '/kvstore';

export const storageGet = async <T,>(key: string): Promise<T | null> => {
  if (!isDeployed()) return null;
  try {
    const res = await fetch(`${KV_BASE()}/${key}`);
    if (!res.ok) return null;
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  } catch { return null; }
};

export const storageSet = (key: string, value: unknown): void => {
  if (!isDeployed()) return;
  const body = JSON.stringify(value);
  const headers = { 'Content-Type': 'text/plain' };
  fetch(`${KV_BASE()}/${key}`, { method: 'PUT', headers, body })
    .then(res => {
      if (res.status === 404) {
        return fetch(`${KV_BASE()}/${key}`, { method: 'POST', headers, body });
      }
    })
    .catch(() => {});
};
