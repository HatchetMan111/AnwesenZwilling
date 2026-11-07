import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { House, Plus, Lock, MapPin, LogOut, Settings } from 'lucide-react';
import { api, toastSetzen } from '../api';

interface Projekt {
  id: number;
  name: string;
  lat: number | null;
  lon: number | null;
  privacy_lokal: number;
  bild_anzahl: number;
  hat_spec: number;
  updated_at: string;
}

export default function Projekte() {
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function laden() {
    try {
      const d = await api('/projekte');
      setProjekte(d.projekte);
    } catch (e: any) {
      toastSetzen(e.message, false);
    }
  }
  useEffect(() => { laden(); }, []);

  async function anlegen() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const d = await api('/projekte', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      setName('');
      nav(`/projekt/${d.id}`);
    } catch (e: any) {
      toastSetzen(e.message, false);
    } finally {
      setBusy(false);
    }
  }

  async function abmelden() {
    await api('/logout', { method: 'POST' });
    location.href = '/login';
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-lv-karte grid place-items-center border border-lv-kante">
            <House className="text-lv-limette" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">AnwesenTwin</h1>
            <p className="text-xs text-lv-blass">GPS + Bilder → interaktiver 3D-Zwilling</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/einstellungen" className="btn-sekundaer" title="Einstellungen (KI-Provider)">
            <Settings size={16} /> Einstellungen
          </Link>
          <button onClick={abmelden} className="btn-sekundaer" title="Abmelden">
            <LogOut size={16} /> Abmelden
          </button>
        </div>
      </header>

      <div className="karte flex gap-2">
        <input
          className="flex-1"
          placeholder="Name des Projekts, z. B. „Haus am Hang“"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && anlegen()}
        />
        <button className="btn-primaer" onClick={anlegen} disabled={busy || !name.trim()}>
          <Plus size={16} /> Projekt anlegen
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projekte.map((p) => (
          <Link
            key={p.id}
            to={`/projekt/${p.id}`}
            className="karte hover:border-lv-limette/50 transition space-y-2"
          >
            <div className="flex items-start justify-between">
              <h2 className="font-medium">{p.name}</h2>
              {p.privacy_lokal ? <Lock size={14} className="text-lv-limette" aria-label="Nur lokale KI" /> : null}
            </div>
            <p className="text-xs text-lv-blass flex items-center gap-1">
              <MapPin size={12} />
              {p.lat != null && p.lon != null ? `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` : 'Kein GPS gesetzt'}
            </p>
            <p className="text-xs text-lv-blass">
              {p.bild_anzahl} Bilder · {p.hat_spec ? 'Spec vorhanden' : 'keine Spec'} ·{' '}
              {new Date(p.updated_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          </Link>
        ))}
        {!projekte.length && (
          <p className="text-lv-blass text-sm col-span-full text-center py-10">
            Noch keine Projekte — leg oben eins an.
          </p>
        )}
      </div>
    </div>
  );
}
