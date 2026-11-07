"""OSM-Abgleich über die Overpass-API.

Privacy: Das Ergebnis wird SOFORT in lokale Meter-Koordinaten transformiert
(Ursprung = übergebener Punkt). GPS-Daten leben nur innerhalb dieser Funktion;
gespeichert wird ausschließlich der lokale JSON-Schnappschuss (osm_roh).
"""
from __future__ import annotations

import asyncio
import math
from typing import Any

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Meter pro Grad (equirectangulär reicht bei ≤200 m Abstand völlig)
M_PRO_GRAD_LAT = 110_540.0


def _lokal_transformieren(lat0: float, lon0: float, lat: float, lon: float) -> tuple[float, float]:
    """GPS → lokale Meter. +x = Ost, -z = Nord (three.js-Konvention)."""
    m_pro_grad_lon = 111_320.0 * math.cos(math.radians(lat0))
    x = (lon - lon0) * m_pro_grad_lon
    z = -(lat - lat0) * M_PRO_GRAD_LAT
    return round(x, 2), round(z, 2)


async def hole_umgebung(lat: float, lon: float, radius_m: int = 80) -> dict[str, Any]:
    """Fragt Overpass nach Gebäuden, Bäumen, Wegen und Grünflächen um den Punkt ab.

    Rückgabe (alles bereits lokal in Meter, bezogen auf lat/lon als Ursprung):
      { gebaeude: [{footprint:[[x,z]...], tags:{}}], baeume: [{x,z}],
        wege: [{punkte:[[x,z]...], art}], gruen: [{polygon:[[x,z]...], art}] }
    """
    query = f"""[out:json][timeout:25];
(
  way["building"](around:{radius_m},{lat},{lon});
  node["natural"="tree"](around:{radius_m},{lat},{lon});
  way["highway"~"^(driveway|path|footway|service|track)$"](around:{radius_m},{lat},{lon});
  way["landuse"~"^(grass|meadow|village_green|forest|orchard)$"](around:{radius_m},{lat},{lon});
);
out geom;"""
    async with httpx.AsyncClient(timeout=40) as client:
        resp = await client.post(
            OVERPASS_URL,
            data={"data": query},
            headers={"User-Agent": "AnwesenTwin/0.1 (self-hosted)"},
        )
        resp.raise_for_status()
        elemente = resp.json().get("elements", [])

    ergebnis: dict[str, Any] = {"gebaeude": [], "baeume": [], "wege": [], "gruen": []}
    for el in elemente:
        tags = el.get("tags", {})
        if el["type"] == "node" and "natural" in tags and tags["natural"] == "tree":
            x, z = _lokal_transformieren(lat, lon, el["lat"], el["lon"])
            ergebnis["baeume"].append({"x": x, "z": z})
            continue
        if el["type"] != "way" or "geometry" not in el:
            continue
        punkte = [_lokal_transformieren(lat, lon, g["lat"], g["lon"]) for g in el["geometry"]]

        if "building" in tags:
            footprint = punkte[:-1] if len(punkte) > 3 and punkte[0] == punkte[-1] else punkte
            if _polygon_flaeche(footprint) < 4:  # < 4 m² = Müll (Punkte/Pfosten)
                continue
            ergebnis["gebaeude"].append({"footprint": footprint, "tags": {k: v for k, v in tags.items() if k.startswith("building")}})
        elif "highway" in tags:
            art = "zufahrt" if tags.get("highway") == "driveway" else "weg"
            ergebnis["wege"].append({"punkte": punkte, "art": art, "breite": 3.0 if art == "zufahrt" else 1.2})
        elif "landuse" in tags:
            polygon = punkte[:-1] if len(punkte) > 3 and punkte[0] == punkte[-1] else punkte
            ergebnis["gruen"].append({"polygon": polygon, "art": tags.get("landuse", "grass")})

    return ergebnis


def _polygon_flaeche(polygon: list[tuple[float, float]]) -> float:
    """Shoelace-Formel, Betragsfläche in m²."""
    n = len(polygon)
    if n < 3:
        return 0.0
    s = 0.0
    for i in range(n):
        x1, z1 = polygon[i]
        x2, z2 = polygon[(i + 1) % n]
        s += x1 * z2 - x2 * z1
    return abs(s) / 2.0
