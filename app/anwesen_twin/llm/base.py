"""Gemeinsames Interface der KI-Provider + robuster JSON-Parser.

Beide Adapter bekommen dasselbe rein (Prompt + Base64-Bilder) und müssen ein
JSON-Dict zurückgeben. Bilder verlassen den Rechner nur beim gewählten Provider —
Ollama schickt nichts ins Internet, OpenRouter in die Cloud.
"""
from __future__ import annotations

import json
import re
from typing import Protocol


class VisionProvider(Protocol):
    async def analysieren(self, prompt: str, bilder_b64: list[str], model: str) -> dict:
        ...


def extrahiere_json(text: str) -> dict:
    """Zieht das JSON-Objekt aus der Modellantwort (verträgt ```-Blöcke und Geplauder)."""
    text = text.strip()
    # Codefence bevorzugt
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        text = m.group(1)
    else:
        start, ende = text.find("{"), text.rfind("}")
        if start == -1 or ende <= start:
            raise ValueError(f"Kein JSON in der Antwort gefunden: {text[:200]!r}")
        text = text[start : ende + 1]
    return json.loads(text)


def provider_fuer(name: str):
    from . import ollama, openrouter

    if name == "ollama":
        return ollama.OllamaProvider()
    if name == "openrouter":
        return openrouter.OpenRouterProvider()
    raise ValueError(f"Unbekannter Provider: {name}")
