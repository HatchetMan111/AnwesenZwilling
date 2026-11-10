import { Minus, Plus } from 'lucide-react';
import { istRechteckig, abmessungen } from '../types';
import type { Gebaeude, Dachform, Himmelsrichtung } from '../types';

const WAND_FARBEN = ['#e8e2d6', '#f5f0e8', '#d9cbb2', '#b8c4c9', '#a89f91', '#e5d3b3'];
const DACH_FARBEN = ['#704a3a', '#5c5548', '#8a2a2a', '#4a5a6a', '#2e3440', '#7d5a3c'];

/** Winzige Dach-Silhouetten als Inline-SVG. */
function DachIcon({ form }: { form: Dachform }) {
  const s = { fill: 'currentColor' } as const;
  switch (form) {
    case 'sattel': return <svg width="26" height="12" viewBox="0 0 26 12" {...s}><path d="M1 11 L13 1 L25 11 Z" /></svg>;
    case 'walme': return <svg width="26" height="12" viewBox="0 0 26 12" {...s}><path d="M1 11 L7 3 L13 1 L19 3 L25 11 Z" /></svg>;
    case 'flach': return <svg width="26" height="12" viewBox="0 0 26 12" {...s}><rect x="1" y="8" width="24" height="3" /></svg>;
    case 'pyramide': return <svg width="26" height="12" viewBox="0 0 26 12" {...s}><path d="M1 11 L13 1 L25 11 L13 9 Z" /></svg>;
  }
}

function Farbzeile({ wert, presets, onChange, label }: {
  wert: string; presets: string[]; onChange: (c: string) => void; label: string;
}) {
  return (
    <div>
      <span className="text-xs text-lv-blass">{label}</span>
      <div className="flex items-center gap-1.5 mt-1">
        {presets.map((c) => (
          <button key={c} onClick={() => onChange(c)} title={c}
            className={`w-6 h-6 rounded-md border-2 ${wert.toLowerCase() === c.toLowerCase() ? 'border-lv-limette' : 'border-lv-kante'}`}
            style={{ background: c }} />
        ))}
        <input type="color" value={wert} onChange={(e) => onChange(e.target.value)}
          className="w-6 h-6 rounded-md border border-lv-kante bg-transparent cursor-pointer p-0" title="Eigene Farbe wählen" />
      </div>
    </div>
  );
}

/** Visueller Editor für ein Gebäude — ersetzt den rohen JSON-Anblick. */
export default function GebaeudeEditor({ gebaeude, geaendert }: {
  gebaeude: Gebaeude;
  geaendert: (patch: Partial<Gebaeude> & { dach?: Partial<Gebaeude['dach']> }) => void;
}) {
  const g = gebaeude;
  const rechteckig = istRechteckig(g.footprint);
  const mass = abmessungen(g.footprint);
  const geneigt = g.dach.form === 'sattel' || g.dach.form === 'walme';
  const geneigtOderPyr = geneigt || g.dach.form === 'pyramide';

  function dach(patch: Partial<Gebaeude['dach']>) {
    geaendert({ dach: { ...g.dach, ...patch } });
  }

  return (
    <div className="bg-lv-bg/50 border border-lv-kante rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="font-medium">{g.name || g.id}</span>
          <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded border border-lv-kante text-lv-blass">
            {g.quelle === 'osm' ? 'Grundriss von OSM' : g.quelle === 'ki' ? 'aus Bildanalyse' : 'manuell'}
          </span>
        </div>
        <span className="text-xs text-lv-blass">{mass.breite} × {mass.tiefe} m</span>
      </div>

      {/* Etagen */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-lv-blass w-24">Etagen</span>
        <div className="flex items-center gap-2">
          <button className="btn-sekundaer !p-1.5" onClick={() => geaendert({ etagen: Math.max(1, g.etagen - 1) })}
            disabled={g.etagen <= 1} title="Weniger Etagen"><Minus size={14} /></button>
          <span className="w-8 text-center font-medium">{g.etagen}</span>
          <button className="btn-sekundaer !p-1.5" onClick={() => geaendert({ etagen: Math.min(4, g.etagen + 1) })}
            disabled={g.etagen >= 4} title="Mehr Etagen"><Plus size={14} /></button>
        </div>
        <span className="text-xs text-lv-blass">≈ {Math.round(g.etagen * g.etagen_hoehe)} m hoch</span>
      </div>

      {/* Dachform */}
      <div>
        <span className="text-xs text-lv-blass">Dachform</span>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {(['sattel', 'walme', 'flach', 'pyramide'] as Dachform[]).map((f) => {
            const erlaubt = f === 'flach' || rechteckig;
            return (
              <button key={f} disabled={!erlaubt} onClick={() => dach({ form: f })}
                title={erlaubt ? undefined : 'Geneigte Dächer gibt es nur bei rechteckigem Grundriss — dieser ist unregelmäßig (aus OSM)'}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition ${
                  g.dach.form === f ? 'border-lv-limette text-lv-limette bg-lv-limette/10'
                    : erlaubt ? 'border-lv-kante text-lv-blass hover:border-lv-limette/50'
                    : 'border-lv-kante text-lv-blass/40 cursor-not-allowed'
                }`}>
                <DachIcon form={f} /> {f === 'sattel' ? 'Sattel' : f === 'walme' ? 'Walm' : f === 'flach' ? 'Flachdach' : 'Pyramide'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dachdetails */}
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
        <label className={`flex items-center gap-3 ${geneigtOderPyr ? '' : 'opacity-40'}`}
          title={geneigtOderPyr ? undefined : 'Nur bei geneigtem Dach relevant'}>
          <span className="text-xs text-lv-blass w-24">Dachneigung</span>
          <input type="range" min={5} max={60} step={5} value={g.dach.neigung} disabled={!geneigtOderPyr}
            onChange={(e) => dach({ neigung: Number(e.target.value) })} className="flex-1 accent-lv-limette" />
          <span className="text-xs w-12">{g.dach.neigung}°</span>
        </label>
        <div className={`flex items-center gap-3 ${geneigt ? '' : 'opacity-40'}`}
          title={geneigt ? undefined : 'Nur bei Sattel/Walm relevant'}>
          <span className="text-xs text-lv-blass w-24">First läuft</span>
          <div className="flex gap-1.5">
            {[{ v: 0, t: 'Ost–West' }, { v: 90, t: 'Nord–Süd' }].map((o) => (
              <button key={o.v} disabled={!geneigt}
                onClick={() => dach({ first_richtung: o.v })}
                className={`px-2.5 py-1 rounded-lg border text-xs transition ${
                  (g.dach.first_richtung % 180 + 180) % 180 < 45 || (g.dach.first_richtung % 180 + 180) % 180 >= 135
                    ? o.v === 0 ? 'border-lv-limette text-lv-limette' : 'border-lv-kante text-lv-blass'
                    : o.v === 90 ? 'border-lv-limette text-lv-limette' : 'border-lv-kante text-lv-blass'
                } ${geneigt ? 'hover:border-lv-limette/50' : ''} disabled:cursor-not-allowed`}>
                {o.t}
              </button>
            ))}
          </div>
        </div>
        <Farbzeile label="Wandfarbe" wert={g.wand_farbe} presets={WAND_FARBEN}
          onChange={(c) => geaendert({ wand_farbe: c })} />
        <Farbzeile label="Dachfarbe" wert={g.dach_farbe} presets={DACH_FARBEN}
          onChange={(c) => geaendert({ dach_farbe: c })} />
        <label className="flex items-center gap-3">
          <span className="text-xs text-lv-blass w-24">Fensteranteil</span>
          <input type="range" min={0} max={0.7} step={0.05} value={g.fenster_anteil}
            onChange={(e) => geaendert({ fenster_anteil: Number(e.target.value) })} className="flex-1 accent-lv-limette" />
          <span className="text-xs w-12">{Math.round(g.fenster_anteil * 100)} %</span>
        </label>
        <div className="flex items-center gap-3">
          <span className="text-xs text-lv-blass w-24">Haustür</span>
          <div className="flex gap-1.5">
            {([['n', 'Nord'], ['o', 'Ost'], ['s', 'Süd'], ['w', 'West']] as [Himmelsrichtung, string][]).map(([v, t]) => (
              <button key={v} onClick={() => geaendert({ tuer_seite: v })}
                className={`px-2.5 py-1 rounded-lg border text-xs transition ${
                  g.tuer_seite === v ? 'border-lv-limette text-lv-limette' : 'border-lv-kante text-lv-blass hover:border-lv-limette/50'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <label className={`flex items-center gap-3 ${geneigt ? '' : 'opacity-40'}`}
          title={geneigt ? undefined : 'PV-Module sitzen auf der Dachfläche — kein geneigtes Dach, keine Module'}>
          <span className="text-xs text-lv-blass w-24">PV-Anlage</span>
          <input type="checkbox" checked={g.pv} disabled={!geneigt}
            onChange={(e) => geaendert({ pv: e.target.checked })} className="accent-lv-limette w-4 h-4" />
          <span className="text-xs text-lv-blass">Module auf dem Dach zeigen</span>
        </label>
      </div>
    </div>
  );
}
