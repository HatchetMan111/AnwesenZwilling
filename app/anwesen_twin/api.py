"""REST-API. Stil wie die Signage-App: /api/* liefert {status:"ok"/"error", ...},
401 als JSON für fetch-Aufrufe (Redirect macht hier das Frontend).
Auth: HMAC-signiertes Session-Cookie, Passwort aus der Env (LAN-Tool, ein Nutzer).
"""
from __future__ import annotations

import hashlib
import hmac
import io
import json
import time
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field

from . import osm, runtime
from .config import get_settings
from .db import connect, row_to_dict, utc_now
from .export import baue_html
from .llm.base import provider_fuer
from .twin.analyze import analysiere_bilder, provider_erlaubt
from .twin.fusion import fusioniere
from .twin.schema import SceneSpec, SpecFragment

router = APIRouter(prefix="/api")

ERLAUBTE_ENDUNGEN = {"jpg", "jpeg", "png", "webp"}
COOKIE = "anwesentwin_session"
SESSION_STUNDEN = 12


# --------------------------------------------------------------------------
# Auth-Helfer
# --------------------------------------------------------------------------

def _sign(wert: str) -> str:
    return hmac.new(get_settings().session_secret.encode(), wert.encode(), hashlib.sha256).hexdigest()


def _mache_token() -> str:
    lauft_ab = str(int(time.time()) + SESSION_STUNDEN * 3600)
    return f"{lauft_ab}.{_sign(lauft_ab)}"


def _token_ok(token: str | None) -> bool:
    if not token or "." not in token:
        return False
    lauft_ab, sig = token.split(".", 1)
    if not hmac.compare_digest(sig, _sign(lauft_ab)):
        return False
    return int(lauft_ab) > time.time()


def ist_angemeldet(request: Request) -> bool:
    return _token_ok(request.cookies.get(COOKIE))


def _401(detail: str = "Nicht angemeldet"):
    return HTTPException(status_code=401, detail=detail)


async def brauche_admin(request: Request) -> None:
    if not ist_angemeldet(request):
        raise _401()


class LoginIn(BaseModel):
    password: str


class ProjektIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ProjektUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    privacy_lokal: bool | None = None


class AnalyseIn(BaseModel):
    provider: str = "ollama"
    model: str = ""


class SpecIn(BaseModel):
    spec: dict


class RefusionIn(BaseModel):
    haus_breite: float | None = Field(default=None, gt=3, le=100)


# --------------------------------------------------------------------------
# Auth-Routen
# --------------------------------------------------------------------------

@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/whoami")
async def whoami(request: Request):
    return {"status": "ok", "angemeldet": ist_angemeldet(request)}


@router.post("/login")
async def login(inp: LoginIn, response: Response):
    s = get_settings()
    if not hmac.compare_digest(inp.password, s.password):
        raise _401("Falsches Passwort")
    response.set_cookie(COOKIE, _mache_token(), httponly=True, samesite="lax", max_age=SESSION_STUNDEN * 3600)
    return {"status": "ok"}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE)
    return {"status": "ok"}


@router.get("/settings")
async def settings_info(_: None = Depends(brauche_admin)):
    return _settings_payload()


def _settings_payload() -> dict:
    """Nur Nicht-Geheimnisse fürs Frontend; der API-Key kommt maskiert zurück."""
    key = runtime.hole("openrouter_key")
    return {
        "status": "ok",
        "ollama_url": runtime.hole("ollama_url"),
        "ollama_model": runtime.hole("ollama_model"),
        "openrouter_aktiv": bool(key),
        "openrouter_key_maskiert": runtime.maske(key),
        "openrouter_model": runtime.hole("openrouter_model"),
    }


class EinstellungenIn(BaseModel):
    ollama_url: str | None = Field(default=None, max_length=300)
    ollama_model: str | None = Field(default=None, max_length=120)
    openrouter_key: str | None = Field(default=None, max_length=200)  # None=unverändert, ""=löschen
    openrouter_model: str | None = Field(default=None, max_length=200)


@router.put("/settings")
async def setze_einstellungen(inp: EinstellungenIn, _: None = Depends(brauche_admin)):
    if inp.openrouter_key is not None:
        key = inp.openrouter_key.strip()
        if key == "":
            runtime.loeschen("openrouter_key")
        else:
            runtime.setze("openrouter_key", key)
    for feld in ("ollama_url", "ollama_model", "openrouter_model"):
        wert = getattr(inp, feld)
        if wert is not None:
            runtime.setze(feld, wert.strip().rstrip("/"))
    return _settings_payload()


@router.post("/settings/test-ollama")
async def test_ollama(_: None = Depends(brauche_admin)):
    """Ping an Ollama (/api/tags) — liefert gleich die verfügbaren Modelle mit."""
    url = runtime.hole("ollama_url").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            r = await client.get(f"{url}/api/tags")
            r.raise_for_status()
            modelle = [m.get("name", "") for m in r.json().get("models", [])]
        return {"status": "ok", "erreichbar": True, "modelle": modelle}
    except Exception as e:
        return {"status": "ok", "erreichbar": False, "fehler": str(e)[:200]}


@router.post("/settings/test-openrouter")
async def test_openrouter(_: None = Depends(brauche_admin)):
    """Key gegen OpenRouter prüfen (GET /api/v1/key) — inkl. Guthaben-Info."""
    key = runtime.hole("openrouter_key")
    if not key:
        return {"status": "ok", "gueltig": False, "fehler": "Kein API-Key gespeichert"}
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get("https://openrouter.ai/api/v1/key", headers={"Authorization": f"Bearer {key}"})
            if r.status_code == 401:
                return {"status": "ok", "gueltig": False, "fehler": "Key ungültig (401)"}
            r.raise_for_status()
            info = r.json().get("data", {})
            return {"status": "ok", "gueltig": True, "nutzung": info.get("usage"), "limit": info.get("limit")}
    except Exception as e:
        return {"status": "ok", "gueltig": False, "fehler": str(e)[:200]}


# --------------------------------------------------------------------------
# Projekte
# --------------------------------------------------------------------------

def _hole_projekt(projekt_id: int) -> dict:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM projekte WHERE id=?", (projekt_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
        return row_to_dict(row)
    finally:
        conn.close()


@router.get("/projekte")
async def liste_projekte(_: None = Depends(brauche_admin)):
    conn = connect()
    try:
        rows = conn.execute(
            """SELECT p.id, p.name, p.lat, p.lon, p.privacy_lokal, p.updated_at,
                      (SELECT COUNT(*) FROM bilder b WHERE b.projekt_id=p.id) AS bild_anzahl,
                      (p.spec IS NOT NULL) AS hat_spec
               FROM projekte p ORDER BY p.updated_at DESC"""
        ).fetchall()
        return {"status": "ok", "projekte": [row_to_dict(r) for r in rows]}
    finally:
        conn.close()


@router.post("/projekte")
async def lege_projekt_an(inp: ProjektIn, _: None = Depends(brauche_admin)):
    conn = connect()
    try:
        cur = conn.execute(
            "INSERT INTO projekte (name, created_at, updated_at) VALUES (?,?,?)",
            (inp.name, utc_now(), utc_now()),
        )
        conn.commit()
        return {"status": "ok", "id": cur.lastrowid}
    finally:
        conn.close()


@router.get("/projekte/{projekt_id}")
async def hole_projekt(projekt_id: int, _: None = Depends(brauche_admin)):
    p = _hole_projekt(projekt_id)
    conn = connect()
    try:
        bilder = conn.execute(
            "SELECT id, notiz, analyse, created_at FROM bilder WHERE projekt_id=? ORDER BY id",
            (projekt_id,),
        ).fetchall()
    finally:
        conn.close()
    p["bilder"] = [row_to_dict(b) for b in bilder]
    p["spec"] = json.loads(p["spec"]) if p.get("spec") else None
    p["osm_roh"] = json.loads(p["osm_roh"]) if p.get("osm_roh") else None
    return {"status": "ok", "projekt": p}


@router.put("/projekte/{projekt_id}")
async def aktualisiere_projekt(projekt_id: int, inp: ProjektUpdate, _: None = Depends(brauche_admin)):
    _hole_projekt(projekt_id)
    felder, werte = [], []
    if inp.name is not None:
        felder.append("name=?")
        werte.append(inp.name)
    if inp.lat is not None:
        felder.append("lat=?")
        werte.append(inp.lat)
    if inp.lon is not None:
        felder.append("lon=?")
        werte.append(inp.lon)
    if inp.privacy_lokal is not None:
        felder.append("privacy_lokal=?")
        werte.append(1 if inp.privacy_lokal else 0)
    if felder:
        felder.append("updated_at=?")
        werte.append(utc_now())
        werte.append(projekt_id)
        conn = connect()
        try:
            conn.execute(f"UPDATE projekte SET {', '.join(felder)} WHERE id=?", werte)
            conn.commit()
        finally:
            conn.close()
    return {"status": "ok"}


@router.delete("/projekte/{projekt_id}")
async def loesche_projekt(projekt_id: int, _: None = Depends(brauche_admin)):
    p = _hole_projekt(projekt_id)
    conn = connect()
    try:
        conn.execute("DELETE FROM projekte WHERE id=?", (projekt_id,))
        conn.commit()
    finally:
        conn.close()
    # Bilddateien hinterher (Benennung: {projekt_id}_{zufall}.jpg)
    media = get_settings().media_dir
    for datei in media.glob(f"{projekt_id}_*"):
        datei.unlink(missing_ok=True)
    return {"status": "ok"}


@router.post("/projekte/{projekt_id}/osm-sync")
async def osm_abgleich(projekt_id: int, _: None = Depends(brauche_admin)):
    """Fragt Overpass ab und aktualisiert osm_roh + Spec (mit Privacy-Hinweis im Frontend)."""
    p = _hole_projekt(projekt_id)
    if p["lat"] is None or p["lon"] is None:
        raise HTTPException(status_code=400, detail="Erst GPS-Koordinaten speichern")
    roh = await osm.hole_umgebung(p["lat"], p["lon"])
    conn = connect()
    try:
        conn.execute(
            "UPDATE projekte SET osm_roh=?, updated_at=? WHERE id=?",
            (json.dumps(roh), utc_now(), projekt_id),
        )
        conn.commit()
    finally:
        conn.close()
    spec = _fusion(projekt_id)
    return {"status": "ok", "osm": roh, "spec": spec}


def _fusion(projekt_id: int, haus_breite: float | None = None) -> dict:
    p = _hole_projekt(projekt_id)
    osm_roh = json.loads(p["osm_roh"]) if p.get("osm_roh") else None
    fragmente = _hole_fragmente(projekt_id)
    spec = fusioniere(osm_roh, fragmente, haus_breite)
    conn = connect()
    try:
        conn.execute(
            "UPDATE projekte SET spec=?, updated_at=? WHERE id=?",
            (spec.model_dump_json(), utc_now(), projekt_id),
        )
        conn.commit()
    finally:
        conn.close()
    return spec.model_dump()


def _hole_fragmente(projekt_id: int) -> list[SpecFragment]:
    """Liest die KI-Fragmente der Bilder (Duplikate durch Mehrbild-Analyse rausfiltern)."""
    conn = connect()
    try:
        rows = conn.execute("SELECT analyse FROM bilder WHERE projekt_id=? AND analyse IS NOT NULL", (projekt_id,)).fetchall()
    finally:
        conn.close()
    gesehen: set[str] = set()
    fragmente: list[SpecFragment] = []
    for r in rows:
        if r["analyse"] in gesehen:
            continue
        gesehen.add(r["analyse"])
        fragmente.append(SpecFragment.model_validate_json(r["analyse"]))
    return fragmente


@router.post("/projekte/{projekt_id}/refusion")
async def refusion(projekt_id: int, inp: RefusionIn, _: None = Depends(brauche_admin)):
    return {"status": "ok", "spec": _fusion(projekt_id, inp.haus_breite)}


# --------------------------------------------------------------------------
# Bilder
# --------------------------------------------------------------------------

@router.post("/projekte/{projekt_id}/bilder")
async def upload_bilder(projekt_id: int, files: list[UploadFile] = File(...), _: None = Depends(brauche_admin)):
    from PIL import Image

    _hole_projekt(projekt_id)
    s = get_settings()
    limit = s.max_upload_mb * 1024 * 1024
    gesichert = []
    for f in files:
        endung = (f.filename or "").rsplit(".", 1)[-1].lower()
        if endung not in ERLAUBTE_ENDUNGEN:
            raise HTTPException(status_code=400, detail=f"Dateityp .{endung} nicht erlaubt (jpg/png/webp)")
        inhalt = await f.read(limit + 1)
        if len(inhalt) > limit:
            raise HTTPException(status_code=413, detail=f"{f.filename} größer als {s.max_upload_mb} MB")
        try:
            img = Image.open(io.BytesIO(inhalt))
            img = img.convert("RGB")
            img.thumbnail((2560, 2560), Image.LANCZOS)  # wie Signage-App: downscaled fürs Web
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"{f.filename} ist kein gültiges Bild") from e
        name = f"{projekt_id}_{uuid.uuid4().hex[:10]}.jpg"
        ziel = s.media_dir / name
        img.save(ziel, format="JPEG", quality=85)
        conn = connect()
        try:
            cur = conn.execute(
                "INSERT INTO bilder (projekt_id, dateiname, created_at) VALUES (?,?,?)",
                (projekt_id, name, utc_now()),
            )
            conn.commit()
            gesichert.append({"id": cur.lastrowid, "dateiname": name})
        finally:
            conn.close()
    return {"status": "ok", "bilder": gesichert}


@router.get("/bilder/{bild_id}/datei")
async def bild_datei(bild_id: int, _: None = Depends(brauche_admin)):
    from fastapi.responses import FileResponse

    conn = connect()
    try:
        row = conn.execute("SELECT dateiname FROM bilder WHERE id=?", (bild_id,)).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Bild nicht gefunden")
    pfad = get_settings().media_dir / row["dateiname"]
    if not pfad.exists():
        raise HTTPException(status_code=404, detail="Datei fehlt")
    return FileResponse(pfad, media_type="image/jpeg")


@router.delete("/bilder/{bild_id}")
async def loesche_bild(bild_id: int, _: None = Depends(brauche_admin)):
    conn = connect()
    try:
        row = conn.execute("SELECT dateiname FROM bilder WHERE id=?", (bild_id,)).fetchone()
        if row:
            conn.execute("DELETE FROM bilder WHERE id=?", (bild_id,))
            conn.commit()
    finally:
        conn.close()
    if row:
        (get_settings().media_dir / row["dateiname"]).unlink(missing_ok=True)
    return {"status": "ok"}


# --------------------------------------------------------------------------
# KI-Analyse + Spec
# --------------------------------------------------------------------------

@router.post("/projekte/{projekt_id}/analyse")
async def analyse(projekt_id: int, inp: AnalyseIn, _: None = Depends(brauche_admin)):
    p = _hole_projekt(projekt_id)
    if not provider_erlaubt(inp.provider, bool(p["privacy_lokal"])):
        raise HTTPException(
            status_code=403,
            detail=f"Projekt steht auf 'nur lokal' — Provider {inp.provider} ist gesperrt",
        )
    conn = connect()
    try:
        rows = conn.execute("SELECT id, dateiname FROM bilder WHERE projekt_id=? ORDER BY id", (projekt_id,)).fetchall()
    finally:
        conn.close()
    if not rows:
        raise HTTPException(status_code=400, detail="Keine Bilder zum Analysieren")
    pfade = [str(get_settings().media_dir / r["dateiname"]) for r in rows]
    provider = provider_fuer(inp.provider)  # früh prüfen, ob der Provider existiert
    fragment = await analysiere_bilder(pfade, inp.provider, inp.model)
    fragment_json = fragment.model_dump_json()
    conn = connect()
    try:
        conn.executemany(
            "UPDATE bilder SET analyse=? WHERE id=?",
            [(fragment_json, r["id"]) for r in rows],
        )
        conn.commit()
    finally:
        conn.close()
    spec = _fusion(projekt_id)
    return {"status": "ok", "fragment": fragment.model_dump(), "spec": spec}


@router.get("/projekte/{projekt_id}/spec")
async def hole_spec(projekt_id: int, _: None = Depends(brauche_admin)):
    p = _hole_projekt(projekt_id)
    return {"status": "ok", "spec": json.loads(p["spec"]) if p.get("spec") else None}


@router.put("/projekte/{projekt_id}/spec")
async def speichere_spec(projekt_id: int, inp: SpecIn, _: None = Depends(brauche_admin)):
    try:
        spec = SceneSpec.model_validate(inp.spec)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Spec invalide: {e}") from e
    conn = connect()
    try:
        conn.execute(
            "UPDATE projekte SET spec=?, updated_at=? WHERE id=?",
            (spec.model_dump_json(), utc_now(), projekt_id),
        )
        conn.commit()
    finally:
        conn.close()
    return {"status": "ok", "spec": spec.model_dump()}


# --------------------------------------------------------------------------
# Preview + Export
# --------------------------------------------------------------------------

def _spec_oder_demo(projekt_id: int) -> SceneSpec:
    p = _hole_projekt(projekt_id)
    if p.get("spec"):
        return SceneSpec.model_validate_json(p["spec"])
    # Ohne Spec: Demo-Szene (Default-Rechteck), damit die Preview nie leer ist
    return fusioniere(None, [])


@router.get("/projekte/{projekt_id}/preview", response_class=None)
async def preview(projekt_id: int, _: None = Depends(brauche_admin)):
    p = _hole_projekt(projekt_id)
    html = baue_html(_spec_oder_demo(projekt_id), titel=p["name"])
    from fastapi.responses import Response

    return Response(content=html, media_type="text/html")


@router.get("/projekte/{projekt_id}/export")
async def export(projekt_id: int, _: None = Depends(brauche_admin)):
    p = _hole_projekt(projekt_id)
    html = baue_html(_spec_oder_demo(projekt_id), titel=p["name"])
    from fastapi.responses import Response

    sicher = "".join(c if c.isalnum() else "_" for c in p["name"])[:40] or "anwesen"
    return Response(
        content=html,
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="{sicher}.html"'},
    )
