// Sync map view (basemap, center, zoom, visible overlays) to URL hash so users
// can share links that restore the same view.
// Hash format: #geo=zoom/lat/lon[/basemap[/layer1,layer2]]
//
// Uses a custom hash key so it doesn't conflict with Yasgui's own hash state.

const KEY = 'geo';

export const parseHashValue = (value) => {
  const parts = decodeURIComponent(value || '').split('/');
  const zoom = Number(parts[0]);
  const lat = Number(parts[1]);
  const lon = Number(parts[2]);
  const basemap = parts[3];
  const layers = parts[4] ? parts[4].split(',').filter(Boolean) : null;
  if (![zoom, lat, lon].every(Number.isFinite)) return null;
  return { zoom, lat, lon, basemap, layers };
};

const parseHash = () => {
  const m = (window.location.hash || '').match(new RegExp(`${KEY}=([^&]+)`));
  return m ? parseHashValue(m[1]) : null;
};

export const formatHashValue = ({ zoom, lat, lon, basemap, layers }) => {
  const layerPart = Array.isArray(layers) && layers.length ? `/${layers.join(',')}` : '';
  return `${zoom}/${lat.toFixed(5)}/${lon.toFixed(5)}${basemap ? `/${basemap}${layerPart}` : ''}`;
};

export const mergeGeoHashParam = (existingHash, value) => {
  const existing = (existingHash || '').replace(/^#/, '');
  const parts = existing.split('&').filter(p => p && !p.startsWith(`${KEY}=`));
  parts.push(`${KEY}=${encodeURIComponent(value)}`);
  return `#${parts.join('&')}`;
};

const writeHash = (zoom, lat, lon, basemap, layers) => {
  const value = formatHashValue({ zoom, lat, lon, basemap, layers });
  const next = mergeGeoHashParam(window.location.hash, value);
  if (next !== window.location.hash) {
    history.replaceState(null, '', next);
  }
};

/**
 * Bind the map to the URL hash. Restores view if hash is set; otherwise leaves
 * the map at its current center/zoom. Returns a handle exposing whether a view
 * was restored, a layer-visibility applier, and a dispose function.
 * @param {L.Map} map
 * @param {{ basemaps: Record<string, L.Layer>, currentBasemapName?: string, getVisibleLayers?: () => string[], setVisibleLayers?: (layers: string[]) => void }} ctx
 * @returns {{ restoredView: boolean, applyLayerVisibility: () => void, dispose: () => void }}
 */
export const bindHashState = (map, ctx) => {
  let currentBasemap = ctx.currentBasemapName;

  // Restore
  const restored = parseHash();
  if (restored) {
    map.setView([restored.lat, restored.lon], restored.zoom);
    if (restored.basemap && ctx.basemaps[restored.basemap]) {
      for (const [name, layer] of Object.entries(ctx.basemaps)) {
        if (map.hasLayer(layer) && name !== restored.basemap) map.removeLayer(layer);
      }
      ctx.basemaps[restored.basemap].addTo(map);
      currentBasemap = restored.basemap;
    }
  }
  // Signals to the caller that a shareable view was restored, so the plugin
  // can skip its automatic fit-to-data (which would otherwise fight the
  // restored view via a deferred moveend and land on the wrong extent).
  const restoredView = restored !== null;

  const update = () => {
    const c = map.getCenter();
    writeHash(map.getZoom(), c.lat, c.lng, currentBasemap, ctx.getVisibleLayers?.());
  };
  const applyLayerVisibility = () => {
    const current = parseHash();
    if (current?.layers && ctx.setVisibleLayers) ctx.setVisibleLayers(current.layers);
  };
  map.on('moveend zoomend', update);
  map.on('overlayadd overlayremove', update);
  const onBaselayerChange = (e) => {
    currentBasemap = e.name;
    update();
  };
  map.on('baselayerchange', onBaselayerChange);

  return {
    applyLayerVisibility,
    restoredView,
    dispose() {
      map.off('moveend zoomend', update);
      map.off('overlayadd overlayremove', update);
      map.off('baselayerchange', onBaselayerChange);
    },
  };
};
