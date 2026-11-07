// Dünner Fetch-Wrapper: 401 → Login, deutsche Fehlermeldungen als Toast-Text.
export async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const resp = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: opts.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (resp.status === 401) {
    if (!location.pathname.startsWith('/login')) location.href = '/login';
    throw new Error('Nicht angemeldet');
  }
  const daten = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(daten.detail || `Fehler ${resp.status}`);
  return daten;
}

export function toastSetzen(msg: string, ok = true): void {
  window.dispatchEvent(new CustomEvent('lv-toast', { detail: { msg, ok } }));
}
