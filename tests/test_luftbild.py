"""Luftbild: Kachel-Mathe + Bildbreite."""
from __future__ import annotations

import math

from anwesen_twin.luftbild import meter_pro_pixel, tile_xy


def test_tile_xy_nullinsel():
    # Berchtesgaden-Lage grob: Tile-XY muss in zoom-18-Raum liegen
    x, y = tile_xy(47.6, 13.0)
    assert 0 <= x < 2 ** 18 and 0 <= y < 2 ** 18


def test_tile_xy_aequator_norden():
    x, y = tile_xy(0.0, 0.0, zoom=1)
    assert x == 1 and y == 1  # Mitte des 2×2-Kachelraums bei zoom 1
    x18, y18 = tile_xy(0.0, 0.0)
    assert x18 == 2 ** 17 and y18 == 2 ** 17  # exakt die Mitte bei zoom 18


def test_meter_pro_pixel_zoom18():
    m = meter_pro_pixel(49.0)
    erwartet = 156543.03392 * math.cos(math.radians(49)) / 2 ** 18
    assert abs(m - erwartet) < 1e-9
    assert 0.3 < m < 0.5  # grob 40 cm/Pixel auf 768px → ~300 m Bildbreite


def test_meter_pro_pixel_skaliert_mit_zoom():
    assert meter_pro_pixel(50.0, 19) == meter_pro_pixel(50.0, 18) / 2
