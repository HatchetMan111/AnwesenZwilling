-- AnwesenTwin — Luftbild (Satellitenbild der Umgebung)
-- luftbild: Dateiname unter data/media/ (JPEG, lokal gespeichert)
-- luftbild_meta: JSON {offset:[x,z], laenge_m, quelle} — offset = Position des
-- GPS-Punkts im zentrierten lokalen Koordinatensystem, laenge_m = Bildbreite in Metern.

ALTER TABLE projekte ADD COLUMN luftbild TEXT;
ALTER TABLE projekte ADD COLUMN luftbild_meta TEXT;
