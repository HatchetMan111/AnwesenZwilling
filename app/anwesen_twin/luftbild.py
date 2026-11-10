"""Luftbild (Satellitenbild der Umgebung) als realer Bodenteppich.

Quellen:
  esri   — Esri World Imagery Kacheln (kostenlos, kein Key, Attribution nötig)
  google — Google Static Maps (braucht bezahlten API-Key, in den Einstellungen)

Privacy: Der Abruf schickt die Koordinaten an den Karten-Dienst — passiert nur
auf ausdrückliche Nutzer-Aktion. Das Bild wird lokal unter media/ gespeichert;
in der Spec/dem Export gibt es KEINE Koordinaten, nur das Bild selbst.

Geometrie: Kacheln sind slippy-map-konform (Web-Mercator), Bild ist exakt
Nord-oben ausgerichtet → passt direkt zu +x = Ost, −z = Nord.
"""
from __future__ import annotations

import io
import math
import uuid

import httpx
from PIL import Image

KACHEL_GROESSE = 256
ZOOM = 18
RASTER = 3  # 3×3 Kacheln um den Zentrumspunkt

ESRI_KACHEL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
GOOGLE_STATIC = "https://maps.googleapis.com/maps/api/staticmap"


def tile_xy(lat: float, lon: float, zoom: int = ZOOM) -> tuple[int, int]:
    """lat/lon → Slippy-Map-Kachelkoordinaten (Web-Mercator)."""
    n = 2 ** zoom
    x = (lon + 180.0) / 360.0 * n
    lat_rad = math.radians(lat)
    y = (1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * n
    return int(x % n), int(min(max(y, 0), n - 1))


def meter_pro_pixel(lat: float, zoom: int = ZOOM) -> float:
    """Web-Mercator: Meter pro Pixel auf diesem Breitengrad."""
    return 156543.03392 * math.cos(math.radians(lat)) / (2 ** zoom)


async def hole_luftbild(
    lat: float,
    lon: float,
    quelle: str = "esri",
    google_key: str = "",
) -> tuple[bytes, float]:
    """Lädt das Satellitenbild um den Punkt. Rückgabe: (JPEG-Bytes, Bildbreite in Metern).

    Das Zentrum des Bildes liegt exakt auf (lat, lon).
    """
    if quelle == "google":
        if not google_key:
            raise ValueError("Google-Maps-Key fehlt (Einstellungen)")
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(GOOGLE_STATIC, params={
                "center": f"{lat},{lon}",
                "zoom": ZOOM,
                "size": f"{KACHEL_GROESSE * RASTER}x{KACHEL_GROESSE * RASTER}",
                "maptype": "satellite",
                "key": google_key,
            })
            r.raise_for_status()
            img = Image.open(io.BytesIO(r.content)).convert("RGB")
    elif quelle == "esri":
        tx, ty = tile_xy(lat, lon)
        halbe = RASTER // 2
        stich = Image.new("RGB", (KACHEL_GROESSE * RASTER, KACHEL_GROESSE * RASTER))
        async with httpx.AsyncClient(timeout=30, headers={"User-Agent": "AnwesenTwin/0.2"}) as client:
            for dy in range(-halbe, halbe + 1):
                for dx in range(-halbe, halbe + 1):
                    url = ESRI_KACHEL.format(z=ZOOM, y=ty + dy, x=tx + dx)
                    r = await client.get(url)
                    r.raise_for_status()
                    kachel = Image.open(io.BytesIO(r.content)).convert("RGB")
                    stich.paste(kachel, ((dx + halbe) * KACHEL_GROESSE, (dy + halbe) * KACHEL_GROESSE))
        img = stich
    else:
        raise ValueError(f"Unbekannte Luftbild-Quelle: {quelle}")

    laenge_m = img.width * meter_pro_pixel(lat)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return buf.getvalue(), laenge_m


def speichere_luftbild(media_dir, projekt_id: int, daten: bytes) -> str:
    """Bild lokal ablegen → Dateiname (mit Projekt-Präfix, damit Projekt-Löschung mit räumt)."""
    name = f"{projekt_id}_luftbild_{uuid.uuid4().hex[:8]}.jpg"
    (media_dir / name).write_bytes(daten)
    return name
