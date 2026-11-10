"""AnwesenTwin — FastAPI-Einstiegspunkt.

Start (Dev):   uvicorn anwesen_twin.main:app --port 8768   (aus app/)
Start (LXC):   siehe systemd/anwesentwin.service
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import router
from .config import get_settings
from .db import init_db

WEB_DIST = Path(__file__).resolve().parents[2] / "web" / "dist"

INFO_SEITE = """<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<title>AnwesenTwin</title></head>
<body style="font-family:system-ui;background:#10141a;color:#e5e7eb;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center">
<h1>🏠 AnwesenTwin</h1>
<p>Das Dashboard ist nicht gebaut.</p>
<p style="color:#9ca3af">Im Projektordner: <code>cd web && npm install && npm run build</code></p>
</div></body></html>"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    get_settings().ensure_dirs()
    yield


app = FastAPI(title="AnwesenTwin", lifespan=lifespan)
app.include_router(router)

# Frontend (web/dist) ausliefern, falls gebaut — SPA-Fallback auf index.html
if WEB_DIST.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

    @app.get("/{pfad:path}", include_in_schema=False)
    async def spa(pfad: str):
        if pfad == "api" or pfad.startswith("api/"):
            # Unbekannte API-Route: sauberes 404-JSON statt der SPA-Shell
            return JSONResponse({"detail": "Nicht gefunden"}, status_code=404)
        kandidat = WEB_DIST / pfad
        if pfad and kandidat.is_file():
            return FileResponse(kandidat)
        return FileResponse(WEB_DIST / "index.html")
else:

    @app.get("/", include_in_schema=False)
    async def info():
        return HTMLResponse(INFO_SEITE)
