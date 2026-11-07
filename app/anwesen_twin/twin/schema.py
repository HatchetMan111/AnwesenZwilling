"""SceneSpec — DER Vertrag zwischen OSM/KI-Fusion (Python) und der three.js-Engine (JS).

Koordinatensystem: lokale Meter, Ursprung = Grundstücksmitte.
  +x = Ost, -z = Nord (three.js-Konvention), +y = hoch.
Keine echten GPS-Koordinaten in dieser Struktur — Privacy by design.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

Vec2 = tuple[float, float]


class Dach(BaseModel):
    form: Literal["sattel", "walme", "flach", "pyramide"] = "sattel"
    neigung: float = Field(30, ge=5, le=60)          # Grad
    first_richtung: float = 0                        # Grad, 0 = First entlang +x (Ost-West)
    ueberstand: float = Field(0.4, ge=0, le=1.5)     # Meter


class Gebaeude(BaseModel):
    id: str
    name: str = "Haus"
    footprint: list[Vec2] = Field(min_length=3)      # Polygon, Meter, gegen Uhrzeigersinn
    etagen: int = Field(1, ge=0, le=4)
    etagen_hoehe: float = Field(2.7, ge=2.0, le=4.0)
    dach: Dach = Dach()
    wand_farbe: str = "#e8e2d6"
    dach_farbe: str = "#704a3a"
    fenster_anteil: float = Field(0.25, ge=0, le=0.7)
    tuer_seite: Literal["n", "o", "s", "w"] = "s"
    pv: bool = False
    quelle: Literal["osm", "ki", "manuell"] = "manuell"

    @field_validator("footprint")
    @classmethod
    def _geschlossenes_polygon(cls, v: list[Vec2]) -> list[Vec2]:
        if len(v) >= 3 and abs(v[0][0] - v[-1][0]) < 1e-6 and abs(v[0][1] - v[-1][1]) < 1e-6:
            v = v[:-1]
        return v


class Baum(BaseModel):
    position: Vec2
    hoehe: float = Field(6, ge=1, le=30)
    kronen_radius: float = Field(2.5, ge=0.5, le=8)
    art: Literal["laub", "nadel"] = "laub"


class Hecke(BaseModel):
    punkte: list[Vec2] = Field(min_length=2)
    hoehe: float = Field(1.2, ge=0.4, le=3)
    breite: float = Field(0.8, ge=0.3, le=2)


class Weg(BaseModel):
    punkte: list[Vec2] = Field(min_length=2)
    breite: float = Field(2.5, ge=0.5, le=8)
    art: Literal["zufahrt", "weg", "terrasse"] = "weg"
    farbe: Optional[str] = None                      # None = Standard-Textur je nach Art


class Grundstueck(BaseModel):
    polygon: Optional[list[Vec2]] = None             # optional — sonst grosser Rasen
    boden_farbe: str = "#7da05a"


class SzeneMeta(BaseModel):
    massstab_referenz: str = ""                      # z.B. "Hausbreite 12 m (manuell angegeben)"
    quellen: list[str] = []                          # z.B. ["osm", "ki:ollama/qwen2.5-vl:7b"]
    notizen: list[str] = []                          # KI-Beobachtungen, die nicht 1:1 in die Szene gingen


class SceneSpec(BaseModel):
    """Vollständige, engine-fertige Szenenbeschreibung."""
    version: int = 1
    grundstueck: Grundstueck = Grundstueck()
    gebaeude: list[Gebaeude] = []
    vegetation: list[Baum] = []
    hecken: list[Hecke] = []
    wege: list[Weg] = []
    meta: SzeneMeta = SzeneMeta()

    def zentrieren(self) -> None:
        """Verschiebt alles so, dass das HAUPTGEBÄUDE (erstes, größtes) bei (0,0) zentriert.
        Wird nach der Fusion aufgerufen — garantiert, dass keine absoluten Koordinaten
        im Speicher/Export landen (auch wenn osm.py sich vertan hätte)."""
        if not self.gebaeude:
            return
        fp = self.gebaeude[0].footprint
        cx = sum(p[0] for p in fp) / len(fp)
        cz = sum(p[1] for p in fp) / len(fp)
        if abs(cx) < 1e-9 and abs(cz) < 1e-9:
            return

        def shift(p: list[Vec2]) -> list[Vec2]:
            return [(x - cx, z - cz) for x, z in p]

        for g in self.gebaeude:
            g.footprint = shift(g.footprint)
        for b in self.vegetation:
            b.position = (b.position[0] - cx, b.position[1] - cz)
        for h in self.hecken:
            h.punkte = shift(h.punkte)
        for w in self.wege:
            w.punkte = shift(w.punkte)
        if self.grundstueck.polygon:
            self.grundstueck.polygon = shift(self.grundstueck.polygon)


class SpecFragment(BaseModel):
    """Was die KI pro Bild liefert — bewusst NUR Details, keine Koordinaten."""
    beschreibung: str = ""
    gebaeude: list[Gebaeude] = []     # footprint ignoriert bei bestehendem OSM-Abgleich
    vegetation_hinweis: list[str] = []  # z.B. ["3 grosse Laubbäume südlich", "Hecke am Nordrand"]
    sonstiges: str = ""
    zuverlaessigkeit: Literal["hoch", "mittel", "niedrig"] = "mittel"
