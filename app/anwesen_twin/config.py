"""Konfiguration über Umgebungsvariablen (12-Factor-Light, wie offers_dashboard).

Alle Pfade haben Dev-Defaults relativ zum Projektordner; im LXC setzen sie
systemd (StateDirectory=/var/lib/anwesentwin) und die Env-Datei /etc/anwesentwin.
"""
from __future__ import annotations

import os
import secrets
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class Settings:
    def __init__(self) -> None:
        self.db_path: Path = Path(os.environ.get("ANWESENTWIN_DB", ROOT / "data" / "anwesentwin.db"))
        self.data_dir: Path = Path(os.environ.get("ANWESENTWIN_DATA", ROOT / "data"))
        self.media_dir: Path = self.data_dir / "media"
        # Login-Passwort; der Installer generiert ein Zufallspasswort in /etc/anwesentwin/anwesentwin.env
        self.password: str = os.environ.get("ANWESENTWIN_PASSWORD", "admin")
        self.session_secret: str = os.environ.get(
            "ANWESENTWIN_SECRET", ""
        ) or secrets.token_hex(32)  # fehlt die Env, pro Boot neu (mit Warnung beim Start)
        # KI-Backends — beides optional konfigurierbar, Umschalter sitzt im Projekt
        self.ollama_url: str = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
        self.ollama_model: str = os.environ.get("OLLAMA_MODEL", "qwen2.5-vl:7b")
        self.openrouter_key: str = os.environ.get("OPENROUTER_API_KEY", "")
        self.openrouter_model: str = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.0-flash-001")
        self.host: str = os.environ.get("ANWESENTWIN_HOST", "127.0.0.1")
        self.port: int = int(os.environ.get("ANWESENTWIN_PORT", "8768"))
        # Upload-Limits (angelehnt an die Signage-App)
        self.max_upload_mb: int = int(os.environ.get("ANWESENTWIN_MAX_MB", "30"))

    def ensure_dirs(self) -> None:
        self.media_dir.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.ensure_dirs()
    if not os.environ.get("ANWESENTWIN_SECRET"):
        print("WARNUNG: ANWESENTWIN_SECRET nicht gesetzt — Session-Secret wird pro Boot neu gewürfelt, "
              "Logins überleben keinen Neustart. Der Installer setzt die Env-Datei.", flush=True)
    return s
