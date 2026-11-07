"""SQLite-Zugriff: eine Datei, WAL-Modus, Migrationen beim Start."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .config import get_settings

MIGRATIONEN = sorted((Path(__file__).resolve().parents[2] / "migrations").glob("0*.sql"))


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    """Neue Verbindung pro Aufruf — WAL erlaubt parallele Reader, Schreiber serialisiert SQLite selbst."""
    conn = sqlite3.connect(get_settings().db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    get_settings().db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        for pfad in MIGRATIONEN:
            conn.executescript(pfad.read_text(encoding="utf-8"))
        conn.commit()
    finally:
        conn.close()


def row_to_dict(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in row.keys()}
