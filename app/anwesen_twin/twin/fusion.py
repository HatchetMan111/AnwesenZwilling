"""Fusion: OSM-Footprints (exakt) + KI-Fragmente (Details) → engine-fertige SceneSpec.

Heuristik, bewusst simpel:
- Größtes OSM-Gebäude = Hauptgebäude, bekommt die KI-Details (Dach, Farben, PV ...).
- Kleinere OSM-Gebäude werden Nebengebäude (< 30 m² Flachdach-Garage, sonst Sattel).
- Ohne OSM: Default-Rechteck, skaliert auf die optionale Maßstabsangabe.
Danach zentriert die Spec alles auf (0,0) — keine absoluten Koordinaten bleiben übrig.
"""
from __future__ import annotations

from typing import Any

from .schema import Baum, Dach, Gebaeude, SceneSpec, SpecFragment, Weg


def fusioniere(
    osm_roh: dict[str, Any] | None,
    fragmente: list[SpecFragment],
    haus_breite: float | None = None,
) -> SceneSpec:
    spec = SceneSpec()
    notizen: list[str] = []

    # ---- Gebaeude ----------------------------------------------------------
    osm_gebaeude = (osm_roh or {}).get("gebaeude", [])
    ki_haupt = _hauptgebaeude_fragment(fragmente)

    if osm_gebaeude:
        sortiert = sorted(osm_gebaeude, key=lambda g: _flaeche(g["footprint"]), reverse=True)
        for i, g in enumerate(sortiert):
            footprint = [(x, z) for x, z in g["footprint"]]
            flaeche = _flaeche(footprint)
            if i == 0:
                base = Gebaeude(
                    id="haus",
                    name="Hauptgebäude",
                    footprint=footprint,
                    etagen=(ki_haupt.gebaeude[0].etagen if ki_haupt and ki_haupt.gebaeude else 1),
                    etagen_hoehe=(ki_haupt.gebaeude[0].etagen_hoehe if ki_haupt and ki_haupt.gebaeude else 2.7),
                    dach=(ki_haupt.gebaeude[0].dach if ki_haupt and ki_haupt.gebaeude else Dach()),
                    wand_farbe=(ki_haupt.gebaeude[0].wand_farbe if ki_haupt and ki_haupt.gebaeude else "#e8e2d6"),
                    dach_farbe=(ki_haupt.gebaeude[0].dach_farbe if ki_haupt and ki_haupt.gebaeude else "#704a3a"),
                    fenster_anteil=(ki_haupt.gebaeude[0].fenster_anteil if ki_haupt and ki_haupt.gebaeude else 0.25),
                    tuer_seite=(ki_haupt.gebaeude[0].tuer_seite if ki_haupt and ki_haupt.gebaeude else "s"),
                    pv=(ki_haupt.gebaeude[0].pv if ki_haupt and ki_haupt.gebaeude else False),
                    quelle="osm",
                )
                spec.gebaeude.append(base)
            else:
                klein = flaeche < 30
                spec.gebaeude.append(
                    Gebaeude(
                        id=f"neben{i}",
                        name=("Garage/Schuppen" if klein else f"Nebengebäude {i}"),
                        footprint=footprint,
                        etagen=1,
                        dach=Dach(form="flach" if klein else "sattel", neigung=10 if klein else 30),
                        wand_farbe="#c9c2b4",
                        dach_farbe="#5c5548",
                        fenster_anteil=0.0 if klein else 0.1,
                        quelle="osm",
                    )
                )
    else:
        # Ohne OSM: geschätztes Rechteck, optional auf echte Hausbreite skaliert
        breite, tiefe = 12.0, 10.0
        if haus_breite and haus_breite > 3:
            breite = haus_breite
            tiefe = breite * 0.85
            spec.meta.massstab_referenz = f"Hausbreite {haus_breite} m (manuell angegeben)"
        fp = [(-breite / 2, -tiefe / 2), (breite / 2, -tiefe / 2), (breite / 2, tiefe / 2), (-breite / 2, tiefe / 2)]
        if ki_haupt and ki_haupt.gebaeude:
            fp = [(x, z) for x, z in ki_haupt.gebaeude[0].footprint]
        spec.gebaeude.append(
            Gebaeude(
                id="haus",
                footprint=fp,
                etagen=(ki_haupt.gebaeude[0].etagen if ki_haupt and ki_haupt.gebaeude else 1),
                dach=(ki_haupt.gebaeude[0].dach if ki_haupt and ki_haupt.gebaeude else Dach()),
                wand_farbe=(ki_haupt.gebaeude[0].wand_farbe if ki_haupt and ki_haupt.gebaeude else "#e8e2d6"),
                dach_farbe=(ki_haupt.gebaeude[0].dach_farbe if ki_haupt and ki_haupt.gebaeude else "#704a3a"),
                pv=(ki_haupt.gebaeude[0].pv if ki_haupt and ki_haupt.gebaeude else False),
                quelle="ki" if ki_haupt else "manuell",
            )
        )

    # ---- Vegetation --------------------------------------------------------
    for b in (osm_roh or {}).get("baeume", [])[:40]:
        spec.vegetation.append(Baum(position=(b["x"], b["z"])))
    if ki_haupt:
        notizen.extend(ki_haupt.vegetation_hinweis)

    # ---- Wege --------------------------------------------------------------
    for w in (osm_roh or {}).get("wege", []):
        spec.wege.append(Weg(punkte=[(x, z) for x, z in w["punkte"]], breite=w.get("breite", 1.5), art=w.get("art", "weg")))

    # ---- Gruenflaeche als Grundstueck-Ersatz -------------------------------
    gruen = (osm_roh or {}).get("gruen", [])
    if gruen:
        # groesste Gruenflaeche, die den Hauptbau enthaelt (nah genug am Ursprung)
        haupt = spec.gebaeude[0].footprint
        hx = sum(p[0] for p in haupt) / len(haupt)
        hz = sum(p[1] for p in haupt) / len(haupt)
        kandidaten = [g for g in gruen if _punkt_in_polygon((hx, hz), [(x, z) for x, z in g["polygon"]])]
        if kandidaten:
            spec.grundstueck.polygon = [(x, z) for x, z in max(kandidaten, key=lambda g: _flaeche(g["polygon"]))["polygon"]]

    spec.meta.notizen = notizen
    if osm_roh:
        spec.meta.quellen.append("osm")
    for f in fragmente:
        spec.meta.quellen.append(f"ki:{f.zuverlaessigkeit}")
    spec.zentrieren()
    return spec


def _hauptgebaeude_fragment(fragmente: list[SpecFragment]) -> SpecFragment | None:
    for f in fragmente:
        if f.gebaeude:
            return f
    return None


def _flaeche(polygon: list[tuple[float, float]]) -> float:
    n = len(polygon)
    if n < 3:
        return 0.0
    s = 0.0
    for i in range(n):
        x1, z1 = polygon[i]
        x2, z2 = polygon[(i + 1) % n]
        s += x1 * z2 - x2 * z1
    return abs(s) / 2.0


def _punkt_in_polygon(punkt: tuple[float, float], polygon: list[tuple[float, float]]) -> bool:
    x, z = punkt
    drin = False
    n = len(polygon)
    for i in range(n):
        x1, z1 = polygon[i]
        x2, z2 = polygon[(i + 1) % n]
        if (z1 > z) != (z2 > z):
            sx = x1 + (z - z1) * (x2 - x1) / (z2 - z1)
            if sx > x:
                drin = not drin
    return drin
