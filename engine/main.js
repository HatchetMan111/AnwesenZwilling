// AnwesenTwin-Engine: mountet die Szene in #twin-scene (oder als Vollseite),
// liest window.__TWIN_DATA__ (injiziert vom Export) oder nutzt eine Demo-Szene.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnvironment, PRESETS } from './env.js';
import { buildScene } from './twin-scene.js';

// ---------------------------------------------------------------- Parameter
function scriptParams() {
  try { if (document.currentScript?.src) return new URL(document.currentScript.src).searchParams; } catch { /* file:// */ }
  return new URLSearchParams(location.search);
}
const PARAMS = scriptParams();

// Demo-Szene, damit twin.js auch ohne Daten etwas Schönes zeigt
const DEMO = {
  version: 1,
  grundstueck: { polygon: [[-22, -18], [22, -18], [22, 18], [-22, 18]], boden_farbe: '#7da05a' },
  gebaeude: [{
    id: 'haus', name: 'Hauptgebäude',
    footprint: [[-8, -6], [8, -6], [8, 6], [-8, 6]],
    etagen: 2, etagen_hoehe: 2.7,
    dach: { form: 'sattel', neigung: 35, first_richtung: 0, ueberstand: 0.5 },
    wand_farbe: '#e8e2d6', dach_farbe: '#704a3a', fenster_anteil: 0.3,
    tuer_seite: 's', pv: true, quelle: 'manuell',
  }],
  vegetation: [
    { position: [-14, -10], hoehe: 8, kronen_radius: 3.2, art: 'laub' },
    { position: [15, 4], hoehe: 6, kronen_radius: 2.4, art: 'laub' },
    { position: [-16, 8], hoehe: 10, kronen_radius: 1.6, art: 'nadel' },
  ],
  hecken: [{ punkte: [[-22, 17], [22, 17]], hoehe: 1.2, breite: 0.8 }],
  wege: [
    { punkte: [[0, 24], [0, 6]], breite: 3, art: 'zufahrt' },
    { punkte: [[0, 6], [0, 6.4]], breite: 2, art: 'terrasse' },
  ],
  meta: { massstab_referenz: 'Demo', quellen: ['demo'], notizen: [] },
};

const DATA = window.__TWIN_DATA__ || DEMO;

// ---------------------------------------------------------------- Root finden
function findeRoot() {
  const angegeben = PARAMS.get('container') || '#twin-scene';
  const el = document.querySelector(angegeben);
  if (el) return el;
  // Nichts da (z. B. Script lädt vor dem DOM): Vollbild-Root, adoptiert später, falls doch einer kommt
  const root = document.createElement('div');
  root.id = 'twin-standalone';
  root.style.cssText = 'position:fixed;inset:0;margin:0;padding:0';
  document.body.appendChild(root);
  new MutationObserver((muts, obs) => {
    const ziel = document.querySelector(angegeben);
    if (ziel && ziel !== root) { ziel.appendChild(renderer.domElement); ui(ziel); obs.disconnect(); }
  }).observe(document, { childList: true, subtree: true });
  return root;
}

// ---------------------------------------------------------------- Renderer
const root = findeRoot();
const W = () => root.clientWidth || innerWidth;
const H = () => root.clientHeight || innerHeight;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, PARAMS.get('quality') === 'fast' ? 1 : 2));
renderer.setSize(W(), H());
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W() / H(), 0.1, 2000);

const welt = buildScene(DATA);
scene.add(welt.group);

const env = createEnvironment(renderer, scene, { preset: PARAMS.get('light') || 'morning', scale: Math.max(40, welt.ausdehnung) });

// Kamera: schräg von Süd-Ost auf das Anwesen
const d = welt.ausdehnung;
camera.position.set(d * 0.9, d * 0.65, d * 1.1);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 4;
controls.maxDistance = d * 6;
controls.target.set(0, 1, 0);

// ---------------------------------------------------------------- UI
function ui(el) {
  if (el.querySelector('.twin-ui')) return;
  const bar = document.createElement('div');
  bar.className = 'twin-ui';
  bar.style.cssText = [
    'position:absolute', 'top:12px', 'left:50%', 'transform:translateX(-50%)',
    'display:flex', 'gap:6px', 'z-index:10', 'font:12px/1 system-ui,sans-serif',
  ].join(';');
  for (const [name, label] of [['morning', 'Morgen'], ['golden', 'Goldene Stunde'], ['dusk', 'Dämmerung'], ['night', 'Nacht']]) {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.preset = name;
    b.style.cssText = 'padding:6px 12px;border:0;border-radius:999px;background:rgba(16,20,26,.72);color:#e5e7eb;cursor:pointer;backdrop-filter:blur(6px)';
    b.onclick = () => { env.set(name); markiere(name); };
    bar.appendChild(b);
  }
  el.style.position = el.style.position || 'relative';
  el.appendChild(bar);
  markiere(env.current);
}
function markiere(name) {
  root.querySelectorAll('.twin-ui button').forEach(b => {
    b.style.background = b.dataset.preset === name ? 'rgba(232,180,60,.9)' : 'rgba(16,20,26,.72)';
    b.style.color = b.dataset.preset === name ? '#10141a' : '#e5e7eb';
  });
}
ui(root);

// ---------------------------------------------------------------- Loop
addEventListener('resize', () => {
  camera.aspect = W() / H();
  camera.updateProjectionMatrix();
  renderer.setSize(W(), H());
});

const uhr = new THREE.Clock();
renderer.render(scene, camera);                      // erster Frame synchron, damit nie weiß
window.__ready = true;
window.__twin = { scene, camera, controls, renderer, env, welt, DATA, PRESETS };

renderer.setAnimationLoop(() => {
  const now = uhr.getElapsedTime();
  welt.update(now);
  env.update(camera, controls.target);
  controls.update();
  renderer.render(scene, camera);
});
