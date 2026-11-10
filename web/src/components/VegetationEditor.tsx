import { TreeDeciduous, TreePine, Plus, Trash2, Route } from 'lucide-react';
import type { Baum, Hecke, Weg } from '../types';

/** Positionsfeld in Nutznersprache: „Meter nach Osten/Westen, Norden/Süden“ vom Hausmittelpunkt. */
function PositionsFelder({ pos, onChange }: {
  pos: [number, number];
  onChange: (p: [number, number]) => void;
}) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <input type="number" step={1} value={pos[0]} onChange={(e) => onChange([Number(e.target.value) || 0, pos[1]])}
        className="w-16 !px-2 !py-1" title="Meter nach Osten (+) / Westen (−)" />
      <span className="text-lv-blass">O/W</span>
      <input type="number" step={1} value={pos[1]} onChange={(e) => onChange([pos[0], Number(e.target.value) || 0])}
        className="w-16 !px-2 !py-1" title="Meter nach Norden (−) / Süden (+)" />
      <span className="text-lv-blass">N/S</span>
    </div>
  );
}

/** Visueller Editor für Bäume, Hecken und Wege. */
export default function VegetationEditor({ vegetation, hecken, wege, onChange }: {
  vegetation: Baum[];
  hecken: Hecke[];
  wege: Weg[];
  onChange: (patch: { vegetation?: Baum[]; hecken?: Hecke[]; wege?: Weg[] }) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Bäume */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Bäume ({vegetation.length})</span>
          <button className="btn-sekundaer !py-1 !px-2.5 text-xs"
            onClick={() => onChange({ vegetation: [...vegetation, { position: [12, 10], hoehe: 6, kronen_radius: 2.5, art: 'laub' }] })}>
            <Plus size={13} /> Baum
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {vegetation.map((b, i) => (
            <div key={i} className="bg-lv-bg/50 border border-lv-kante rounded-xl p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex gap-1">
                {([['laub', TreeDeciduous, 'Laubbaum'], ['nadel', TreePine, 'Nadelbaum']] as const).map(([art, Icon, titel]) => (
                  <button key={art} onClick={() => {
                    const n = [...vegetation];
                    n[i] = { ...b, art: art as 'laub' | 'nadel' };
                    onChange({ vegetation: n });
                  }} title={titel}
                    className={`p-1.5 rounded-lg border transition ${
                      b.art === art ? 'border-lv-limette text-lv-limette' : 'border-lv-kante text-lv-blass hover:border-lv-limette/50'
                    }`}>
                    <Icon size={16} />
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-lv-blass">
                Höhe
                <input type="range" min={2} max={20} step={1} value={b.hoehe}
                  onChange={(e) => { const n = [...vegetation]; n[i] = { ...b, hoehe: Number(e.target.value) }; onChange({ vegetation: n }); }}
                  className="accent-lv-limette w-24" />
                <span className="w-9">{b.hoehe} m</span>
              </label>
              <PositionsFelder pos={b.position}
                onChange={(p) => { const n = [...vegetation]; n[i] = { ...b, position: p }; onChange({ vegetation: n }); }} />
              <button className="ml-auto text-lv-blass hover:text-red-300"
                onClick={() => onChange({ vegetation: vegetation.filter((_, j) => j !== i) })}
                title="Baum entfernen"><Trash2 size={14} /></button>
            </div>
          ))}
          {!vegetation.length && <p className="text-xs text-lv-blass">Keine Bäume — „Baum“ klicken, um einen zu pflanzen.</p>}
        </div>
      </div>

      {/* Hecken */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Hecken ({hecken.length})</span>
          <button className="btn-sekundaer !py-1 !px-2.5 text-xs"
            title="Fügt eine Heckenreihe am Südrand des Grundstücks ein"
            onClick={() => onChange({ hecken: [...hecken, { punkte: [[-15, 18], [15, 18]], hoehe: 1.2, breite: 0.8 }] })}>
            <Plus size={13} /> Hecke
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {hecken.map((h, i) => (
            <div key={i} className="bg-lv-bg/50 border border-lv-kante rounded-xl p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-xs text-lv-blass">
                von ({h.punkte[0][0]}, {h.punkte[0][1]}) nach ({h.punkte[h.punkte.length - 1][0]}, {h.punkte[h.punkte.length - 1][1]})
              </span>
              <label className="flex items-center gap-2 text-xs text-lv-blass">
                Höhe
                <input type="range" min={0.4} max={3} step={0.1} value={h.hoehe}
                  onChange={(e) => { const n = [...hecken]; n[i] = { ...h, hoehe: Number(e.target.value) }; onChange({ hecken: n }); }}
                  className="accent-lv-limette w-20" />
                <span className="w-9">{h.hoehe.toFixed(1)} m</span>
              </label>
              <button className="ml-auto text-lv-blass hover:text-red-300"
                onClick={() => onChange({ hecken: hecken.filter((_, j) => j !== i) })}
                title="Hecke entfernen"><Trash2 size={14} /></button>
            </div>
          ))}
          {!hecken.length && <p className="text-xs text-lv-blass">Keine Hecken.</p>}
        </div>
      </div>

      {/* Wege */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium flex items-center gap-1.5"><Route size={15} /> Wege &amp; Zufahrt ({wege.length})</span>
          <button className="btn-sekundaer !py-1 !px-2.5 text-xs"
            title="Fügt eine Zufahrt von Süden zum Haus ein"
            onClick={() => onChange({ wege: [...wege, { punkte: [[0, 25], [0, 6]], breite: 3, art: 'zufahrt', farbe: null }] })}>
            <Plus size={13} /> Zufahrt
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {wege.map((w, i) => (
            <div key={i} className="bg-lv-bg/50 border border-lv-kante rounded-xl p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex gap-1">
                {([['zufahrt', 'Zufahrt'], ['weg', 'Weg'], ['terrasse', 'Terrasse']] as const).map(([art, titel]) => (
                  <button key={art} onClick={() => { const n = [...wege]; n[i] = { ...w, art: art as Weg['art'] }; onChange({ wege: n }); }}
                    className={`px-2.5 py-1 rounded-lg border text-xs transition ${
                      w.art === art ? 'border-lv-limette text-lv-limette' : 'border-lv-kante text-lv-blass hover:border-lv-limette/50'
                    }`}>
                    {titel}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-lv-blass">
                Breite
                <input type="range" min={0.5} max={8} step={0.5} value={w.breite}
                  onChange={(e) => { const n = [...wege]; n[i] = { ...w, breite: Number(e.target.value) }; onChange({ wege: n }); }}
                  className="accent-lv-limette w-20" />
                <span className="w-9">{w.breite} m</span>
              </label>
              <span className="text-xs text-lv-blass">{w.punkte.length} Punkte</span>
              <button className="ml-auto text-lv-blass hover:text-red-300"
                onClick={() => onChange({ wege: wege.filter((_, j) => j !== i) })}
                title="Weg entfernen"><Trash2 size={14} /></button>
            </div>
          ))}
          {!wege.length && <p className="text-xs text-lv-blass">Keine Wege — „Zufahrt“ klicken, um eine Einfahrt einzuziehen.</p>}
        </div>
      </div>
    </div>
  );
}
