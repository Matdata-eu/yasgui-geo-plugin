import { describe, it, expect } from 'vitest';
import L from 'leaflet';
import { NO_BASEMAP, buildBasemaps, builtInBasemapFactories, builtInOverlayFactories } from '../src/basemaps.js';

describe('built-in basemaps', () => {
  it('offers a None option that draws no tiles', () => {
    const layers = buildBasemaps(builtInBasemapFactories);
    expect(layers[NO_BASEMAP]).toBeInstanceOf(L.LayerGroup);
    expect(layers[NO_BASEMAP]).not.toBeInstanceOf(L.TileLayer);
  });

  it('no longer ships the CartoDB layers that need an API key', () => {
    const names = Object.keys(builtInBasemapFactories).join(' ');
    expect(names).not.toMatch(/carto/i);
    for (const layer of Object.values(buildBasemaps(builtInBasemapFactories))) {
      expect(layer._url || '').not.toMatch(/cartocdn/);
    }
  });

  it('keeps openStreetMap as a key so the default basemap still resolves', () => {
    expect(builtInBasemapFactories.openStreetMap).toBeTypeOf('function');
  });

  it('uses keyless tile URLs with attribution', () => {
    const all = { ...buildBasemaps(builtInBasemapFactories), ...buildBasemaps(builtInOverlayFactories) };
    for (const [name, layer] of Object.entries(all)) {
      if (name === NO_BASEMAP) continue;
      expect(layer).toBeInstanceOf(L.TileLayer);
      expect(layer._url).toMatch(/^https:\/\//);
      expect(layer._url).not.toMatch(/api[_-]?key|access_token|\{apikey\}/i);
      expect(layer.options.attribution).toBeTruthy();
    }
  });

  it('builds fresh layers per call and passes pre-built layers through', () => {
    const a = buildBasemaps(builtInBasemapFactories);
    const b = buildBasemaps(builtInBasemapFactories);
    expect(a.openStreetMap).not.toBe(b.openStreetMap);
    const custom = L.tileLayer('https://example.org/{z}/{x}/{y}.png');
    expect(buildBasemaps({ custom }).custom).toBe(custom);
    expect(buildBasemaps(null)).toEqual({});
  });
});
