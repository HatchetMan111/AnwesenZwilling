import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Globe, Lock, ImagePlus, Sparkles, RefreshCw,
  Download, Trash2, Save, Eye, Loader2, Info,
} from 'lucide-react';
import { api, toastSetzen } from '../api';

interface Bild { id: number; notiz: string; analyse: string | null; }
interface Projekt {
  id: number; name: string; lat: number | null; lon: number | null;
  privacy_lokal: number; spec: any; osm_roh: any; bilder: Bild[];
}
interface Einst { ollama_url: string; ollama_model: string; openrouter_aktiv: boolean; openrouter_model: string; }

export default function ProjektDetail() {
  const { id } = useParams();
  const pid = Number(id);
  const [p, setP] = useState<Projekt | null>(null);
  const [einst, setEinst] = useState<Einst | null>(null);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [specText, setSpecText] = useState('');
  const [hausBreite, setHausBreite] = useState('');
  const [provider, setProvider] = useState('ollama');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState<string>('');
  const [previewKey, setPreviewKey] = useState(0);
  const [specOffen, setSpecOffen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function laden() {
    try {
      const d = await api(`/projekte/${pid}`);
      setP(d.projekt);
      setLat(d.projekt.lat ?? '');
      setLon(d.projekt.lon ?? '');
      setSpecText(d.projekt.spec ? JSON.stringify(d.projekt.spec, null, 2) : '');
      const s = await api('/settings');
      setEinst(s);
    } catch (e: any) {
      toastSetzen(e.message, false);
    }
  }
  useEffect(() => { laden(); }, [pid]);

  async function gpsSpeichern() {
    setBusy('gps');
    try {
      await api(`/projekte/${pid}`, {
        method: 'PUT',
        body: JSON.stringify({ lat: parseFloat(lat), lon: parseFloat(lon) }),
      });
      toastSetzen('GPS gespeichert');
      await laden();
    } catch (e: any) { toastSetzen(e.message, false); } finally { setBusy(''); }
  }

  async function osmSync() {
    setBusy('osm');
    try {
      await api(`/projekte/${pid}/osm-sync`, { method: 'POST' });
      toastSetzen('OSM-Abgleich fertig — Spec aktualisiert');
      setPreviewKey((k) => k + 1);
      await laden();
    } catch (e: any) { toastSetzen(e.message, false); } finally { setBusy(''); }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy('upload');
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('files', f);
      await api(`/projekte/${pid}/bilder`, { method: 'POST', body: fd });
      toastSetzen(`${files.length} Bild(er) hochgeladen`);
      await laden();
    } catch (e: any) { toastSetzen(e.message, false); } finally { setBusy(''); }
  }

  async function analyse() {
    setBusy('analyse');
    try {
      await api(`/projekte/${pid}/analyse`, {
        method: 'POST',
        body: JSON.stringify({ provider, model }),
      });
      toastSetzen('Analyse fertig — Spec fusioniert');
      setPreviewKey((k) => k + 1);
      await laden();
    } catch (e: any) { toastSetzen(e.message, false); } finally { setBusy(''); }
  }

  async function specSpeichern() {
    setBusy('spec');
    try {
      const spec = JSON.parse(specText);
      await api(`/projekte/${pid}/spec`, { method: 'PUT', body: JSON.stringify({ spec }) });
      toastSetzen('Spec gespeichert');
      setPreviewKey((k) => k + 1);
      await laden();
    } catch (e: any) { toastSetzen(e.message, false); } finally { setBusy(''); }
  }

  async function refusion() {
    setBusy('fusion');
    try {
      await api(`/projekte/${pid}/refusion`, {
        method: 'POST',
        body: JSON.stringify({ haus_breite: hausBreite ? parseFloat(hausBreite) : null }),
      });
      toastSetzen('Neu fusioniert');
      setPreviewKey((k) => k + 1);
      await laden();
    } catch (e: any) { toastSetzen(e.message, false); } finally { setBusy(''); }
  }

  async function bildLoeschen(bid: number) {
    try {
      await api(`/bilder/${bid}`, { method: 'DELETE' });
      await laden();
    } catch (e: any) { toastSetzen(e.message, false); }
  }

  async function privacyUmschalten() {
    if (!p) return;
    await api(`/projekte/${pid}`, { method: 'PUT', body: JSON.stringify({ privacy_lokal: !p.privacy_lokal }) });
    await laden();
  }

  if (!p) return <div className="p-10 text-lv-blass">Lade …</div>;
  const fragment = p.bilder.find((b) => b.analyse)?.analyse;
  const privacy = !!p.privacy_lokal;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="btn-sekundaer !px-2.5"><ArrowLeft size={16} /></Link>
          <h1 className="text-xl font-semibold">{p.name}</h1>
          <button onClick={privacyUmschalten}
            className={`btn !px-2.5 !py-1.5 text-xs ${privacy ? 'bg-lv-limette/15 text-lv-limette border border-lv-limette/40' : 'border border-lv-kante text-lv-blass'}`}
            title="Nur lokale KI (OpenRouter gesperrt)">
            <Lock size={13} /> {privacy ? 'Nur lokal' : 'Cloud erlaubt'}
          </button>
        </div>
        <div className="flex gap-2">
          <button className="btn-sekundaer" onClick={() => setPreviewKey((k) => k + 1)}>
            <Eye size={16} /> Preview neu laden
          </button>
          <a className="btn-primaer" href={`/api/projekte/${pid}/export`} download>
            <Download size={16} /> Export (HTML)
          </a>
        </div>
      </header>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* GPS + OSM */}
        <section className="karte space-y-3">
          <h2 className="font-medium flex items-center gap-2"><MapPin size={16} className="text-lv-limette" /> GPS &amp; OSM-Abgleich</h2>
          <div className="flex gap-2">
            <input className="flex-1" placeholder="Breite (lat), z. B. 49.12345" value={lat} onChange={(e) => setLat(e.target.value)} />
            <input className="flex-1" placeholder="Länge (lon), z. B. 8.67890" value={lon} onChange={(e) => setLon(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button className="btn-sekundaer flex-1 justify-center" onClick={gpsSpeichern} disabled={busy === 'gps'}>
              {busy === 'gps' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} GPS speichern
            </button>
            <button className="btn-primaer flex-1 justify-center" onClick={osmSync} disabled={busy === 'osm' || !lat || !lon}>
              {busy === 'osm' ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />} OSM-Abgleich
            </button>
          </div>
          <p className="text-xs text-lv-blass flex gap-1.5">
            <Info size={13} className="shrink-0 mt-0.5" />
            Die Abfrage schickt die Koordinaten an die öffentliche Overpass-API und holt echte
            Gebäudeumrisse. Nur die Koordinaten gehen raus — nie etwas anderes.
          </p>
          {p.osm_roh && (
            <p className="text-xs text-lv-limette">
              OSM-Daten da: {p.osm_roh.gebaeude?.length ?? 0} Gebäude, {p.osm_roh.baeume?.length ?? 0} Bäume,
              {' '}{p.osm_roh.wege?.length ?? 0} Wege
            </p>
          )}
        </section>

        {/* Bilder */}
        <section className="karte space-y-3">
          <h2 className="font-medium flex items-center gap-2"><ImagePlus size={16} className="text-lv-limette" /> Bilder ({p.bilder.length})</h2>
          <div
            className="border-2 border-dashed border-lv-kante rounded-xl p-4 text-center text-sm text-lv-blass cursor-pointer hover:border-lv-limette/50"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}
          >
            {busy === 'upload' ? <Loader2 className="mx-auto animate-spin" size={20} /> : 'Hierher ziehen oder klicken (JPG/PNG/WebP)'}
          </div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
            onChange={(e) => upload(e.target.files)} />
          {!!p.bilder.length && (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {p.bilder.map((b) => (
                <div key={b.id} className="relative group aspect-square rounded-lg overflow-hidden border border-lv-kante">
                  <img src={`/api/bilder/${b.id}/datei`} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => bildLoeschen(b.id)}
                    className="absolute top-1 right-1 p-1 rounded bg-black/60 opacity-0 group-hover:opacity-100 transition">
                    <Trash2 size={13} className="text-red-300" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* KI-Analyse */}
        <section className="karte space-y-3">
          <h2 className="font-medium flex items-center gap-2"><Sparkles size={16} className="text-lv-limette" /> KI-Analyse</h2>
          <div className="flex gap-2">
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="flex-1">
              <option value="ollama">Ollama ({einst?.ollama_model || 'lokal'})</option>
              <option value="openrouter" disabled={!einst?.openrouter_aktiv || privacy}>
                OpenRouter {!einst?.openrouter_aktiv ? '(kein API-Key)' : privacy ? '(gesperrt: nur lokal)' : ''}
              </option>
            </select>
            <input className="flex-1" placeholder="Modell überschreiben (optional)" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <button className="btn-primaer w-full justify-center" onClick={analyse}
            disabled={busy === 'analyse' || !p.bilder.length || (provider === 'openrouter' && privacy)}>
            {busy === 'analyse' ? <><Loader2 size={16} className="animate-spin" /> Analysiere … (kann bei Ollama dauern)</> : <><Sparkles size={16} /> Analysieren &amp; fusionieren</>}
          </button>
          {fragment && (
            <div className="text-xs text-lv-blass space-y-1 border-t border-lv-kante pt-2">
              <p className="text-lv-text">Letztes Fragment: {JSON.parse(fragment).beschreibung || '—'}</p>
              {!!JSON.parse(fragment).vegetation_hinweis?.length && (
                <p>Vegetation: {JSON.parse(fragment).vegetation_hinweis.join(' · ')}</p>
              )}
              {JSON.parse(fragment).sonstiges && <p>Sonstiges: {JSON.parse(fragment).sonstiges}</p>}
            </div>
          )}
        </section>

        {/* Spec */}
        <section className="karte space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Szenen-Spec</h2>
            <button className="text-xs text-lv-blass underline" onClick={() => setSpecOffen(!specOffen)}>
              {specOffen ? 'zuklappen' : 'aufklappen / bearbeiten'}
            </button>
          </div>
          <div className="flex gap-2">
            <input className="w-40" placeholder="Hausbreite m (opt.)" value={hausBreite} onChange={(e) => setHausBreite(e.target.value)} />
            <button className="btn-sekundaer flex-1 justify-center" onClick={refusion} disabled={busy === 'fusion'}>
              <RefreshCw size={15} /> Neu fusionieren
            </button>
          </div>
          {specOffen && (
            <>
              <textarea className="w-full h-72 font-mono text-xs" value={specText} onChange={(e) => setSpecText(e.target.value)} />
              <button className="btn-primaer w-full justify-center" onClick={specSpeichern} disabled={busy === 'spec'}>
                <Save size={16} /> Spec speichern
              </button>
            </>
          )}
          {!specOffen && p.spec && (
            <p className="text-xs text-lv-blass">
              {p.spec.gebaeude?.length ?? 0} Gebäude · {p.spec.vegetation?.length ?? 0} Bäume ·{' '}
              {p.spec.wege?.length ?? 0} Wege · Quelle: {p.spec.meta?.quellen?.join(', ') || '—'}
            </p>
          )}
          {!specOffen && !p.spec && <p className="text-xs text-lv-blass">Noch keine Spec — OSM-Abgleich oder Analyse starten.</p>}
        </section>
      </div>

      {/* Preview */}
      <section className="karte !p-3">
        <iframe
          key={previewKey}
          src={`/api/projekte/${pid}/preview`}
          className="w-full h-[70vh] rounded-xl border-0 bg-lv-bg"
          title="3D-Preview"
        />
      </section>
    </div>
  );
}
