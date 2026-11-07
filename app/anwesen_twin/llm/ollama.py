"""Ollama-Adapter — Bilder bleiben im Haus.

Erwartet eine laufende Ollama-Instanz (Host, VM oder eigener Container);
URL und Modell kommen aus den Laufzeit-Einstellungen (Dashboard) bzw. der Env.
"""
from __future__ import annotations

import httpx

from .. import runtime


class OllamaProvider:
    async def analysieren(self, prompt: str, bilder_b64: list[str], model: str) -> dict:
        url = runtime.hole("ollama_url").rstrip("/")
        nutz_modell = model or runtime.hole("ollama_model")
        payload = {
            "model": nutz_modell,
            "messages": [{"role": "user", "content": prompt, "images": bilder_b64}],
            "stream": False,
            "options": {"temperature": 0.2, "num_predict": 2000},
        }
        # Vision auf CPU kann dauern — großzügiges Timeout
        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(f"{url}/api/chat", json=payload)
            resp.raise_for_status()
            daten = resp.json()
        from .base import extrahiere_json

        inhalt = daten.get("message", {}).get("content", "")
        try:
            return extrahiere_json(inhalt)
        except ValueError:
            raise ValueError(f"Ollama ({nutz_modell}) lieferte kein JSON: {inhalt[:300]!r}")
