import type { LucideIcon } from 'lucide-react';
import { Check } from 'lucide-react';

export interface SchrittInfo {
  nr: number;
  titel: string;
  icon: LucideIcon;
  /** „erledigt“-Zustand aus den Daten (grüner Haken statt Nummer) */
  fertig: boolean;
}

/** Schritt-Rail des Assistenten — alle Schritte sind frei anklickbar. */
export default function StepRail({ schritte, aktiv, onSpringen }: {
  schritte: SchrittInfo[];
  aktiv: number;
  onSpringen: (nr: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-y-2 mb-6 select-none">
      {schritte.map((s, i) => {
        const Icon = s.icon;
        const istAktiv = s.nr === aktiv;
        return (
          <li key={s.nr} className="flex items-center">
            <button
              onClick={() => onSpringen(s.nr)}
              className={`flex items-center gap-2 rounded-full pl-1.5 pr-3.5 py-1.5 text-sm transition ${
                istAktiv
                  ? 'bg-lv-limette text-lv-bg font-semibold'
                  : s.fertig
                    ? 'text-lv-text hover:bg-lv-karte'
                    : 'text-lv-blass hover:bg-lv-karte'
              }`}
              title={`Schritt ${s.nr}: ${s.titel}`}
            >
              <span className={`w-7 h-7 rounded-full grid place-items-center border ${
                istAktiv ? 'border-lv-bg/40 bg-lv-bg/10' : s.fertig ? 'border-lv-limette/60 bg-lv-limette/15 text-lv-limette' : 'border-lv-kante'
              }`}>
                {s.fertig && !istAktiv ? <Check size={14} /> : <Icon size={14} />}
              </span>
              <span className="hidden sm:inline">
                {s.nr}. {s.titel}
              </span>
              <span className="sm:hidden">{s.nr}</span>
            </button>
            {i < schritte.length - 1 && <span className="mx-1 w-4 sm:w-6 border-t border-lv-kante" />}
          </li>
        );
      })}
    </ol>
  );
}
