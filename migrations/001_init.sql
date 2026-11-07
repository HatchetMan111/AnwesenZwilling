-- AnwesenTwin — Initiales Schema
-- Ein LXC, ein Dienst, eine SQLite-Datei. Koordinaten werden NUR lokal (Meter,
-- Ursprung Grundstücksmitte) gespeichert; GPS bleibt transient in osm.py.

CREATE TABLE IF NOT EXISTS projekte (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    lat         REAL,
    lon         REAL,
    privacy_lokal INTEGER NOT NULL DEFAULT 0,   -- 1 = Analyse nur lokal (Ollama erlaubt, OpenRouter blockiert)
    osm_roh       TEXT,                         -- JSON: OSM-Footprints, bereits in lokale Meter transformiert
    spec          TEXT,                         -- JSON: aktuelle SceneSpec
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bilder (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    projekt_id INTEGER NOT NULL REFERENCES projekte(id) ON DELETE CASCADE,
    dateiname  TEXT NOT NULL,                   -- Name unter data/media/
    notiz      TEXT NOT NULL DEFAULT '',
    analyse    TEXT,                            -- JSON: KI-Fragment dieses Bildes (lokal, ohne Koordinaten)
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS einstellungen (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bilder_projekt ON bilder(projekt_id);
