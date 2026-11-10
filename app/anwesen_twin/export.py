"""Export: SceneSpec + Engine-Bundle → eine einzige standalone HTML-Datei.

Die Datei enthält die komplette three.js-Engine (inline) und die Szenendaten —
läuft offline von der Festplatte, ohne Server, ohne CDN. Keine GPS-Koordinaten
drin (die Spec lebt in lokalen Metern), keine Bildinhalte drin.
"""
from __future__ import annotations

import html
import json
from pathlib import Path

from .twin.schema import SceneSpec

ENGINE_BUNDLE = Path(__file__).resolve().parents[2] / "engine" / "twin.js"

TEMPLATE = """<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITEL__ — AnwesenTwin</title>
<style>
  html, body { margin: 0; height: 100%; background: #10141a; overflow: hidden; }
  #twin-scene { width: 100vw; height: 100vh; }
</style>
</head>
<body>
<div id="twin-scene"></div>
<script>
window.__TWIN_DATA__ = __SZENENDATEN__;
</script>
<script>
__ENGINE__
</script>
</body>
</html>
"""


def baue_html(spec: SceneSpec, titel: str = "Mein Anwesen") -> str:
    if not ENGINE_BUNDLE.exists():
        raise RuntimeError(
            "engine/twin.js fehlt — erst im Ordner engine/ 'npm install && npm run build' ausführen"
        )
    bundle = ENGINE_BUNDLE.read_text(encoding="utf-8")
    # "</script" in JSON-Daten neutralisieren (gültig als \/ in JSON-Strings);
    # das Engine-Bundle macht esbuild selbst sicher (String-Literale werden escaped).
    daten = json.dumps(spec.model_dump(), ensure_ascii=False).replace("</", "<\\/")
    html_text = TEMPLATE.replace("__TITEL__", html.escape(titel))
    html_text = html_text.replace("__SZENENDATEN__", daten)
    html_text = html_text.replace("__ENGINE__", bundle)
    return html_text
