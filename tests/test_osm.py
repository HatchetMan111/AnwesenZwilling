"""OSM-Helfer: GPS→lokale Meter, Polygonfläche."""
from __future__ import annotations

from anwesen_twin.osm import _lokal_transformieren, _polygon_flaeche


def test_transform_ursprung_ist_null():
    assert _lokal_transformieren(49.0, 8.0, 49.0, 8.0) == (0.0, 0.0)


def test_transform_osten_ist_plus_x():
    # eine Bogensekunde Longitude ≈ 30.9 m am Äquator ... bei 49° ca. 20.3 m
    x, z = _lokal_transformieren(49.0, 8.0, 49.0, 8.0 + 1 / 3600)
    assert x > 15  # deutlich östlich
    assert abs(z) < 0.1


def test_transform_norden_ist_minus_z():
    x, z = _lokal_transformieren(49.0, 8.0, 49.0 + 1 / 3600, 8.0)
    assert -35 < z < -25  # eine Bogensekunde Breite ≈ 30.8 m → -z (Nord)
    assert abs(x) < 0.1


def test_flaeche_rechteck():
    r = [(0, 0), (10, 0), (10, 8), (0, 8)]
    assert _polygon_flaeche(r) == 80.0


def test_flaeche_uhrzeigersinn_gleich():
    r = [(0, 8), (10, 8), (10, 0), (0, 0)]
    assert _polygon_flaeche(r) == 80.0
