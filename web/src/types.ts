// Geteilte Typen — Spiegel von app/anwesen_twin/twin/schema.py und api.py.
// Koordinaten: lokale Meter, Ursprung Hauptgebäude, +x = Ost, -z = Nord.

export type Vec2 = [number, number];

export type Dachform = 'sattel' | 'walme' | 'flach' | 'pyramide';
export type Himmelsrichtung = 'n' | 'o' | 's' | 'w';

export interface Dach {
  form: Dachform;
  neigung: number;
  first_richtung: number;
  ueberstand: number;
}

export interface Gebaeude {
  id: string;
  name: string;
  footprint: Vec2[];
  etagen: number;
  etagen_hoehe: number;
  dach: Dach;
  wand_farbe: string;
  dach_farbe: string;
  fenster_anteil: number;
  tuer_seite: Himmelsrichtung;
  pv: boolean;
  quelle: 'osm' | 'ki' | 'manuell';
}

export interface Baum {
  position: Vec2;
  hoehe: number;
  kronen_radius: number;
  art: 'laub' | 'nadel';
}

export interface Hecke {
  punkte: Vec2[];
  hoehe: number;
  breite: number;
}

export interface Weg {
  punkte: Vec2[];
  breite: number;
  art: 'zufahrt' | 'weg' | 'terrasse';
  farbe: string | null;
}

export interface Grundstueck {
  polygon: Vec2[] | null;
  boden_farbe: string;
}

export interface SzeneMeta {
  massstab_referenz: string;
  quellen: string[];
  notizen: string[];
}

export interface SceneSpec {
  version: number;
  grundstueck: Grundstueck;
  gebaeude: Gebaeude[];
  vegetation: Baum[];
  hecken: Hecke[];
  wege: Weg[];
  meta: SzeneMeta;
}

export interface Bild {
  id: number;
  notiz: string;
  analyse: string | null;
  created_at: string;
}

export interface OsmRoh {
  gebaeude: { footprint: Vec2[]; tags: Record<string, string> }[];
  baeume: { x: number; z: number }[];
  wege: { punkte: Vec2[]; art: string; breite: number }[];
  gruen: { polygon: Vec2[]; art: string }[];
}

export interface Projekt {
  id: number;
  name: string;
  lat: number | null;
  lon: number | null;
  privacy_lokal: number;
  osm_roh: OsmRoh | null;
  spec: SceneSpec | null;
  bilder: Bild[];
  created_at?: string;
  updated_at?: string;
}

export interface ProjektKurz {
  id: number;
  name: string;
  lat: number | null;
  lon: number | null;
  privacy_lokal: number;
  bild_anzahl: number;
  hat_spec: number;
  updated_at: string;
}

export interface Einst {
  ollama_url: string;
  ollama_model: string;
  openrouter_aktiv: boolean;
  openrouter_key_maskiert: string;
  openrouter_model: string;
}

/** Rechteck-ähnlicher Grundriss? (gleiche Schwelle wie die Engine: Fläche/BBox > 0.8) */
export function istRechteckig(footprint: Vec2[]): boolean {
  if (footprint.length < 3) return false;
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity, flaeche2 = 0;
  for (let i = 0; i < footprint.length; i++) {
    const [x, z] = footprint[i];
    const [x2, z2] = footprint[(i + 1) % footprint.length];
    flaeche2 += x * z2 - x2 * z;
    minx = Math.min(minx, x); maxx = Math.max(maxx, x);
    minz = Math.min(minz, z); maxz = Math.max(maxz, z);
  }
  const aabb = Math.max((maxx - minx) * (maxz - minz), 0.001);
  return Math.abs(flaeche2 / 2) / aabb > 0.8;
}

/** Abmessungen des Grundriss-Bounding-Box in Metern (für die Anzeige). */
export function abmessungen(footprint: Vec2[]): { breite: number; tiefe: number } {
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (const [x, z] of footprint) {
    minx = Math.min(minx, x); maxx = Math.max(maxx, x);
    minz = Math.min(minz, z); maxz = Math.max(maxz, z);
  }
  return { breite: Math.round(maxx - minx), tiefe: Math.round(maxz - minz) };
}

/** Demo-Spec für den „Demo ansehen“-Button — spiegelt engine/main.js DEMO. */
export const DEMO_SPEC: SceneSpec = {
  version: 1,
  grundstueck: { polygon: [[-22, -18], [22, -18], [22, 18], [-22, 18]], boden_farbe: '#7da05a' },
  gebaeude: [{
    id: 'haus', name: 'Hauptgebäude',
    footprint: [[-8, -6], [8, -6], [8, 6], [-8, 6]],
    etagen: 2, etagen_hoehe: 2.7,
    dach: { form: 'sattel', neigung: 35, first_richtung: 0, ueberstand: 0.5 },
    wand_farbe: '#e8e2d6', dach_farbe: '#704a3a', fenster_anteil: 0.3,
    tuer_seite: 's', pv: true, quelle: 'manuell',
  }],
  vegetation: [
    { position: [-14, -10], hoehe: 8, kronen_radius: 3.2, art: 'laub' },
    { position: [15, 4], hoehe: 6, kronen_radius: 2.4, art: 'laub' },
    { position: [-16, 8], hoehe: 10, kronen_radius: 1.6, art: 'nadel' },
  ],
  hecken: [{ punkte: [[-22, 17], [22, 17]], hoehe: 1.2, breite: 0.8 }],
  wege: [
    { punkte: [[0, 24], [0, 6.5]], breite: 3, art: 'zufahrt', farbe: null },
    { punkte: [[-4, 6.5], [4, 6.5], [6, 10]], breite: 2, art: 'terrasse', farbe: null },
  ],
  meta: { massstab_referenz: 'Demo', quellen: ['demo'], notizen: [] },
};
