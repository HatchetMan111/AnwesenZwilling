"""Fusion: OSM-Footprints + KI-Fragmente → SceneSpec."""
from __future__ import annotations

from anwesen_twin.twin.fusion import fusioniere
from anwesen_twin.twin.schema import SpecFragment

OSM = {
    "gebaeude": [
        {"footprint": [[10, 10], [30, 10], [30, 22], [10, 22]], "tags": {"building": "house"}},  # groß
        {"footprint": [[-8, -6], [-2, -6], [-2, -2], [-8, -2]], "tags": {"building": "garage"}},  # 24 m²
        {"footprint": [[-20, 30], [-10, 30], [-10, 42], [-20, 42]], "tags": {"building": "barn"}},  # 120 m²
    ],
    "baeume": [{"x": 40, "z": -10}, {"x": -30, "z": 5}],
    "wege": [{"punkte": [[0, 50], [0, 20]], "art": "zufahrt", "breite": 3}],
    "gruen": [{"polygon": [[-50, -50], [50, -50], [50, 60], [-50, 60]], "art": "grass"}],
}


def fragment(**kw):
    basis = {
        "beschreibung": "Weißes Haus mit rotem Dach",
        "gebaeude": [{
            "id": "haus", "name": "Hauptgebäude",
            "footprint": [[0, 0], [1, 0], [1, 1], [0, 1]],  # wird durch OSM ersetzt
            "etagen": 2, "wand_farbe": "#f5f0e8", "dach_farbe": "#8a2a2a",
            "pv": True, "quelle": "ki",
        }],
        "vegetation_hinweis": ["3 große Laubbäume südlich"],
        "zuverlaessigkeit": "hoch",
    }
    basis.update(kw)
    return SpecFragment.model_validate(basis)


def test_osm_gebaeude_landen_in_spec():
    spec = fusioniere(OSM, [])
    assert len(spec.gebaeude) == 3
    haupt = spec.gebaeude[0]
    assert haupt.id == "haus"
    assert haupt.quelle == "osm"
    assert len(spec.gebaeude[1].footprint) == 4
    # Nach Fläche sortiert: [1] = 120 m² Scheune (Sattel), [2] = 24 m² Garage (Flachdach)
    assert spec.gebaeude[1].dach.form == "sattel"
    assert spec.gebaeude[2].dach.form == "flach"


def test_ki_details_am_hauptgebaeude():
    spec = fusioniere(OSM, [fragment()])
    haupt = spec.gebaeude[0]
    assert haupt.etagen == 2
    assert haupt.wand_farbe == "#f5f0e8"
    assert haupt.pv is True
    # Footprint bleibt OSM, nicht der KI-Schätzwürfel
    assert max(p[0] for p in haupt.footprint) > 5


def test_ohne_osm_gibt_es_default_haus():
    spec = fusioniere(None, [])
    assert len(spec.gebaeude) == 1
    assert spec.gebaeude[0].quelle == "manuell"
    assert spec.meta.massstab_referenz == ""


def test_haus_breite_skaliert():
    spec = fusioniere(None, [], haus_breite=15)
    fp = spec.gebaeude[0].footprint
    breite = max(p[0] for p in fp) - min(p[0] for p in fp)
    assert abs(breite - 15) < 1e-6
    assert "15 m" in spec.meta.massstab_referenz


def test_alles_ist_zentriert():
    """Hauptgebäude sitzt nach der Fusion bei (0,0)."""
    spec = fusioniere(OSM, [fragment()])
    haupt = spec.gebaeude[0]
    cx = sum(p[0] for p in haupt.footprint) / len(haupt.footprint)
    cz = sum(p[1] for p in haupt.footprint) / len(haupt.footprint)
    assert abs(cx) < 1e-6 and abs(cz) < 1e-6


def test_keine_absoluten_koordinaten_uebrig():
    """Privacy-Kernversprechen: Nach der Fusion sind große Weltkoordinaten weg."""
    spec = fusioniere(OSM, [fragment()])
    for g in spec.gebaeude:
        for x, z in g.footprint:
            assert abs(x) < 1000 and abs(z) < 1000
    # Wege/Bäume bewegen sich mit
    for b in spec.vegetation:
        assert abs(b.position[0]) < 1000
    for w in spec.wege:
        for x, z in w.punkte:
            assert abs(z) < 1000
    assert spec.meta.quellen
