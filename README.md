# 🏠 AnwesenTwin

Aus **GPS-Koordinaten + Bildern** einen interaktiven **three.js-Digital-Twin** des Anwesens bauen — selbst gehostet in einem LXC auf Proxmox.

## Installation (Einzeiler auf dem Proxmox-Host)

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/HatchetMan111/AnwesenTwin/main/install/anwesentwin.sh)"
```

Das Script (Community-Scripts-Stil): erstellt selbstständig einen **unprivileged LXC** (Debian 12, nächste freie ID ab 200, 2 vCPU / 2 GB RAM / 8 GB Disk, `onboot: 1`), installiert Python + App + systemd-Dienst und verifiziert am Ende Service und Web-UI. Bei Fehlern gibt es die **komplette Fehlerkette** mit Logauszug; für den vollen Trace: `bash -x install/anwesentwin.sh`.

Erwartete Ausgabe am Ende:

```
✅ systemd-Dienst läuft (systemctl is-active → active)
✅ Web-UI antwortet (HTTP-Check: {"status":"ok"})
==============================================================
  AnwesenTwin ist installiert
  Web-UI:    http://<CT-IP>:8080
  Passwort:  <generiertes Login-Passwort>
  CT-Root:   <generiertes CT-Passwort>
==============================================================
```

### Betrieb

| Aktion | Befehl (auf dem Proxmox-Host) |
|---|---|
| App aktualisieren (Daten bleiben) | `bash install/anwesentwin.sh --update` |
| DB + Medien sichern | `bash install/anwesentwin.sh --backup` |
| Status + URL | `bash install/anwesentwin.sh --status` |
| Entfernen (Rückfrage) | `bash install/anwesentwin.sh --uninstall` |
| Feste IP/ID/Port | Flags `--ip 192.168.1.50/24`, `--id 210`, `--port 8080` |
| Dateien aus lokalem Repo-Ordner | `bash install/anwesentwin.sh --local` |

Der Container ist **reboot-sicher**: `onboot: 1` startet den CT automatisch, der Dienst läuft als systemd-Unit mit `Restart=always` und `After=network-online.target`.

### Installations-Testlauf (auf dem Proxmox-Host)

```bash
# 1) Installieren (Einzeiler oben) — Ausgabe enthält CT-ID + Passwörter
# 2) Reboot-Sicherheit belegen:
pct reboot <CT-ID>
sleep 20 && pct exec <CT-ID> -- systemctl is-active anwesentwin   # → active
# 3) Web-UI wieder erreichbar:
pct exec <CT-ID> -- curl -sf http://localhost:8080/api/health     # → {"status":"ok"}
```

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

## Proxmox-LXC

Der Einzeiler oben erledigt alles. Im CT liegen:

- `/opt/anwesentwin/` — App (Backend, gebautes Dashboard `web/dist`, Engine `engine/twin.js`)
- `/var/lib/anwesentwin/` — SQLite-DB + hochgeladene Medien (systemd `StateDirectory`)
- `/etc/anwesentwin/anwesentwin.env` — Secrets (Session-Secret, Web-Passwort, Bind `0.0.0.0:${PORT}`)

Ollama verbindest du am einfachsten über die **Einstellungsseite im Dashboard**
(wird in der SQLite-DB gespeichert, überlebt Updates) — alternativ per Env in
`/etc/anwesentwin/anwesentwin.env` (z. B. `OLLAMA_URL=http://192.168.1.10:11434`
für eine Ollama-VM mit GPU-Passthrough).

## KI-Backends konfigurieren

| Env | Bedeutung | Default |
|---|---|---|
| `OLLAMA_URL` | Adresse der Ollama-Instanz | `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Vision-Modell | `qwen2.5-vl:7b` |
| `OPENROUTER_API_KEY` | Key für OpenRouter (Cloud) | — |
| `OPENROUTER_MODEL` | Cloud-Modell | `google/gemini-2.0-flash-001` |

Tipp für Ollama-Vision: `ollama pull qwen2.5-vl:7b` (7B reicht fürs Erkennen von
Dachform/Farben/PV; mit GPU flott, CPU-fähig aber langsam).
