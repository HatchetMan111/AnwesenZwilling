"""Export: standalone HTML enthält Engine + Spec, aber keine GPS-Koordinaten."""
from __future__ import annotations

import json

import pytest

from anwesen_twin.export import baue_html
from anwesen_twin.twin.schema import Gebaeude, SceneSpec


def spec():
    return SceneSpec(
        gebaeude=[Gebaeude(id="haus", footprint=[[-5, -4], [5, -4], [5, 4], [-5, 4]], pv=True)],
        grundstueck={"polygon": [[-20, -18], [20, -18], [20, 18], [-20, 18]]},
    )


def test_html_enthaelt_engine_und_daten():
    html = baue_html(spec(), titel="Test-Anwesen")
    assert "window.__TWIN_DATA__" in html
    assert "Test-Anwesen" in html
    # Engine-Bundle (three.js) ist inline: Datei deutlich größer als nur die Spec
    assert len(html) > 400_000


def test_html_spec_ist_valides_json():
    import re

    html = baue_html(spec())
    m = re.search(r"window\.__TWIN_DATA__ = (\{.*?\});\n", html, re.DOTALL)
    daten = json.loads(m.group(1).replace("<\\/", "</"))
    assert daten["gebaeude"][0]["pv"] is True


def test_keine_script_sprache_in_daten():
    """'</' in der Spec darf das Script-Tag nicht sprengen können."""
    s = spec()
    s.meta.notizen = ["</script><b>xss</b>"]
    html = baue_html(s)
    assert "</script><b>xss</b>" not in html.split("window.__TWIN_DATA__")[1].split("</script>")[0]


def test_kein_gps_in_der_html():
    """Die SceneSpec hat schlicht keine lat/lon-Felder — der Export darf sie nicht erfinden."""
    import re

    html = baue_html(spec(), titel="X")
    m = re.search(r"window\.__TWIN_DATA__ = (\{.*?\});\n", html, re.DOTALL)
    daten = json.loads(m.group(1).replace("<\\/", "</"))
    assert "lat" not in daten and "lon" not in daten
    assert "gps" not in json.dumps(daten).lower()
