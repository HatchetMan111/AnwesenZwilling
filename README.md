# 🏠 AnwesenTwin

Aus **GPS-Koordinaten + Bildern** einen interaktiven **three.js-Digital-Twin** des Anwesens bauen — selbst gehostet in einem LXC auf Proxmox.

## Wie es funktioniert

```
GPS eintragen ──→ Overpass-API: echte Gebäudeumrisse (exakt, kostenlos)
Bilder uploaden ─→ KI-Vision: Dachform, Etagen, Farben, PV, Vegetation (Details)
        │                       │
        └──────── Fusion ───────┘
                  ↓
       SceneSpec (lokale Meter-Koordinaten)
                  ↓
   three.js-Engine (prozedural, ohne Modell-Dateien)
                  ↓
   Preview im Dashboard · Export als standalone HTML
```

Die genaueste Datenquelle ist **nicht die KI**: OSM/Overpass liefert echte Umrisslinien.
Die KI (Vision-Modell) ergänzt, was OSM nicht hat. Fusion aus beidem → Szenen-Spec,
die die Engine in prozedurale Geometrie übersetzt (Extrusion, Dachformen, Fenster,
PV-Module, Bäume, Hecken, Wege — alles aus Canvas-Texturen, nichts nachzuladen).

## Datenschutz — das Designprinzip

- Szene lebt **immer in lokalen Meter-Koordinaten** (Ursprung = Hauptgebäude).
  GPS-Daten werden nur einmalig transient für die Overpass-Abfrage genutzt und
  nirgends gespeichert — nicht in der DB, nicht im Export.
- **KI wählbar pro Projekt**: Ollama (Bilder verlassen das Haus nie) oder OpenRouter
  (schnell, stark — Bildinhalte gehen in die Cloud). Ein Privacy-Schalter
  („Nur lokal") sperrt Cloud-Provider projektweit hart.
- Export-HTML enthält Engine + Szenen — **keine Koordinaten, keine Bilder**.

## Architektur (in einem Satz je Modul)

| Pfad | Aufgabe |
|---|---|
| `app/anwesen_twin/api.py` | FastAPI-REST (`/api/*`), HMAC-Session-Login |
| `app/anwesen_twin/osm.py` | Overpass-Abfrage → sofort lokale Meter (GPS verlässt die Funktion nie) |
| `app/anwesen_twin/llm/` | Provider-Adapter: `ollama.py`, `openrouter.py` |
| `app/anwesen_twin/twin/schema.py` | **SceneSpec** — der Vertrag zwischen Fusion und Engine (Pydantic) |
| `app/anwesen_twin/twin/fusion.py` | OSM + KI-Fragmente → Spec, zentriert auf das Hauptgebäude |
| `app/anwesen_twin/export.py` | Spec + `engine/twin.js` → eine standalone HTML (~570 KB) |
| `engine/` | three.js-Engine (kit/env aus smarthome-3d + twin-scene), esbuild → IIFE |
| `web/` | React 18 + Vite + TS + Tailwind Dashboard |
| `install/anwesentwin.sh` | Proxmox-LXC-Installer (unprivileged Debian 12, systemd, :8080) |

**Kein Node im LXC**: Die Engine wird einmalig hier gebaut; der Export injiziert
nur JSON. Der Container braucht ausschließlich Python.

## Entwicklung (lokal)

```bash
# Backend (Port 8768)
pip3 install --user -r requirements.txt
cd app && python3 -m uvicorn anwesen_twin.main:app --port 8768

# Dashboard (Dev mit Proxy auf 8768)
cd web && npm install && npm run dev

# Engine bauen (nur nach Änderungen an engine/*.js)
cd engine && npm install && npm run build

# Tests
python3 -m pytest tests/ -q
```

Login: Passwort aus `ANWESENTWIN_PASSWORD` (Dev-Default: `admin`).

## Proxmox-LXC (empfohlen)

Auf dem Proxmox-Host:

```bash
bash install/anwesentwin.sh          # installiert CT, Web-UI auf :8080
bash install/anwesentwin.sh --update # App erneuern, Daten bleiben
bash install/anwesentwin.sh --backup # DB + Medien sichern
```

Der Installer generiert Passwort + Session-Secret nach `/etc/anwesentwin/anwesentwin.env`
(im CT) und gibt sie aus. Ollama verbinden per `OLLAMA_URL` in dieser Env-Datei
(z. B. `http://192.168.1.10:11434` für eine Ollama-VM mit GPU-Passthrough).

## KI-Backends konfigurieren

| Env | Bedeutung | Default |
|---|---|---|
| `OLLAMA_URL` | Adresse der Ollama-Instanz | `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Vision-Modell | `qwen2.5-vl:7b` |
| `OPENROUTER_API_KEY` | Key für OpenRouter (Cloud) | — |
| `OPENROUTER_MODEL` | Cloud-Modell | `google/gemini-2.0-flash-001` |

Tipp für Ollama-Vision: `ollama pull qwen2.5-vl:7b` (7B reicht fürs Erkennen von
Dachform/Farben/PV; mit GPU flott, CPU-fähig aber langsam).
