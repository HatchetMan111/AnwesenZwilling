import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Globe, ImagePlus, Sparkles, RefreshCw, Download, Trash2,
  Save, Eye, Loader2, Info, Pencil, Check, Cloud, Lock, Maximize2, AlertTriangle,
  X, SlidersHorizontal,
} from 'lucide-react';
import AppShell from '../components/AppShell';
import StepRail from '../components/StepRail';
import type { SchrittInfo } from '../components/StepRail';
import GebaeudeEditor from '../components/GebaeudeEditor';
import VegetationEditor from '../components/VegetationEditor';
import { api, toastSetzen } from '../api';
import type { Einst, Projekt, SceneSpec } from '../types';

const TAGESZEITEN: { id: string; label: string }[] = [
  { id: 'morning', label: 'Morgen' },
  { id: 'golden', label: 'Goldene Stunde' },
  { id: 'dusk', label: 'Dämmerung' },
  { id: 'night', label: 'Nacht' },
];

/** Einfaches Bestätigungsdialog-Ersatz: klare deutsche Frage, OK = weiter. */
function zustimmen(frage: string): boolean {
  return window.confirm(frage);
}

export default function ProjektDetail() {
  const { id } = useParams();
  const pid = Number(id);
  const nav = useNavigate();
  const [params] = useSearchParams();

  const [p, setP] = useState<Projekt | null>(null);
  const [einst, setEinst] = useState<Einst | null>(null);
  const [schritt, setSchritt] = useState(Number(params.get('schritt') || 1));

  // Schritt 1 — Standort
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [adresse, setAdresse] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);
  const [osmAn, setOsmAn] = useState(true);
  const [luftbildAn, setLuftbildAn] = useState(true);

  // Schritt 2 — Bilder
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  // Schritt 3 — Analyse
  const [provider, setProvider] = useState<'ollama' | 'openrouter'>('ollama');
  const [model, setModel] = useState('');
  const [analyseBusy, setAnalyseBusy] = useState(false);

  // Schritt 4 — Anpassen
  const [spec, setSpec] = useState<SceneSpec | null>(null);
  const [geaendert, setGeaendert] = useState(false);
  const [specBusy, setSpecBusy] = useState(false);
  const [experten, setExperten] = useState(false);
  const [expText, setExpText] = useState('');

  // Schritt 5 — Ergebnis
  const [licht, setLicht] = useState('morning');
  const [previewKey, setPreviewKey] = useState(0);

  async function laden() {
    try {
      const d = await api(`/projekte/${pid}`);
      const projekt: Projekt = d.projekt;
      setP(projekt);
      setLat(projekt.lat != null ? String(projekt.lat) : '');
      setLon(projekt.lon != null ? String(projekt.lon) : '');
      setSpec(projekt.spec ? structuredClone(projekt.spec) : null);
      setGeaendert(false);
      setExpText(projekt.spec ? JSON.stringify(projekt.spec, null, 2) : '');
      const s: Einst = await api('/settings');
      setEinst(s);
    } catch (e: any) {
      toastSetzen(e.message, false);
    }
  }
  useEffect(() => { laden(); }, [pid]);

  const fragment = useMemo(() => {
    const roh = p?.bilder.find((b) => b.analyse)?.analyse;
    if (!roh) return null;
    try { return JSON.parse(roh); } catch { return null; }
  }, [p]);

  const schritte: SchrittInfo[] = [
    { nr: 1, titel: 'Standort', icon: MapPin, fertig: p?.lat != null && p?.lon != null },
    { nr: 2, titel: 'Bilder', icon: ImagePlus, fertig: !!p?.bilder.length },
    { nr: 3, titel: 'Analyse', icon: Sparkles, fertig: !!p?.bilder.some((b) => b.analyse) },
    { nr: 4, titel: 'Anpassen', icon: SlidersHorizontal, fertig: !!p?.spec },
    { nr: 5, titel: 'Ergebnis', icon: Eye, fertig: false },
  ];

  // ---- Schritt 1: Standort --------------------------------------------------
  const latZahl = parseFloat(lat);
  const lonZahl = parseFloat(lon);
  const gpsOk = lat !== '' && lon !== '' && Number.isFinite(latZahl) && Number.isFinite(lonZahl)
    && latZahl >= -90 && latZahl <= 90 && lonZahl >= -180 && lonZahl <= 180;

  async function speicherGps(undWeiter = false) {
    if (!gpsOk) return;
    setGeoBusy(true);
    try {
      await api(`/projekte/${pid}`, { method: 'PUT', body: JSON.stringify({ lat: latZahl, lon: lonZahl }) });
      let teile = ['Standort'];
      if (osmAn) {
        if (p?.spec && !zustimmen('Die OSM-Gebäudeumrisse ersetzen die aktuelle Szene (manuelle Anpassungen gehen verloren). Weiter?')) {
          setGeoBusy(false);
          return;
        }
        await api(`/projekte/${pid}/osm-sync`, { method: 'POST' });
        teile.push('Gebäudeumrisse');
      }
      if (luftbildAn) {
        try {
          await api(`/projekte/${pid}/luftbild`, { method: 'POST' });
          teile.push('Luftbild');
        } catch (lb: any) {
          toastSetzen(`Luftbild fehlgeschlagen: ${lb.message}`, false);
        }
      }
      toastSetzen(`${teile.join(', ')} geladen`);
      await laden();
      setPreviewKey((k) => k + 1);
      if (undWeiter) setSchritt(2);
    } catch (e: any) {
      toastSetzen(e.message, false);
    } finally {
      setGeoBusy(false);
    }
  }

  async function adressSuche() {
    if (!adresse.trim()) return;
    setGeoBusy(true);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=de&q=${encodeURIComponent(adresse.trim())}`,
      );
      const daten = await r.json();
      if (!daten?.length) { toastSetzen('Adresse nicht gefunden — trag die Koordinaten bitte direkt ein', false); return; }
      setLat(Number(daten[0].lat).toFixed(6));
      setLon(Number(daten[0].lon).toFixed(6));
      toastSetzen(`Gefunden: ${daten[0].display_name?.slice(0, 80)}`);
    } catch (e: any) {
      toastSetzen(`Adresssuche fehlgeschlagen: ${e.message}`, false);
    } finally {
      setGeoBusy(false);
    }
  }

  // ---- Schritt 2: Bilder ----------------------------------------------------
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploadBusy(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('files', f);
      await api(`/projekte/${pid}/bilder`, { method: 'POST', body: fd });
      toastSetzen(`${files.length} Bild(er) hochgeladen`);
      await laden();
    } catch (e: any) {
      toastSetzen(e.message, false);
    } finally {
      setUploadBusy(false);
    }
  }

  async function bildLoeschen(bid: number) {
    if (!zustimmen('Dieses Bild entfernen?')) return;
    try {
      await api(`/bilder/${bid}`, { method: 'DELETE' });
      await laden();
    } catch (e: any) {
      toastSetzen(e.message, false);
    }
  }

  // ---- Schritt 3: Analyse ---------------------------------------------------
  async function analyse() {
    setAnalyseBusy(true);
    try {
      await api(`/projekte/${pid}/analyse`, { method: 'POST', body: JSON.stringify({ provider, model }) });
      toastSetzen('Analyse fertig — die Szene wurde daraus gebaut');
      await laden();
      setPreviewKey((k) => k + 1);
    } catch (e: any) {
      toastSetzen(e.message, false);
    } finally {
      setAnalyseBusy(false);
    }
  }

  // ---- Schritt 4: Anpassen --------------------------------------------------
  function aendereSpec(patch: Partial<SceneSpec>) {
    if (!spec) return;
    setSpec({ ...spec, ...patch });
    setGeaendert(true);
  }

  async function speichereSpec() {
    if (!spec) return;
    setSpecBusy(true);
    try {
      await api(`/projekte/${pid}/spec`, { method: 'PUT', body: JSON.stringify({ spec }) });
      toastSetzen('Änderungen gespeichert');
      setGeaendert(false);
      setPreviewKey((k) => k + 1);
      await laden();
    } catch (e: any) {
      toastSetzen(e.message, false);
    } finally {
      setSpecBusy(false);
    }
  }

  async function zurueckZuAnalyse() {
    if (!zustimmen('Deine manuellen Anpassungen werden durch das Analyse/OSM-Ergebnis ersetzt. Weiter?')) return;
    setSpecBusy(true);
    try {
      await api(`/projekte/${pid}/refusion`, { method: 'POST', body: JSON.stringify({ haus_breite: null }) });
      toastSetzen('Auf Analyse-Ergebnis zurückgesetzt');
      setPreviewKey((k) => k + 1);
      await laden();
    } catch (e: any) {
      toastSetzen(e.message, false);
    } finally {
      setSpecBusy(false);
    }
  }

  // ---- Projekt-Kopf: umbenennen / löschen ------------------------------------
  const [nameEdit, setNameEdit] = useState(false);
  const [nameEntwurf, setNameEntwurf] = useState('');

  async function speichereName() {
    if (!nameEntwurf.trim()) { setNameEdit(false); return; }
    try {
      await api(`/projekte/${pid}`, { method: 'PUT', body: JSON.stringify({ name: nameEntwurf.trim() }) });
      await laden();
      toastSetzen('Name geändert');
    } catch (e: any) {
      toastSetzen(e.message, false);
    }
    setNameEdit(false);
  }

  async function projektLoeschen() {
    if (!p) return;
    if (!zustimmen(`„${p.name}“ samt aller Bilder wirklich löschen?`)) return;
    try {
      await api(`/projekte/${pid}`, { method: 'DELETE' });
      nav('/');
    } catch (e: any) {
      toastSetzen(e.message, false);
    }
  }

  if (!p) return <AppShell><p className="text-lv-blass">Lade …</p></AppShell>;

  const privacy = !!p.privacy_lokal;
  const openrouterGesperrt = !einst?.openrouter_aktiv || privacy;

  return (
    <AppShell>
      {/* Kopfzeile */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link to="/" className="btn-sekundaer !px-2.5" title="Zur Übersicht"><ArrowLeft size={16} /></Link>
        {nameEdit ? (
          <span className="flex items-center gap-1.5">
            <input className="w-56" value={nameEntwurf} autoFocus
              onChange={(e) => setNameEntwurf(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && speichereName()} />
            <button className="btn-primaer !p-2" onClick={speichereName} title="Name speichern"><Check size={15} /></button>
            <button className="btn-sekundaer !p-2" onClick={() => setNameEdit(false)} title="Abbrechen"><X size={15} /></button>
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <h1 className="text-xl font-semibold">{p.name}</h1>
            <button className="p-1.5 rounded text-lv-blass hover:text-lv-text"
              onClick={() => { setNameEntwurf(p.name); setNameEdit(true); }} title="Umbenennen">
              <Pencil size={14} />
            </button>
          </span>
        )}
        <button onClick={async () => {
          await api(`/projekte/${pid}`, { method: 'PUT', body: JSON.stringify({ privacy_lokal: !privacy }) });
          await laden();
        }}
          className={`btn !px-2.5 !py-1.5 text-xs ${privacy ? 'bg-lv-limette/15 text-lv-limette border border-lv-limette/40' : 'border border-lv-kante text-lv-blass'}`}
          title="Wenn aktiv: Bilder werden nur an lokale KI (Ollama) geschickt, nie in die Cloud">
          {privacy ? <Lock size={13} /> : <Cloud size={13} />} {privacy ? 'Nur lokal' : 'Cloud erlaubt'}
        </button>
        <div className="ml-auto flex gap-2">
          <a className="btn-primaer" href={`/api/projekte/${pid}/export`} download title="Lädt die Szene als eigenständige HTML-Datei herunter">
            <Download size={16} /> HTML herunterladen
          </a>
          <button className="btn-gefahr !px-2.5" onClick={projektLoeschen} title="Projekt löschen"><Trash2 size={15} /></button>
        </div>
      </div>

      <StepRail schritte={schritte} aktiv={schritt} onSpringen={setSchritt} />

      {/* ================= Schritt 1: Standort ================= */}
      {schritt === 1 && (
        <section className="karte space-y-4 max-w-2xl">
          <div>
            <h2 className="font-medium text-lg">Wo steht dein Anwesen?</h2>
            <p className="text-sm text-lv-blass mt-1">
              Trag die GPS-Koordinaten ein — daraus holt das Tool die echten Gebäudeumrisse und den Grundriss.
            </p>
          </div>

          <div>
            <span className="text-xs text-lv-blass">Optional: Adresse suchen (schickt die Eingabe an den OSM-Adressdienst)</span>
            <div className="flex gap-2 mt-1">
              <input className="flex-1" placeholder="Straße, Ort — z. B. Bahnhofstraße 1, Musterstadt"
                value={adresse} onChange={(e) => setAdresse(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && adressSuche()} />
              <button className="btn-sekundaer" onClick={adressSuche} disabled={geoBusy || !adresse.trim()}>
                {geoBusy ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />} Suchen
              </button>
            </div>
          </div>

          <div>
            <span className="text-xs text-lv-blass">GPS-Koordinaten</span>
            <div className="flex gap-2 mt-1">
              <input className="flex-1" placeholder="Breite (z. B. 49.12345)" value={lat} onChange={(e) => setLat(e.target.value)} />
              <input className="flex-1" placeholder="Länge (z. B. 8.67890)" value={lon} onChange={(e) => setLon(e.target.value)} />
            </div>
            {lat !== '' && lon !== '' && !gpsOk && (
              <p className="text-xs text-red-400 mt-1">Das sieht nicht wie gültige Koordinaten aus — bitte prüfen.</p>
            )}
          </div>

          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={osmAn} onChange={(e) => setOsmAn(e.target.checked)} className="accent-lv-limette w-4 h-4" />
            <span>Echte Gebäudeumrisse &amp; Wege von OpenStreetMap laden <span className="text-lv-blass">(empfohlen)</span></span>
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={luftbildAn} onChange={(e) => setLuftbildAn(e.target.checked)} className="accent-lv-limette w-4 h-4" />
            <span>Satelliten-Luftbild der Umgebung als Boden laden <span className="text-lv-blass">(macht die Szene realistisch)</span></span>
          </label>
          <p className="text-xs text-lv-blass flex gap-1.5 -mt-2">
            <Info size={13} className="shrink-0 mt-0.5" />
            Dabei gehen nur die Koordinaten an die OSM-/Karten-Dienste — nie Bilder oder etwas anderes.
            Das Luftbild wird einmalig lokal gespeichert. Quelle umstellbar unter <b>Einstellungen</b> (Esri/Google).
          </p>

          <button className="btn-primaer w-full justify-center" onClick={() => speicherGps(true)}
            disabled={!gpsOk || geoBusy}>
            {geoBusy ? <><Loader2 size={16} className="animate-spin" /> Speichere …</> : <>Speichern &amp; weiter zu den Bildern</>}
          </button>
          {p.lat != null && p.lon != null && (
            <p className="text-xs text-lv-limette flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5"><Check size={13} /> Standort gespeichert ({p.lat.toFixed(5)}, {p.lon.toFixed(5)})</span>
              {p.hat_luftbild && <span className="flex items-center gap-1.5"><Check size={13} /> Luftbild geladen ({p.luftbild_meta?.quelle === 'google' ? 'Google' : 'Esri'})</span>}
            </p>
          )}
        </section>
      )}

      {/* ================= Schritt 2: Bilder ================= */}
      {schritt === 2 && (
        <section className="space-y-4 max-w-2xl">
          <div className="karte space-y-3">
            <div>
              <h2 className="font-medium text-lg">Zeig dem KI-Modell dein Haus</h2>
              <p className="text-sm text-lv-blass mt-1">
                Ein Bild genügt — mehrere machen das Ergebnis genauer. Am hilfreichsten:
              </p>
            </div>
            <ul className="text-sm text-lv-blass space-y-1.5">
              <li className="flex gap-2"><MapPin size={14} className="text-lv-limette shrink-0 mt-0.5" /> Aufnahme von oben (Drohne) oder schräg — zeigt Grundriss &amp; Dach</li>
              <li className="flex gap-2"><ImagePlus size={14} className="text-lv-limette shrink-0 mt-0.5" /> Eine Fassade von der Straße — zeigt Fenster, Tür, Farben</li>
              <li className="flex gap-2"><Sparkles size={14} className="text-lv-limette shrink-0 mt-0.5" /> Sichtbare Extras mitschieken: PV-Anlage, Garage, Bäume</li>
            </ul>
            <div className="border-2 border-dashed border-lv-kante rounded-xl p-8 text-center text-sm text-lv-blass cursor-pointer hover:border-lv-limette/50 transition"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}>
              {uploadBusy
                ? <Loader2 className="mx-auto animate-spin" size={22} />
                : <>Hierher ziehen oder klicken — JPG / PNG / WebP</>}
            </div>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
              onChange={(e) => upload(e.target.files)} />
            {!!p.bilder.length && (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {p.bilder.map((b) => (
                  <div key={b.id} className="relative group aspect-square rounded-lg overflow-hidden border border-lv-kante">
                    <img src={`/api/bilder/${b.id}/datei`} alt="" className="w-full h-full object-cover" />
                    {b.analyse && (
                      <span className="absolute bottom-1 left-1 text-[10px] px-1.5 rounded bg-lv-limette text-lv-bg font-medium">analysiert</span>
                    )}
                    <button onClick={() => bildLoeschen(b.id)}
                      className="absolute top-1 right-1 p-1 rounded bg-black/60 opacity-0 group-hover:opacity-100 transition" title="Bild entfernen">
                      <Trash2 size={13} className="text-red-300" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button className="btn-primaer" onClick={() => setSchritt(3)} disabled={!p.bilder.length}
              title={p.bilder.length ? undefined : 'Zuerst mindestens ein Bild hochladen'}>
              Weiter zur Analyse
            </button>
          </div>
        </section>
      )}

      {/* ================= Schritt 3: Analyse ================= */}
      {schritt === 3 && (
        <section className="space-y-4 max-w-2xl">
          <div>
            <h2 className="font-medium text-lg">Die KI schaut sich dein Haus an</h2>
            <p className="text-sm text-lv-blass mt-1">
              Erkannt werden Dachform, Etagen, Farben, Fenster, PV-Anlage und Umgebung — daraus entsteht die 3D-Szene.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <button onClick={() => setProvider('ollama')}
              className={`text-left p-4 rounded-xl border transition ${
                provider === 'ollama' ? 'border-lv-limette bg-lv-limette/10' : 'border-lv-kante hover:border-lv-limette/50'
              }`}>
              <span className="flex items-center gap-2 font-medium"><Lock size={15} className="text-lv-limette" /> Lokal — Ollama</span>
              <span className="block text-xs text-lv-blass mt-1">Bilder verlassen dein Netzwerk nicht. Modell: {einst?.ollama_model || '—'}</span>
            </button>
            <button onClick={() => !openrouterGesperrt && setProvider('openrouter')} disabled={openrouterGesperrt}
              className={`text-left p-4 rounded-xl border transition ${
                provider === 'openrouter' ? 'border-lv-limette bg-lv-limette/10' : 'border-lv-kante'
              } ${openrouterGesperrt ? 'opacity-40 cursor-not-allowed' : 'hover:border-lv-limette/50'}`}
              title={openrouterGesperrt ? (!einst?.openrouter_aktiv ? 'Kein API-Key — unter Einstellungen hinterlegen' : 'Projekt steht auf „Nur lokal“') : undefined}>
              <span className="flex items-center gap-2 font-medium"><Cloud size={15} /> Cloud — OpenRouter</span>
              <span className="block text-xs text-lv-blass mt-1">
                {openrouterGesperrt
                  ? (!einst?.openrouter_aktiv ? 'Kein API-Key hinterlegt (Einstellungen)' : 'Gesperrt: dieses Projekt ist „Nur lokal“')
                  : `Schnelle & starke Modelle. Bildinhalte gehen in die Cloud. Modell: ${einst?.openrouter_model || '—'}`}
              </span>
            </button>
          </div>

          <details className="text-sm text-lv-blass">
            <summary className="cursor-pointer">Modell überschreiben (für Fortgeschrittene)</summary>
            <input className="mt-2 w-full" placeholder={`Standard: ${provider === 'ollama' ? einst?.ollama_model : einst?.openrouter_model}`}
              value={model} onChange={(e) => setModel(e.target.value)} />
          </details>

          <button className="btn-primaer w-full justify-center" onClick={analyse}
            disabled={analyseBusy || !p.bilder.length || (provider === 'openrouter' && openrouterGesperrt)}>
            {analyseBusy
              ? <><Loader2 size={16} className="animate-spin" /> Analysiere … (lokale KI kann eine Weile brauchen)</>
              : <><Sparkles size={16} /> Jetzt analysieren</>}
          </button>

          {fragment && (
            <div className="bg-lv-bg/50 border border-lv-kante rounded-xl p-4 space-y-2">
              <p className="text-sm"><span className="text-lv-blass">Was die KI gesehen hat:</span> {fragment.beschreibung || '—'}</p>
              {!!fragment.vegetation_hinweis?.length && (
                <p className="text-sm text-lv-blass">Umgebung: {fragment.vegetation_hinweis.join(' · ')}</p>
              )}
              {fragment.sonstiges && <p className="text-sm text-lv-blass">Extras: {fragment.sonstiges}</p>}
              {p.spec?.meta?.notizen?.length && (
                <p className="text-sm text-lv-blass">Weitere Hinweise: {p.spec.meta.notizen.join(' · ')}</p>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button className="btn-primaer" onClick={() => setSchritt(4)}>
              Weiter zum Anpassen
            </button>
          </div>
        </section>
      )}

      {/* ================= Schritt 4: Anpassen ================= */}
      {schritt === 4 && (
        <section className="space-y-5">
          {!spec ? (
            <div className="karte max-w-2xl text-center space-y-3">
              <p className="text-sm text-lv-blass">
                Noch keine Szene vorhanden. Starte erst den <b>OSM-Abgleich</b> (Schritt 1) oder die <b>Analyse</b> (Schritt 3).
              </p>
              <button className="btn-sekundaer mx-auto" onClick={() => setSchritt(1)}>Zu Schritt 1</button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium text-lg mr-auto">Feinschliff — alles per Klick anpassbar</h2>
                {geaendert && (
                  <span className="text-xs text-amber-300 flex items-center gap-1"><AlertTriangle size={13} /> Ungespeicherte Änderungen</span>
                )}
                <button className="btn-sekundaer" onClick={zurueckZuAnalyse} disabled={specBusy}
                  title="Verwirft manuelle Anpassungen und baut die Szene neu aus OSM + Analyse">
                  <RefreshCw size={15} /> Analyse-Ergebnis wiederherstellen
                </button>
                <button className="btn-primaer" onClick={speichereSpec} disabled={!geaendert || specBusy}>
                  {specBusy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Änderungen speichern
                </button>
              </div>

              <div className="space-y-4">
                {spec.gebaeude.map((g, i) => (
                  <GebaeudeEditor key={g.id} gebaeude={g}
                    geaendert={(patch) => {
                      const n = structuredClone(spec.gebaeude);
                      n[i] = { ...g, ...patch, dach: { ...g.dach, ...(patch.dach ?? {}) } } as typeof g;
                      aendereSpec({ gebaeude: n });
                    }} />
                ))}
              </div>

              <div className="karte">
                <VegetationEditor
                  vegetation={spec.vegetation} hecken={spec.hecken} wege={spec.wege}
                  onChange={(patch) => aendereSpec(patch as Partial<SceneSpec>)} />
              </div>

              <details className="text-sm text-lv-blass">
                <summary className="cursor-pointer">Expertenmodus: rohe Szenen-Daten (JSON)</summary>
                <textarea className="w-full h-72 font-mono text-xs mt-2" value={expText}
                  onChange={(e) => setExpText(e.target.value)} />
                <button className="btn-sekundaer mt-2" onClick={async () => {
                  try {
                    const s = JSON.parse(expText);
                    await api(`/projekte/${pid}/spec`, { method: 'PUT', body: JSON.stringify({ spec: s }) });
                    toastSetzen('JSON gespeichert');
                    setPreviewKey((k) => k + 1);
                    await laden();
                  } catch (e: any) { toastSetzen(`JSON invalide: ${e.message}`, false); }
                }}>
                  <Save size={15} /> JSON speichern
                </button>
              </details>
            </>
          )}
        </section>
      )}

      {/* ================= Schritt 5: Ergebnis ================= */}
      {schritt === 5 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1.5 mr-auto">
              {TAGESZEITEN.map((t) => (
                <button key={t.id} onClick={() => setLicht(t.id)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition ${
                    licht === t.id ? 'border-lv-limette text-lv-limette bg-lv-limette/10' : 'border-lv-kante text-lv-blass hover:border-lv-limette/50'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            <button className="btn-sekundaer" onClick={() => setPreviewKey((k) => k + 1)}>
              <Eye size={15} /> Neu laden
            </button>
            <button className="btn-sekundaer"
              onClick={() => window.open(`/api/projekte/${pid}/preview?light=${licht}`, '_blank')}
              title="Szene in vollem Fenster öffnen">
              <Maximize2 size={15} /> Vollbild
            </button>
            <a className="btn-primaer" href={`/api/projekte/${pid}/export`} download>
              <Download size={16} /> HTML herunterladen
            </a>
          </div>
          <div className="karte !p-3">
            <iframe key={`${previewKey}-${licht}`}
              src={`/api/projekte/${pid}/preview?light=${licht}`}
              className="w-full h-[75vh] rounded-xl border-0 bg-lv-bg" title="3D-Zwilling" />
          </div>
          <p className="text-xs text-lv-blass flex gap-1.5">
            <Info size={13} className="shrink-0 mt-0.5" />
            Der Download ist <b>eine einzelne HTML-Datei</b> mit der ganzen 3D-Szene drin — sie läuft offline,
            lässt sich per E-Mail weitergeben oder direkt in eine Website einbetten. Deine GPS-Koordinaten sind darin nicht enthalten.
          </p>
        </section>
      )}
    </AppShell>
  );
}
