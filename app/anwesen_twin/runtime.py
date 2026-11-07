"""Laufzeit-Einstellungen: DB (Tabelle einstellungen) schlägt Env-Variablen.

So kann Phil Ollama-URL, Modelle und den OpenRouter-Key direkt im Dashboard
pflegen, ohne die Env-Datei anzufassen. Env-Werte bleiben als Default/Fallback
(z. B. setzt der Installer das Passwort weiter über /etc/anwesentwin).
"""
from __future__ import annotations

from .config import get_settings
from .db import connect

SCHLUESSEL = ("ollama_url", "ollama_model", "openrouter_key", "openrouter_model")


def _env_default(key: str) -> str:
    s = get_settings()
    return {
        "ollama_url": s.ollama_url,
        "ollama_model": s.ollama_model,
        "openrouter_key": s.openrouter_key,
        "openrouter_model": s.openrouter_model,
    }[key]


def hole(key: str) -> str:
    """DB-Wert, oder Env-Default wenn nicht gesetzt/leer."""
    if key not in SCHLUESSEL:
        raise KeyError(key)
    conn = connect()
    try:
        row = conn.execute("SELECT value FROM einstellungen WHERE key=?", (key,)).fetchone()
    finally:
        conn.close()
    if row and row["value"]:
        return row["value"]
    return _env_default(key)


def setze(key: str, value: str) -> None:
    if key not in SCHLUESSEL:
        raise KeyError(key)
    conn = connect()
    try:
        conn.execute(
            "INSERT INTO einstellungen (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )
        conn.commit()
    finally:
        conn.close()


def loeschen(key: str) -> None:
    """DB-Eintrag entfernen → Env-Default greift wieder."""
    if key not in SCHLUESSEL:
        raise KeyError(key)
    conn = connect()
    try:
        conn.execute("DELETE FROM einstellungen WHERE key=?", (key,))
        conn.commit()
    finally:
        conn.close()


def maske(key: str) -> str:
    """API-Key nur verschleiert zurückgeben, nie im Klartext."""
    if not key:
        return ""
    if len(key) <= 14:
        return "••••"
    return f"{key[:8]}…{key[-4:]}"
