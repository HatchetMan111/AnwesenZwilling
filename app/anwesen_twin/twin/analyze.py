"""Bild → KI → validiertes SpecFragment.

Resized die Bilder serverseitig runter (Datensparsamkeit: nicht das Original
schicken), baut den deutschen Analyse-Prompt, validiert die Antwort und
versucht bei kaputtem JSON genau einen Reparatur-Durchlauf.
"""
from __future__ import annotations

import base64
import io

from PIL import Image
from pydantic import ValidationError

from ..llm.base import provider_fuer
from .schema import SpecFragment

MAX_BILDER = 5
MAX_KANTE = 1024

PROMPT = """Du bist ein Experte für Gebäudeanalyse aus Luft- und Bodenfotos.
Analysiere die mitgelieferten Bilder EINES Anwesens und beschreibe es als JSON.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt nach genau diesem Schema (kein weiterer Text):

{
  "beschreibung": "kurze Zusammenfassung des Anwesens",
  "gebaeude": [
    {
      "id": "haus",
      "name": "Hauptgebäude oder Garage/Carport/Scheune/Schuppen ...",
      "footprint": [[0,0],[10,0],[10,8],[0,8]],
      "etagen": 2,
      "etagen_hoehe": 2.7,
      "dach": {"form": "sattel|walme|flach|pyramide", "neigung": 30, "first_richtung": 0, "ueberstand": 0.4},
      "wand_farbe": "#rrggbb",
      "dach_farbe": "#rrggbb",
      "fenster_anteil": 0.25,
      "tuer_seite": "n|o|s|w",
      "pv": true,
      "quelle": "ki"
    }
  ],
  "vegetation_hinweis": ["z.B. '3 grosse Laubbäume südlich des Hauses'"],
  "sonstiges": "Carport, Pool, Spielplatz, Zäune, ... falls sichtbar",
  "zuverlaessigkeit": "hoch|mittel|niedrig"
}

Regeln:
- footprint nur als GROBE Schätzung in Metern (wird durch OSM-Daten ersetzt, wenn vorhanden) —
  wichtig sind vor allem relative Größenverhältnisse der Gebäude zueinander.
- Dachform: sattel = zwei geneigte Flächen mit First, walme = Sattel mit abgeschnittenen Giebeln,
  flach = Flachdach, pyramide = viergeneigt ohne First.
- first_richtung in Grad: 0 = First verläuft Ost-West, 90 = Nord-Süd.
- fenster_anteil = grober Anteil der Wandfläche, der Fenster ist.
- Falls ein Detail nicht erkennbar ist, nimm eine plausible Schätzung und senke "zuverlaessigkeit".
- Alle Farben als Hexcodes, realistisch gewählt."""


def _bild_zu_b64(pfad, max_kante: int = MAX_KANTE) -> str:
    """Bild laden, auf max_kante verkleinern, als JPEG-Base64 zurückgeben."""
    img = Image.open(pfad)
    img = img.convert("RGB")
    img.thumbnail((max_kante, max_kante), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode()


async def analysiere_bilder(bild_pfade: list[str], provider_name: str, model: str = "") -> SpecFragment:
    """Schickt bis zu MAX_BILDER Bilder an den Provider und validiert das Fragment."""
    from ..config import get_settings

    s = get_settings()
    if provider_name == "openrouter" and len(bild_pfade) > 0:
        pass  # bewusst erlaubt — die API-Schicht ruft hier nur auf, wenn das Projekt es erlaubt

    pfade = bild_pfade[:MAX_BILDER]
    bilder_b64 = [_bild_zu_b64(p) for p in pfade]
    provider = provider_fuer(provider_name)

    letzter_fehler: Exception | None = None
    for versuch in range(2):
        prompt = PROMPT
        if versuch == 1 and letzter_fehler:
            prompt += f"\n\nWICHTIG: Dein vorheriger Versuch war kein gültiges JSON ({letzter_fehler}). Antworte NUR mit dem JSON-Objekt."
        raw = await provider.analysieren(prompt, bilder_b64, model)
        try:
            return SpecFragment.model_validate(raw)
        except ValidationError as e:
            letzter_fehler = e
    raise ValueError(f"KI-Antwort zweimal invalide: {letzter_fehler}")


def provider_erlaubt(provider_name: str, privacy_lokal: bool) -> bool:
    """Cloud-Provider blockieren, wenn das Projekt auf 'nur lokal' steht."""
    if not privacy_lokal:
        return True
    return provider_name == "ollama"
