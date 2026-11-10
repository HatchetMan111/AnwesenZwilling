import { useEffect, useState } from 'react';
import { Cpu, Globe, KeyRound, Loader2, Save, Trash2, Zap } from 'lucide-react';
import AppShell from '../components/AppShell';
import { api, toastSetzen } from '../api';
import type { Einst } from '../types';

export default function Einstellungen() {
  const [einst, setEinst] = useState<Einst | null>(null);
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [ollamaModel, setOllamaModel] = useState('');
  const [ollamaModelle, setOllamaModelle] = useState<string[]>([]);
  const [orKeyNeu, setOrKeyNeu] = useState('');
  const [orModel, setOrModel] = useState('');
  const [busy, setBusy] = useState('');
  const [ollamaStatus, setOllamaStatus] = useState<{ erreichbar: boolean; fehler?: string; modelle?: string[] } | null>(null);
  const [orStatus, setOrStatus] = useState<{ gueltig: boolean; fehler?: string; nutzung?: number; limit?: number | null } | null>(null);

  async function laden() {
    try {
      const d: Einst = await api('/settings');
      setEinst(d);
      setOllamaUrl(d.ollama_url);
      setOllamaModel(d.ollama_model);
      setOrModel(d.openrouter_model);
    } catch (e: any) {
      toastSetzen(e.message, false);
    }
  }
  useEffect(() => { laden(); }, []);

  async function ollamaSpeichern() {
    setBusy('ollama');
    try {
      const d = await api('/settings', { method: 'PUT', body: JSON.stringify({ ollama_url: ollamaUrl, ollama_model: ollamaModel }) });
      setEinst(d);
      toastSetzen('Ollama-Einstellungen gespeichert');
    } catch (e: any) { toastSetzen(e.message, false); } finally { setBusy(''); }
  }

  async function ollamaTesten() {
    setBusy('ollama-test');
    setOllamaStatus(null);
    try {
      // Erst speichern, dann testen — sonst testet man die alte URL
      await api('/settings', { method: 'PUT', body: JSON.stringify({ ollama_url: ollamaUrl, ollama_model: ollamaModel }) });
      const d = await api('/settings/test-ollama', { method: 'POST' });
      setOllamaStatus({ erreichbar: d.erreichbar, fehler: d.fehler, modelle: d.modelle });
      if (d.erreichbar) {
        setOllamaModelle(d.modelle || []);
        toastSetzen(`Ollama erreichbar — ${d.modelle?.length ?? 0} Modelle`);
      } else {
        toastSetzen(d.fehler || 'Ollama nicht erreichbar', false);
      }
    } catch (e: any) { toastSetzen(e.message, false); } finally { setBusy(''); }
  }

  async function orSpeichern() {
    setBusy('or');
    try {
      const body: any = { openrouter_model: orModel };
      if (orKeyNeu.trim()) body.openrouter_key = orKeyNeu.trim();
      const d = await api('/settings', { method: 'PUT', body: JSON.stringify(body) });
      setEinst(d);
      setOrKeyNeu('');
      toastSetzen('OpenRouter-Einstellungen gespeichert');
    } catch (e: any) { toastSetzen(e.message, false); } finally { setBusy(''); }
  }

  async function orLoeschen() {
    setBusy('or-del');
    try {
      const d = await api('/settings', { method: 'PUT', body: JSON.stringify({ openrouter_key: '' }) });
      setEinst(d);
      setOrKeyNeu('');
      setOrStatus(null);
      toastSetzen('API-Key gelöscht');
    } catch (e: any) { toastSetzen(e.message, false); } finally { setBusy(''); }
  }

  async function orTesten() {
    setBusy('or-test');
    setOrStatus(null);
    try {
      if (orKeyNeu.trim()) await orSpeichern();
      const d = await api('/settings/test-openrouter', { method: 'POST' });
      setOrStatus(d);
      toastSetzen(d.gueltig ? 'API-Key gültig ✓' : d.fehler || 'Key ungültig', d.gueltig);
    } catch (e: any) { toastSetzen(e.message, false); } finally { setBusy(''); }
  }

  if (!einst) return <AppShell><p className="text-lv-blass">Lade …</p></AppShell>;

  return (
    <AppShell>
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Einstellungen</h1>
        <p className="text-xs text-lv-blass">KI-Provider konfigurieren — gespeichert in der lokalen Datenbank</p>
      </div>

      {/* Ollama */}
      <section className="karte space-y-3">
        <h2 className="font-medium flex items-center gap-2">
          <Cpu size={16} className="text-lv-limette" /> Ollama <span className="text-xs text-lv-blass font-normal">(lokal — Bilder verlassen das Haus nie)</span>
        </h2>
        <label className="text-xs text-lv-blass block">Server-URL</label>
        <input className="w-full font-mono" placeholder="http://192.168.1.50:11434"
          value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} />
        <label className="text-xs text-lv-blass block">Vision-Modell</label>
        <input className="w-full" list="ollama-modelle" placeholder="z. B. qwen2.5-vl:7b"
          value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} />
        <datalist id="ollama-modelle">
          {ollamaModelle.map((m) => <option key={m} value={m} />)}
        </datalist>
        <div className="flex gap-2">
          <button className="btn-primaer flex-1 justify-center" onClick={ollamaSpeichern} disabled={!!busy}>
            <Save size={15} /> Speichern
          </button>
          <button className="btn-sekundaer flex-1 justify-center" onClick={ollamaTesten} disabled={!!busy || !ollamaUrl.trim()}>
            {busy === 'ollama-test' ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />} Verbindung testen
          </button>
        </div>
        {ollamaStatus && (
          <p className={`text-xs ${ollamaStatus.erreichbar ? 'text-lv-limette' : 'text-red-400'}`}>
            {ollamaStatus.erreichbar
              ? `✓ Erreichbar — Modelle: ${ollamaStatus.modelle?.join(', ') || '(keine installiert)'}`
              : `✗ ${ollamaStatus.fehler}`}
          </p>
        )}
        <p className="text-xs text-lv-blass flex gap-1.5">
          <Globe size={13} className="shrink-0 mt-0.5" />
          Für GPU-Speed empfiehlt sich eine Ollama-VM mit GPU-Passthrough auf deinem Proxmox.
          Vision-Modelle: <code>qwen2.5-vl:7b</code>, <code>gemma3:12b</code>, <code>llama3.2-vision</code>.
        </p>
      </section>

      {/* OpenRouter */}
      <section className="karte space-y-3">
        <h2 className="font-medium flex items-center gap-2">
          <KeyRound size={16} className="text-lv-limette" /> OpenRouter <span className="text-xs text-lv-blass font-normal">(Cloud — Bildinhalte gehen zum Modell-Anbieter)</span>
        </h2>
        <p className="text-xs text-lv-blass">
          Status: {einst.openrouter_aktiv
            ? <span className="text-lv-limette">Key gespeichert ({einst.openrouter_key_maskiert})</span>
            : 'kein Key hinterlegt'}
        </p>
        <label className="text-xs text-lv-blass block">
          API-Key {einst.openrouter_aktiv && '(leer lassen = unverändert)'} — von{' '}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="underline text-lv-limette">openrouter.ai/keys</a>
        </label>
        <input type="password" className="w-full font-mono" placeholder="sk-or-v1-…"
          value={orKeyNeu} onChange={(e) => setOrKeyNeu(e.target.value)} />
        <label className="text-xs text-lv-blass block">Standard-Modell</label>
        <input className="w-full font-mono" placeholder="z. B. google/gemini-2.0-flash-001"
          value={orModel} onChange={(e) => setOrModel(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn-primaer flex-1 justify-center" onClick={orSpeichern} disabled={!!busy}>
            <Save size={15} /> Speichern
          </button>
          <button className="btn-sekundaer flex-1 justify-center" onClick={orTesten} disabled={!!busy || (!einst.openrouter_aktiv && !orKeyNeu.trim())}>
            {busy === 'or-test' ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />} Key testen
          </button>
          {einst.openrouter_aktiv && (
            <button className="btn-gefahr" onClick={orLoeschen} disabled={!!busy} title="Key entfernen">
              <Trash2 size={15} />
            </button>
          )}
        </div>
        {orStatus && (
          <p className={`text-xs ${orStatus.gueltig ? 'text-lv-limette' : 'text-red-400'}`}>
            {orStatus.gueltig
              ? `✓ Key gültig — Verbrauch: $${orStatus.nutzung ?? 0}${orStatus.limit ? ` von $${orStatus.limit}` : ' (kein Limit)'}`
              : `✗ ${orStatus.fehler}`}
          </p>
        )}
      </section>

      <p className="text-xs text-lv-blass text-center">
        Hinweis: Die Werte liegen in der lokalen SQLite-DB und schlagen die Env-Variablen
        (<code>OLLAMA_URL</code>, <code>OPENROUTER_API_KEY</code> …) — Env bleibt als Fallback.
      </p>
    </div>
    </AppShell>
  );
}
