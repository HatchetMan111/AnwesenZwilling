// Baut die Anwesen-Szene aus einer SceneSpec (siehe app/anwesen_twin/twin/schema.py).
// Koordinaten: lokale Meter, Ursprung Grundstücksmitte, +x = Ost, -z = Nord, +y = hoch.
import * as THREE from 'three';
import { rng, canvasTex, place, Kit, sweep } from './kit.js';
import { U } from './env.js';

// ---------------------------------------------------------------------------
// Texturen (alles Canvas — keine Dateien, nichts nachzuladen)
// ---------------------------------------------------------------------------

const texGrass = canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#7da05a'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const g = 120 + Math.random() * 60;
    c.fillStyle = `rgb(${g * 0.72},${g},${g * 0.45})`;
    c.fillRect(Math.random() * w, Math.random() * h, 1.5, 3);
  }
}, { repeat: [64, 64] });

const texRasenGemaeht = canvasTex(512, 256, (c, w, h) => {
  for (let i = 0; i < 8; i++) {                       // Streifen wie frisch gemäht
    c.fillStyle = i % 2 ? '#77a055' : '#86b163';
    c.fillRect(i * w / 8, 0, w / 8, h);
  }
  for (let i = 0; i < 3000; i++) {
    c.fillStyle = `rgba(${40 + Math.random() * 60},${90 + Math.random() * 50},${30 + Math.random() * 30},0.25)`;
    c.fillRect(Math.random() * w, Math.random() * h, 1.5, 2.5);
  }
}, { repeat: [3, 3] });

const texKies = canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#b7b0a4'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const g = 130 + Math.random() * 80;
    c.fillStyle = `rgb(${g},${g * 0.97},${g * 0.9})`;
    c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 0, 7); c.fill();
  }
}, { repeat: [4, 4] });

const texPflaster = canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#9a938a'; c.fillRect(0, 0, w, h);
  const z = 32;
  for (let y = 0; y < h; y += z) {
    for (let x = (y / z) % 2 ? 0 : -z / 2; x < w + z; x += z) {
      const g = 135 + Math.random() * 45;
      c.fillStyle = `rgb(${g},${g * 0.96},${g * 0.9})`;
      c.fillRect(x + 2, y + 2, z - 4, z - 4);
    }
  }
}, { repeat: [3, 3] });

const texDach = canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#8a4a3a'; c.fillRect(0, 0, w, h);
  const rh = 16, rw = 26;
  for (let y = 0; y < h; y += rh) {
    for (let x = (y / rh) % 2 ? -rw / 2 : 0; x < w + rw; x += rw) {
      const t = 0.75 + Math.random() * 0.45;
      c.fillStyle = `rgb(${138 * t},${74 * t},${58 * t})`;
      c.beginPath(); c.arc(x + rw / 2, y + rh, rw / 2, Math.PI, 0); c.fill();
    }
  }
}, { repeat: [3, 3] });

const texFassade = canvasTex(128, 128, (c, w, h) => {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) {
    c.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    c.fillRect(Math.random() * w, Math.random() * h, 2, 1);
  }
}, { repeat: [0.25, 0.25] });

const texFenster = canvasTex(128, 128, (c, w, h) => {
  const grad = c.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#9fb8c8'); grad.addColorStop(0.5, '#6d8ba0'); grad.addColorStop(1, '#4a6274');
  c.fillStyle = grad; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.moveTo(0, h); c.lineTo(w * 0.55, 0); c.lineTo(w * 0.8, 0); c.lineTo(w * 0.25, h); c.fill();
  c.strokeStyle = '#f4f2ec'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
  c.lineWidth = 5;
  c.beginPath(); c.moveTo(w / 2, 5); c.lineTo(w / 2, h - 5); c.stroke();
  c.beginPath(); c.moveTo(5, h / 2); c.lineTo(w - 5, h / 2); c.stroke();
});

const texTuer = canvasTex(64, 128, (c, w, h) => {
  c.fillStyle = '#5a3a24'; c.fillRect(0, 0, w, h);
  for (let x = 6; x < w - 6; x += 13) { c.fillStyle = '#4a2f1c'; c.fillRect(x, 6, 8, h - 12); }
  c.fillStyle = '#d8b25a'; c.beginPath(); c.arc(w - 14, h * 0.52, 3, 0, 7); c.fill();
});

const texPV = canvasTex(128, 128, (c, w, h) => {
  c.fillStyle = '#0d2242'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#1e3a5f'; c.lineWidth = 3;
  for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * w / 4, 0); c.lineTo(i * w / 4, h); c.stroke(); }
  for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke(); }
  const grad = c.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, 'rgba(255,255,255,0.16)'); grad.addColorStop(0.6, 'rgba(255,255,255,0)');
  c.fillStyle = grad; c.fillRect(0, 0, w, h);
});

const texLaub = canvasTex(128, 128, (c, w, h) => {
  c.fillStyle = '#4d7a34'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) {
    const t = Math.random();
    c.fillStyle = t > 0.5 ? `rgba(${30 + Math.random() * 40},${90 + Math.random() * 60},${25 + Math.random() * 20},0.5)` : 'rgba(0,0,0,0.12)';
    c.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  }
});

// ---------------------------------------------------------------------------
// Geometrie-Helfer
// ---------------------------------------------------------------------------

function flaeche(polygon) {
  let s = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i], [x2, z2] = polygon[(i + 1) % polygon.length];
    s += x1 * z2 - x2 * z1;
  }
  return s / 2;
}

function zentrum(polygon) {
  let x = 0, z = 0;
  for (const [px, pz] of polygon) { x += px; z += pz; }
  return [x / polygon.length, z / polygon.length];
}

/** Äußere Normale einer Kante (zeigt weg vom Polygon-Schwerpunkt). */
function aussenNormale(polygon, i) {
  const [x1, z1] = polygon[i], [x2, z2] = polygon[(i + 1) % polygon.length];
  const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz) || 1;
  let nx = -dz / l, nz = dx / l;
  const [cx, cz] = zentrum(polygon);
  const mx = (x1 + x2) / 2 - cx, mz = (z1 + z2) / 2 - cz;
  if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
  return [nx, nz];
}

function bbox(polygon, ueberstand = 0) {
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (const [x, z] of polygon) {
    minx = Math.min(minx, x); maxx = Math.max(maxx, x);
    minz = Math.min(minz, z); maxz = Math.max(maxz, z);
  }
  return { minx: minx - ueberstand, maxx: maxx + ueberstand, minz: minz - ueberstand, maxz: maxz + ueberstand };
}

/** Rechteck-ähnlicher Grundriss? (nur dann wirken Sattel/Walm/Pyramide über der BBox gut) */
function istRechteckig(polygon) {
  const b = bbox(polygon, 0);
  const aabb = Math.max((b.maxx - b.minx) * (b.maxz - b.minz), 0.001);
  return Math.abs(flaeche(polygon)) / aabb > 0.8;
}

/** Flaches Band entlang einer Polylinie (sweep mit flachem Profil). */
function band(punkte, breite, y) {
  return sweep([[-breite / 2, y], [breite / 2, y]], punkte.map(([x, z]) => [x, z]), { uvScale: 3 });
}

// ---------------------------------------------------------------------------
// Gebäude
// ---------------------------------------------------------------------------

function baueWandGeometry(footprint, hoehe) {
  // Shape in (x, -z), extrudiert entlang +y (nach rotateX(-π/2) bleibt spec-z erhalten)
  const shape = new THREE.Shape(footprint.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: hoehe, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

function baueDach(geometrie, wandHoehe, dachMat, giebelMat, rand) {
  const { form, neigung, first_richtung, ueberstand } = geometrie.dach;
  // Komplexe Grundrisse (z. B. L-Formen aus OSM) bekommen ein Flachdach —
  // ein geneigtes Dach über der BBox würde weit über die Wände ragen.
  const dachform = form !== 'flach' && !istRechteckig(geometrie.footprint) ? 'flach' : form;
  const b = bbox(geometrie.footprint, ueberstand);
  const bx = b.maxx - b.minx, bz = b.maxz - b.minz;
  const cz = (b.minz + b.maxz) / 2, cx = (b.minx + b.maxx) / 2;
  const group = new THREE.Group();
  const firstLaengsX = (first_richtung % 180 + 180) % 180 < 45 || (first_richtung % 180 + 180) % 180 >= 135;
  // "firstLaengsX": First verläuft Ost-West (entlang x), sonst Nord-Süd
  const laengs = firstLaengsX ? bx : bz;
  const quer = firstLaengsX ? bz : bx;
  const firstHoehe = (quer / 2) * Math.tan(THREE.MathUtils.degToRad(neigung));

  if (dachform === 'flach') {
    const platte = new THREE.Mesh(new THREE.BoxGeometry(bx, 0.25, bz), dachMat);
    platte.position.set(cx, wandHoehe + 0.125, cz);
    group.add(platte);
    // Attika-Ring
    for (const [sx, sz, ox, oz] of [[bx + 0.2, 0.18, 0, bz / 2], [bx + 0.2, 0.18, 0, -bz / 2], [0.18, bz + 0.2, bx / 2, 0], [0.18, bz + 0.2, -bx / 2, 0]]) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.5, sz), giebelMat);
      k.position.set(cx + ox, wandHoehe + 0.25 + 0.25, cz + oz);
      group.add(k);
    }
    return { group, firstHoehe: 0, platte: platte };
  }

  if (dachform === 'pyramide') {
    const g2 = new THREE.BufferGeometry();
    const apex = [cx, wandHoehe + firstHoehe, cz];
    const A = [b.minx, wandHoehe, b.minz], B = [b.maxx, wandHoehe, b.minz], C = [b.maxx, wandHoehe, b.maxz], D = [b.minx, wandHoehe, b.maxz];
    g2.setAttribute('position', new THREE.Float32BufferAttribute([...A, ...B, ...C, ...D, ...apex].flatMap(v => v), 3));
    g2.setIndex([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]);
    g2.computeVertexNormals();
    const m = new THREE.Mesh(g2, dachMat); m.material.side = THREE.DoubleSide;
    group.add(m);
    return { group, firstHoehe, apex };
  }

  // Sattel/Walme: Firstpunkte
  const ry = wandHoehe + firstHoehe;
  const halbQuer = quer / 2;
  const inset = dachform === 'walme' ? Math.min(halbQuer, laengs / 3) : 0;
  let R1, R2, A, B, C, D;
  if (firstLaengsX) {
    R1 = [b.minx + inset, ry, cz]; R2 = [b.maxx - inset, ry, cz];
    A = [b.minx, wandHoehe, b.minz]; B = [b.maxx, wandHoehe, b.minz];
    C = [b.maxx, wandHoehe, b.maxz]; D = [b.minx, wandHoehe, b.maxz];
  } else {
    R1 = [cx, ry, b.minz + inset]; R2 = [cx, ry, b.maxz - inset];
    A = [b.maxx, wandHoehe, b.minz]; B = [b.maxx, wandHoehe, b.maxz];
    C = [b.minx, wandHoehe, b.maxz]; D = [b.minx, wandHoehe, b.minz];
  }
  const g2 = new THREE.BufferGeometry();
  const verts = [...A, ...B, ...R2, ...R1, ...C, ...D, ...R1, ...R2];
  g2.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const idx = [
    0, 1, 2, 0, 2, 3,        // Fläche 1 (A,B,R2,R1)
    4, 5, 6, 4, 6, 7,        // Fläche 2 (C,D,R1,R2)
  ];
  if (dachform === 'walme') {
    // Walmedreiecke an beiden Firstenden: (A,D,R1) und (B,C,R2)
    idx.push(0, 3, 5, 1, 4, 2);
  } else {
    // Giebel-Dreiecke in Wandfarbe, separat damit sie die Fassaden-Textur tragen
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute([...A, ...D, ...R1, ...B, ...C, ...R2], 3));
    gg.setIndex([0, 1, 2, 3, 4, 5]);
    gg.computeVertexNormals();
    const gm = new THREE.Mesh(gg, giebelMat); gm.material.side = THREE.DoubleSide;
    group.add(gm);
  }
  g2.computeVertexNormals();
  const roof = new THREE.Mesh(g2, dachMat); roof.material.side = THREE.DoubleSide;
  group.add(roof);
  return { group, firstHoehe, ridge: [R1, R2] };
}

function bauePV(dachInfo, geometrie, dachMat, wandHoehe) {
  const { form, neigung, first_richtung } = geometrie.dach;
  if (!geometrie.pv || (form !== 'sattel' && form !== 'walme')) return null;
  const b = bbox(geometrie.footprint, geometrie.dach.ueberstand);
  const bx = b.maxx - b.minx, bz = b.maxz - b.minz;
  const group = new THREE.Group();
  const panelMat = new THREE.MeshStandardMaterial({ map: texPV, roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide });
  const panelGeo = new THREE.BoxGeometry(1.7, 0.06, 1.1);
  const tilt = THREE.MathUtils.degToRad(neigung);
  const firstLaengsX = (first_richtung % 180 + 180) % 180 < 45 || (first_richtung % 180 + 180) % 180 >= 135;
  // Südhang: bei First entlang x die +z-Fläche, sonst die +x-Fläche
  const quer = firstLaengsX ? bz : bx;      // Traufe→First horizontal
  const laengs = firstLaengsX ? bx : bz;    // entlang des Firsts
  const firstHoehe = (quer / 2) * Math.tan(tilt);
  const spalten = Math.max(1, Math.floor((laengs - 2.4) / 2.1));
  const reihen = Math.max(1, Math.min(3, Math.floor((quer / 2 - 1.2) / 1.4)));
  const mitte = firstLaengsX ? (b.minx + b.maxx) / 2 : (b.minz + b.maxz) / 2;
  const kante = firstLaengsX ? b.maxz : b.maxx;   // Süd-Traufe
  for (let r = 0; r < reihen; r++) {
    const t = 0.2 + r * 0.3;                       // Anteil von der Traufe: 0=Traufe, 1=First
    const abstand = t * (quer / 2);                // horizontal von der Traufe Richtung First
    const y = wandHoehe + t * firstHoehe + 0.15;
    for (let c = 0; c < spalten; c++) {
      const entlang = mitte + (c - (spalten - 1) / 2) * 2.1;
      const p = panelGeo.clone();
      if (firstLaengsX) {
        p.rotateX(tilt);                           // Fläche zeigt nach Süden oben
        p.translate(entlang, y, kante - abstand);
      } else {
        p.rotateZ(-tilt);                          // Fläche zeigt nach Osten oben (+x-Seite)
        p.translate(kante - abstand, y, entlang);
      }
      const mesh = new THREE.Mesh(p, panelMat);
      mesh.castShadow = true;
      group.add(mesh);
    }
  }
  return group;
}

function baueFensterUndTuer(group, geometrie, wandHoehe) {
  const { footprint, etagen, etagen_hoehe, fenster_anteil, tuer_seite } = geometrie;
  const glowMat = new THREE.MeshStandardMaterial({ map: texFenster, roughness: 0.25, emissive: new THREE.Color('#ffd9a0'), emissiveMap: texFenster, emissiveIntensity: 0 });
  const tuerMat = new THREE.MeshStandardMaterial({ map: texTuer, roughness: 0.6 });

  const winGeo = new THREE.BoxGeometry(1.1, 1.35, 0.1);
  const kit = new Kit().def('fenster', winGeo, glowMat, { cast: false, receive: false });
  const rand = rng(42);

  const richtungen = { n: [0, -1], o: [1, 0], s: [0, 1], w: [-1, 0] };
  const tuerDir = richtungen[tuer_seite] || richtungen.s;
  let besteKante = 0, bestDot = -Infinity;
  for (let i = 0; i < footprint.length; i++) {
    const [nx, nz] = aussenNormale(footprint, i);
    const d = nx * tuerDir[0] + nz * tuerDir[1];
    if (d > bestDot) { bestDot = d; besteKante = i; }
  }

  for (let i = 0; i < footprint.length; i++) {
    const [x1, z1] = footprint[i], [x2, z2] = footprint[(i + 1) % footprint.length];
    const L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 2.2) continue;
    const [nx, nz] = aussenNormale(footprint, i);
    const winkel = Math.atan2(nx, nz);          // Box z-Achse zeigt nach außen
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;

    for (let etage = 0; etage < Math.max(etagen, 1); etage++) {
      const sill = etage * etagen_hoehe + 0.95;
      const nutzbar = Math.max(L - 1.6, 0);
      const count = Math.min(6, Math.max(1, Math.round((nutzbar * fenster_anteil) / 1.1)));
      for (let k = 0; k < count; k++) {
        if (i === besteKante && etage === 0 && count === 1 && k === 0) continue; // Türplatz frei halten
        const t = count === 1 ? 0.5 : (k + 0.5) / count;
        const px = x1 + (x2 - x1) * t, pz = z1 + (z2 - z1) * t;
        kit.add('fenster', place(px + nx * 0.07, sill + 1.35 / 2, pz + nz * 0.07, winkel, 1, 1, 1));
      }
    }
    if (i === besteKante) {
      const tuer = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.05, 0.12), tuerMat);
      tuer.position.set(mx + nx * 0.08, 1.025, mz + nz * 0.08);
      tuer.rotation.y = winkel;
      tuer.castShadow = true;
      group.add(tuer);
    }
  }
  kit.build(group);
  return { glowMat };
}

function baueGebaeude(geometrie) {
  const group = new THREE.Group();
  const wandHoehe = Math.max(geometrie.etagen, 1) * geometrie.etagen_hoehe;
  const wandMat = new THREE.MeshStandardMaterial({
    map: texFassade, color: new THREE.Color(geometrie.wand_farbe), roughness: 0.9, side: THREE.DoubleSide,
  });
  const giebelMat = new THREE.MeshStandardMaterial({
    map: texFassade, color: new THREE.Color(geometrie.wand_farbe), roughness: 0.9, side: THREE.DoubleSide,
  });
  const dachMat = new THREE.MeshStandardMaterial({
    map: texDach, color: new THREE.Color(geometrie.dach_farbe), roughness: 0.85, side: THREE.DoubleSide,
  });

  const wand = new THREE.Mesh(baueWandGeometry(geometrie.footprint, wandHoehe), wandMat);
  wand.castShadow = true; wand.receiveShadow = true;
  group.add(wand);

  const dachInfo = baueDach(geometrie, wandHoehe, dachMat, giebelMat);
  dachInfo.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(dachInfo.group);

  const pv = bauePV(dachInfo, geometrie, dachMat, wandHoehe);
  if (pv) group.add(pv);

  const { glowMat } = baueFensterUndTuer(group, geometrie, wandHoehe);

  // Schornstein bei Sattel/Walme
  if ((geometrie.dach.form === 'sattel' || geometrie.dach.form === 'walme') && rng(geometrie.id.length + 7)() > 0.35) {
    const b = bbox(geometrie.footprint, 0);
    const sch = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6),
      new THREE.MeshStandardMaterial({ color: '#8a4a3a', roughness: 0.9 }));
    sch.position.set(b.maxx - 1.5, wandHoehe + geometrie.dach.neigung * 0.03 + 0.8, b.minz + 1.5);
    sch.castShadow = true;
    group.add(sch);
  }
  return { group, glowMat };
}

// ---------------------------------------------------------------------------
// Vegetation
// ---------------------------------------------------------------------------

function baueVegetation(spec) {
  const group = new THREE.Group();
  const kit = new Kit();
  const stammMat = new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.95 });
  const laubMat = new THREE.MeshStandardMaterial({ map: texLaub, roughness: 0.95 });
  const nadelMat = new THREE.MeshStandardMaterial({ color: '#2e5a2a', roughness: 0.95 });
  kit.def('laub_stamm', new THREE.CylinderGeometry(0.14, 0.22, 2.4, 7), stammMat);
  kit.def('laub_krone1', new THREE.IcosahedronGeometry(1, 1), laubMat);
  kit.def('laub_krone2', new THREE.IcosahedronGeometry(0.75, 1), laubMat);
  kit.def('nadel_stamm', new THREE.CylinderGeometry(0.12, 0.2, 1.6, 7), stammMat);
  for (let i = 0; i < 3; i++) kit.def(`nadel_${i}`, new THREE.ConeGeometry(1.15 - i * 0.3, 1.7, 8), nadelMat);

  const rand = rng(1234);
  for (const baum of spec.vegetation || []) {
    const [x, z] = baum.position;
    const s = baum.hoehe / 6;                       // Basisform ~6 m
    if (baum.art === 'nadel') {
      kit.add('nadel_stamm', place(x, 0.8 * s, z, 0, s, s, s));
      for (let i = 0; i < 3; i++) kit.add(`nadel_${i}`, place(x, (1.6 + i * 1.1) * s, z, 0, s, s, s));
    } else {
      kit.add('laub_stamm', place(x, 1.2 * s, z, 0, s, s, s));
      const jx = (rand() - 0.5) * 0.5, jz = (rand() - 0.5) * 0.5;
      kit.add('laub_krone1', place(x + jx, (2.4 + baum.kronen_radius * 0.55) * s, z + jz, rand() * 3, baum.kronen_radius * s * 0.9, baum.kronen_radius * s * 1.1, baum.kronen_radius * s * 0.9));
      kit.add('laub_krone2', place(x - jx, (2.4 + baum.kronen_radius * 1.35) * s, z - jz, rand() * 3, baum.kronen_radius * s * 0.7, baum.kronen_radius * s * 0.8, baum.kronen_radius * s * 0.7));
    }
  }
  kit.build(group);

  // Hecken: Box pro Segment
  const heckeMat = new THREE.MeshStandardMaterial({ map: texLaub, color: '#8ab55e', roughness: 0.95 });
  for (const h of spec.hecken || []) {
    for (let i = 0; i < h.punkte.length - 1; i++) {
      const [x1, z1] = h.punkte[i], [x2, z2] = h.punkte[i + 1];
      const L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 0.3) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(L, h.hoehe, h.breite), heckeMat);
      m.position.set((x1 + x2) / 2, h.hoehe / 2, (z1 + z2) / 2);
      m.rotation.y = Math.atan2(x2 - x1, z2 - z1) + Math.PI / 2;
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
    }
  }
  return group;
}

// ---------------------------------------------------------------------------
// Wege
// ---------------------------------------------------------------------------

function baueWege(spec) {
  const group = new THREE.Group();
  // DoubleSide: die Band-Geometrie kann je nach Pfadrichtung nach unten zeigen
  const matZufahrt = new THREE.MeshStandardMaterial({ map: texKies, roughness: 1, side: THREE.DoubleSide });
  const matWeg = new THREE.MeshStandardMaterial({ map: texPflaster, roughness: 1, side: THREE.DoubleSide });
  const matTerrasse = new THREE.MeshStandardMaterial({ color: '#a07a52', roughness: 0.9, side: THREE.DoubleSide });
  for (const w of spec.wege || []) {
    const punkte = w.punkte.map(([x, z]) => [x, z]);
    const geo = band(punkte, w.breite, 0.03);
    const mat = w.farbe ? new THREE.MeshStandardMaterial({ color: w.farbe, roughness: 0.95 })
      : w.art === 'zufahrt' ? matZufahrt : w.art === 'terrasse' ? matTerrasse : matWeg;
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Hauptbau
// ---------------------------------------------------------------------------

export function buildScene(spec) {
  const group = new THREE.Group();
  const glows = [];

  // Boden
  // Boden; boden_farbe tönt die Grastextur (nur wenn vom Default abweichend —
  // der Default entspricht der Textur selbst, sonst würde alles doppelt grün).
  const bodenMat = new THREE.MeshStandardMaterial({ map: texGrass, roughness: 1 });
  if (spec.grundstueck?.boden_farbe && spec.grundstueck.boden_farbe.toLowerCase() !== '#7da05a') {
    bodenMat.color.set(spec.grundstueck.boden_farbe);
  }
  const boden = new THREE.Mesh(new THREE.CircleGeometry(160, 48), bodenMat);
  boden.rotation.x = -Math.PI / 2;
  boden.receiveShadow = true;
  group.add(boden);

  // Grundstück (gemähte Streifen, leicht über dem Boden)
  if (spec.grundstueck?.polygon?.length >= 3) {
    const shape = new THREE.Shape(spec.grundstueck.polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    const st = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: texRasenGemaeht, roughness: 1, side: THREE.DoubleSide }));
    st.position.y = 0.015;
    st.receiveShadow = true;
    group.add(st);
  }

  group.add(baueWege(spec));

  for (const geb of spec.gebaeude || []) {
    const { group: g, glowMat } = baueGebaeude(geb);
    group.add(g);
    if (glowMat) glows.push(glowMat);
  }

  group.add(baueVegetation(spec));

  // Szenengröße für Kamera & Schattenmaßstab
  const punkte = (spec.gebaeude || []).flatMap(g => g.footprint).concat(spec.grundstueck?.polygon || []);
  const ext = bbox(punkte.length >= 2 ? punkte : [[-10, -10], [10, 10]]);
  const ausdehnung = Math.max(ext.maxx - ext.minx, ext.maxz - ext.minz, 20);

  return {
    group,
    ausdehnung,
    update(now) {
      U.uTime.value = now;
      // Fenster leuchten, wenn die Nacht kommt (uNight kommt aus env.js-Presets)
      for (const m of glows) m.emissiveIntensity = 0.9 * (U.uNight?.value ?? 0);
    },
  };
}
