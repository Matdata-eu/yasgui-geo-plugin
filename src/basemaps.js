// Built-in background maps and tile overlays. None of them needs an API key.
//
// Each entry is a factory so every map instance gets its own layer: a single
// L.tileLayer cannot be shared across maps — sharing causes tiles to fail
// loading when the plugin is re-instantiated on the same page.

import L from 'leaflet';

/** Name of the base layer that shows no background map. */
export const NO_BASEMAP = 'None';

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ESRI_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services';

export const builtInBasemapFactories = {
  openStreetMap: () => L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: OSM_ATTRIBUTION, maxZoom: 19 },
  ),
  'OSM Humanitarian': () => L.tileLayer(
    'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    { attribution: `${OSM_ATTRIBUTION}, tiles by <a href="https://www.hotosm.org/">Humanitarian OpenStreetMap Team</a>`, maxZoom: 19 },
  ),
  CyclOSM: () => L.tileLayer(
    'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    { attribution: `${OSM_ATTRIBUTION}, tiles by <a href="https://www.cyclosm.org/">CyclOSM</a>`, maxZoom: 20 },
  ),
  openTopoMap: () => L.tileLayer(
    'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    { attribution: `${OSM_ATTRIBUTION}, SRTM | style &copy; <a href="https://opentopomap.org">OpenTopoMap</a>`, maxZoom: 17 },
  ),
  'ESRI World Imagery (Satellite)': () => L.tileLayer(
    `${ESRI_URL}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    {
      attribution:
        'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 19,
    },
  ),
  'ESRI World Topo': () => L.tileLayer(
    `${ESRI_URL}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
    { attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, USGS, NGA, and the GIS User Community', maxZoom: 19 },
  ),
  'ESRI Light Gray': () => L.tileLayer(
    `${ESRI_URL}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    { attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors', maxZoom: 16 },
  ),
  'ESRI Dark Gray': () => L.tileLayer(
    `${ESRI_URL}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    { attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors', maxZoom: 16 },
  ),
  // An empty layer, so the background map can be switched off.
  [NO_BASEMAP]: () => L.layerGroup(),
};

export const builtInOverlayFactories = {
  OpenRailwayMap: () => L.tileLayer(
    'https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
    {
      attribution: `${OSM_ATTRIBUTION}, style: <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a> (CC-BY-SA)`,
      maxZoom: 19,
    },
  ),
  'ESRI Place Names & Boundaries': () => L.tileLayer(
    `${ESRI_URL}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    { attribution: 'Labels &copy; Esri', maxZoom: 19 },
  ),
};

/**
 * Build a fresh set of layers, accepting either a factory map (preferred) or
 * a legacy map of pre-built layers (treated as-is for back-compat).
 * @param {Record<string, (() => L.Layer) | L.Layer>} source
 * @returns {Record<string, L.Layer>}
 */
export const buildBasemaps = (source) => {
  const out = {};
  for (const [name, value] of Object.entries(source || {})) {
    out[name] = typeof value === 'function' ? value() : value;
  }
  return out;
};
