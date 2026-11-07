// Bündelt main.js + twin-scene.js + kit.js + env.js + three.js zu EINER IIFE-Datei (twin.js)
// ohne Importmap/CDN — läuft standalone (export.py inlined sie in die Export-HTML)
// und als Preview im Dashboard.  npm install && npm run build
import * as esbuild from 'esbuild';
import path from 'node:path';

// 'three/addons/…' (Importmap-Pfad im Browser) auf node_modules/three/examples/jsm/… mappen
const threeAddons = {
  name: 'three-addons',
  setup(b) {
    b.onResolve({ filter: /^three\/addons\// }, (args) => ({
      path: path.join(process.cwd(), 'node_modules', 'three', 'examples', 'jsm', args.path.slice('three/addons/'.length)),
    }));
  },
};

await esbuild.build({
  entryPoints: ['main.js'],
  outfile: 'twin.js',
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [threeAddons],
  logLevel: 'info',
});
console.log('OK → twin.js');
