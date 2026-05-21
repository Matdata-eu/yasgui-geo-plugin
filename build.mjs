// Build a browser-friendly IIFE bundle for use via <script> tags.
// Exposes window.YasguiGeoTg with the default export attached as `.default`.

import { build } from 'esbuild';

await build({
  entryPoints: ['index.js'],
  outfile: 'dist/yasgui-geo-tg.min.js',
  bundle: true,
  format: 'iife',
  globalName: 'YasguiGeoTg',
  minify: true,
  sourcemap: true,
  target: ['es2020'],
  // Leaflet is expected on the page as window.L.
  external: [],
  loader: {
    '.css': 'css',
    '.png': 'dataurl',
    '.svg': 'dataurl',
    '.gif': 'dataurl',
  },
  logLevel: 'info',
});

console.log('Built dist/yasgui-geo-plugin.min.js');

await build({
  entryPoints: ['src/yasgui-compat.css'],
  outfile: 'dist/yasgui-compat.css',
  bundle: true,
  loader: {
    '.png': 'dataurl',
  },
  logLevel: 'info',
});

console.log('Built dist/yasgui-compat.css');
