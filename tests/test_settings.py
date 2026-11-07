"""Laufzeit-Einstellungen: DB schlägt Env, Key wird nur maskiert zurückgegeben."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from anwesen_twin.main import app

    with TestClient(app) as c:
        r = c.post("/api/login", json={"password": "test-pass"})
        assert r.status_code == 200
        yield c


def test_settings_brauchen_auth(client):
    from anwesen_twin.main import app  # noqa: F401
    roh = TestClient(app)
    assert roh.get("/api/settings").status_code == 401
    assert roh.put("/api/settings", json={"ollama_url": "http://x"}).status_code == 401


def test_ollama_url_aendern(client):
    r = client.put("/api/settings", json={"ollama_url": "http://192.168.1.77:11434/"})
    d = r.json()
    assert r.status_code == 200
    assert d["ollama_url"] == "http://192.168.1.77:11434"  # Slash entfernt


def test_key_wird_nur_maskiert(client):
    geheim = "sk-or-v1-abcdef1234567890abcdef1234567890"
    client.put("/api/settings", json={"openrouter_key": geheim})
    d = client.get("/api/settings").json()
    assert d["openrouter_aktiv"] is True
    assert geheim not in d["openrouter_key_maskiert"]
    assert d["openrouter_key_maskiert"].startswith("sk-or-v1")
    assert "…" in d["openrouter_key_maskiert"]


def test_key_leerer_string_loescht(client):
    client.put("/api/settings", json={"openrouter_key": "sk-or-v1-abcdef1234567890abcdef1234567890"})
    client.put("/api/settings", json={"openrouter_key": ""})
    d = client.get("/api/settings").json()
    assert d["openrouter_aktiv"] is False


def test_key_none_ist_unveraendert(client):
    client.put("/api/settings", json={"openrouter_key": "sk-or-v1-abcdef1234567890abcdef1234567890"})
    client.put("/api/settings", json={"ollama_model": "gemma3:12b"})
    assert client.get("/api/settings").json()["openrouter_aktiv"] is True


def test_test_ollama_nicht_erreichbar(client):
    client.put("/api/settings", json={"ollama_url": "http://127.0.0.1:1"})
    d = client.post("/api/settings/test-ollama").json()
    assert d["erreichbar"] is False
    assert d["fehler"]


def test_runtime_hole_env_fallback(client):
    """Ohne DB-Eintrag greift der Env-Default (ANWESENTWIN-Env bzw. Built-in)."""
    from anwesen_twin import runtime

    wert = runtime.hole("ollama_model")
    assert wert  # Env-Default oder DB — nie leer-krachen


def test_openrouter_test_ohne_key(client):
    client.put("/api/settings", json={"openrouter_key": ""})
    d = client.post("/api/settings/test-openrouter").json()
    assert d["gueltig"] is False
    assert "kein" in d["fehler"].lower()
