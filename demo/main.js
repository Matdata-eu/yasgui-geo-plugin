import GeoPlugin from '../index.js';
import { createYasr, setupThemeToggle, showResults, triplesFromSelect } from './demo-host.js';
import { mockData } from './mock-data.js';

/** What the picker offers, with a hint on what to try */
const CHOICES = [
  {
    key: 'stations',
    label: 'WKT points: European train stations',
    hint: 'Hover a station for its label, click it for its values. <kbd>Ctrl</kbd>+click opens it in the describe panel, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+click shows its incoming triples.',
  },
  { key: 'cities', label: 'Lat/lon columns: world capitals', hint: 'Latitude and longitude columns are found and drawn as points.' },
  { key: 'regions', label: 'WKT polygons: European regions', hint: 'Polygons with a fill; try the colour and style settings in the toolbar.' },
  { key: 'mixed', label: 'Points, lines and polygons', hint: 'Mixed geometry types in one column.' },
  {
    key: 'overlapping',
    label: 'Overlapping features',
    hint: 'Click Leuven: four features lie on that spot, so a list lets you pick one.',
  },
  { key: 'geohash', label: 'GeoHash', hint: 'geoHashLiteral values decoded to points.' },
  { key: 'wktTypes', label: 'All WKT types', hint: 'Every WKT type, with Z, M and ZM coordinates, empty geometries and a CRS.' },
  { key: 'combination', label: 'Mixed EPSG codes', hint: 'Geometries in several coordinate reference systems in the same column, reprojected.' },
  {
    key: 'operationalPoints',
    label: 'Operational points with PLC (778 rows)',
    hint: 'GeometryCollections in EPSG:25832, loaded on first use.',
    rows: 778,
  },
];

// Larger datasets live in demo/data and are fetched on first use
const lazyData = {
  operationalPoints: () => import('./data/operational-points-plc.json').then((m) => m.default),
};

const prefixes = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  geo: 'http://www.opengis.net/ont/geosparql#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  era: 'http://data.europa.eu/949/',
  ex: 'http://example.org/',
  demo: 'http://example.org/demo#',
};

// MatGUI registers its own copy as "Geo"; this page shows the one from this repository
window.Yasgui.Yasr.registerPlugin('Geo', GeoPlugin);

setupThemeToggle(document.getElementById('theme-toggle'));

const params = new URLSearchParams(window.location.search);
const requested = params.get('dataset');
let current = CHOICES.some((choice) => choice.key === requested) ? requested : CHOICES[0].key;

const yasr = createYasr(document.getElementById('yasr'), {
  plugin: 'Geo',
  getPrefixes: () => prefixes,
  getTriples: () => triplesFromSelect(mockData[current]),
});

const select = document.getElementById('dataset');
const hint = document.getElementById('dataset-hint');
for (const choice of CHOICES) {
  const option = document.createElement('option');
  option.value = choice.key;
  const rows = mockData[choice.key]?.results.bindings.length ?? choice.rows;
  option.textContent = rows ? `${choice.label} (${rows} rows)` : choice.label;
  select.appendChild(option);
}

async function load(key) {
  if (!mockData[key] && lazyData[key]) mockData[key] = await lazyData[key]();
  current = key;
  select.value = key;
  hint.innerHTML = CHOICES.find((choice) => choice.key === key)?.hint || '';
  yasr.closeDescribe?.();
  // A map view kept in the URL hash belongs to the previous dataset; let the
  // next one fit its own geometries
  const url = new URL(window.location.href);
  url.hash = '';
  url.searchParams.set('dataset', key);
  window.history.replaceState(null, '', url);
  showResults(yasr, mockData[key]);
}

select.addEventListener('change', () => load(select.value));
await load(current);

window.yasr = yasr;
