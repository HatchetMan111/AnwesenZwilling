"""SceneSpec: Validierung, Rundtrip, Zentrieren."""
from __future__ import annotations

import json

import pytest

from anwesen_twin.twin.schema import Dach, Gebaeude, SceneSpec


def rechteck(x0, z0, x1, z1):
    return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]


def test_gebaeude_valid():
    g = Gebaeude(id="haus", footprint=rechteck(-5, -4, 5, 4), etagen=2)
    assert g.etagen == 2
    assert g.dach.form == "sattel"


def test_geschlossenes_polygon_wird_geoeffnet():
    g = Gebaeude(id="haus", footprint=rechteck(-5, -4, 5, 4) + [[-5, -4]])
    assert len(g.footprint) == 4


def test_zu_wenig_punkte_invalid():
    with pytest.raises(Exception):
        Gebaeude(id="haus", footprint=[[0, 0], [1, 1]])


def test_rundtrip_json():
    spec = SceneSpec(gebaeude=[Gebaeude(id="haus", footprint=rechteck(-5, -4, 5, 4), dach=Dach(form="walme", neigung=40))])
    klon = SceneSpec.model_validate_json(spec.model_dump_json())
    assert klon.gebaeude[0].dach.neigung == 40


def test_zentrieren_verschiebt_auf_null():
    spec = SceneSpec(gebaeude=[Gebaeude(id="haus", footprint=rechteck(10, 20, 30, 40))])
    spec.zentrieren()
    fp = spec.gebaeude[0].footprint
    cx = sum(p[0] for p in fp) / 4
    cz = sum(p[1] for p in fp) / 4
    assert abs(cx) < 1e-9 and abs(cz) < 1e-9
    # Seitenlängen bleiben erhalten
    assert abs((fp[1][0] - fp[0][0]) - 20) < 1e-9


def test_zentrieren_verschiebt_alles_mit():
    spec = SceneSpec(
        gebaeude=[Gebaeude(id="haus", footprint=rechteck(10, 10, 20, 20))],
        vegetation=[{"position": [50, 50], "hoehe": 5, "kronen_radius": 2}],
        wege=[{"punkte": [[10, 30], [10, 40]], "breite": 2}],
    )
    spec.zentrieren()
    assert spec.vegetation[0].position == (35, 35)   # relativ zum Hauszentrum (15,15)
    assert spec.wege[0].punkte[0] == (-5, 15)


def test_json_kompatibel_zu_engine_format():
    """Das, was die Engine erwartet (Lists, Strings), bleibt nach dem Rundtrip erhalten."""
    spec = SceneSpec(gebaeude=[Gebaeude(id="haus", footprint=rechteck(-5, -4, 5, 4), pv=True)])
    d = json.loads(spec.model_dump_json())
    assert isinstance(d["gebaeude"][0]["footprint"][0], list)
    assert d["gebaeude"][0]["pv"] is True
