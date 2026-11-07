"""Testumgebung: isolierte DB/Data-Dirs pro Test, Settings-Cache leeren."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))


@pytest.fixture(autouse=True)
def isolierte_umgebung(tmp_path, monkeypatch):
    monkeypatch.setenv("ANWESENTWIN_DB", str(tmp_path / "test.db"))
    monkeypatch.setenv("ANWESENTWIN_DATA", str(tmp_path / "daten"))
    monkeypatch.setenv("ANWESENTWIN_SECRET", "test-secret")
    monkeypatch.setenv("ANWESENTWIN_PASSWORD", "test-pass")
    from anwesen_twin.config import get_settings

    get_settings.cache_clear()
    from anwesen_twin import db

    db.init_db()
    yield
    get_settings.cache_clear()
