"""OpenRouter-Adapter — schnelle, starke Vision-Modelle in der Cloud.

Achtung Datenschutz: Die Bildinhalte gehen an den jeweiligen Modell-Anbieter.
Nur verwenden, wenn das Projekt NICHT auf privacy_lokal steht.
"""
from __future__ import annotations

import httpx

from ..config import get_settings

API_URL = "https://openrouter.ai/api/v1/chat/completions"


class OpenRouterProvider:
    async def analysieren(self, prompt: str, bilder_b64: list[str], model: str) -> dict:
        s = get_settings()
        if not s.openrouter_key:
            raise RuntimeError("OPENROUTER_API_KEY ist nicht gesetzt (Env-Datei /etc/anwesentwin/anwesentwin.env)")
        nutz_modell = model or s.openrouter_model
        content: list[dict] = [{"type": "text", "text": prompt}]
        for b64 in bilder_b64:
            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
        payload = {
            "model": nutz_modell,
            "messages": [{"role": "user", "content": content}],
            "max_tokens": 2000,
            "temperature": 0.2,
        }
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                API_URL,
                json=payload,
                headers={"Authorization": f"Bearer {s.openrouter_key}"},
            )
            resp.raise_for_status()
            daten = resp.json()
        from .base import extrahiere_json

        try:
            inhalt = daten["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
            raise RuntimeError(f"Unerwartete OpenRouter-Antwort: {daten}") from e
        try:
            return extrahiere_json(inhalt)
        except ValueError:
            raise ValueError(f"OpenRouter ({nutz_modell}) lieferte kein JSON: {inhalt[:300]!r}")
