import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { House, MapPin, ImagePlus, Sparkles, Plus, Play, Trash2, Lock, Loader2 } from 'lucide-react';
import AppShell from '../components/AppShell';
import { api, toastSetzen } from '../api';
import { DEMO_SPEC } from '../types';
import type { ProjektKurz } from '../types';

function FortschrittChips({ p }: { p: ProjektKurz }) {
  const chips = [
    { icon: MapPin, label: 'Standort', ok: p.lat != null && p.lon != null },
    { icon: ImagePlus, label: `${p.bild_anzahl} Bild${p.bild_anzahl === 1 ? '' : 'er'}`, ok: p.bild_anzahl > 0 },
    { icon: Sparkles, label: 'Analyse', ok: p.hat_spec === 1 },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c.label}
          className={`text-[11px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${
            c.ok ? 'border-lv-limette/50 text-lv-limette' : 'border-lv-kante text-lv-blass'
          }`}>
          <c.icon size={11} /> {c.label}
        </span>
      ))}
    </div>
  );
}

export default function Projekte() {
  const [projekte, setProjekte] = useState<ProjektKurz[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
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
      nav(`/projekt/${d.id}?schritt=1`);
    } catch (e: any) {
      toastSetzen(e.message, false);
    } finally {
      setBusy(false);
    }
  }

  async function demo() {
    setDemoBusy(true);
    try {
      const d = await api('/projekte', { method: 'POST', body: JSON.stringify({ name: 'Demo-Anwesen' }) });
      await api(`/projekte/${d.id}/spec`, { method: 'PUT', body: JSON.stringify({ spec: DEMO_SPEC }) });
      nav(`/projekt/${d.id}?schritt=5`);
    } catch (e: any) {
      toastSetzen(e.message, false);
    } finally {
      setDemoBusy(false);
    }
  }

  async function loeschen(p: ProjektKurz, e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`„${p.name}“ samt Bildern wirklich löschen?`)) return;
    try {
      await api(`/projekte/${p.id}`, { method: 'DELETE' });
      toastSetzen('Projekt gelöscht');
      await laden();
    } catch (err: any) {
      toastSetzen(err.message, false);
    }
  }

  return (
    <AppShell>
      {/* Hero — erklärt den 3-Schritt-Weg */}
      <section className="karte mb-6 overflow-hidden relative">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
            Dein Anwesen als <span className="text-lv-limette">3D-Zwilling</span>
          </h1>
          <p className="text-lv-blass mt-2 text-sm sm:text-base">
            Standort eintragen, ein Foto vom Haus hochladen — der Rest passiert von allein.
            Am Ende bekommst du eine begehbare 3D-Szene als eine einzelne HTML-Datei.
          </p>
          <ol className="mt-4 grid sm:grid-cols-3 gap-3">
            {[
              { icon: MapPin, t: 'Standort', d: 'GPS-Koordinaten eintragen — echte Gebäudeumrisse kommen automatisch' },
              { icon: ImagePlus, t: 'Foto', d: 'Ein Bild vom Haus genügt — Dach, Farben, Details werden erkannt' },
              { icon: Sparkles, t: 'Zwilling', d: 'Ansehen, anpassen und als HTML-Datei herunterladen' },
            ].map((s, i) => (
              <li key={s.t} className="bg-lv-bg/60 border border-lv-kante rounded-xl p-3">
                <div className="flex items-center gap-2 text-lv-limette text-sm font-medium">
                  <s.icon size={15} /> {i + 1}. {s.t}
                </div>
                <p className="text-xs text-lv-blass mt-1 leading-snug">{s.d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <div className="flex flex-1 min-w-[240px] gap-2">
              <input
                className="flex-1"
                placeholder="Name, z. B. „Haus am Hang“"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && anlegen()}
              />
              <button className="btn-primaer" onClick={anlegen} disabled={busy || !name.trim()}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Loslegen
              </button>
            </div>
            <button className="btn-sekundaer" onClick={demo} disabled={demoBusy} title="Erzeugt ein Demo-Projekt mit fertiger Szene">
              <Play size={15} /> Demo ansehen
            </button>
          </div>
        </div>
        <House className="absolute -right-6 -bottom-8 text-lv-limette/10" size={220} strokeWidth={1} />
      </section>

      {/* Projektliste */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projekte.map((p) => (
          <div key={p.id}
            className="karte hover:border-lv-limette/50 transition space-y-2.5 cursor-pointer group relative"
            onClick={() => nav(`/projekt/${p.id}`)}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-medium leading-snug">{p.name}</h2>
              <div className="flex items-center gap-1.5 shrink-0">
                {p.privacy_lokal ? <Lock size={13} className="text-lv-limette" aria-label="Nur lokale KI" /> : null}
                <button onClick={(e) => loeschen(p, e)} title="Projekt löschen"
                  className="p-1 rounded text-lv-blass hover:text-red-300 opacity-0 group-hover:opacity-100 transition">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <FortschrittChips p={p} />
            <p className="text-[11px] text-lv-blass">
              Zuletzt bearbeitet: {new Date(p.updated_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          </div>
        ))}
        {!projekte.length && (
          <p className="text-lv-blass text-sm col-span-full text-center py-10">
            Noch keine Projekte — trag oben einen Namen ein oder schau dir die Demo an.
          </p>
        )}
      </div>
    </AppShell>
  );
}
