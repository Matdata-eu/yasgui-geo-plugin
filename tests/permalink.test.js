import { describe, it, expect } from 'vitest';
import { formatHashValue, mergeGeoHashParam, parseHashValue, bindHashState } from '../src/permalink.js';

const makeMapMock = () => ({
  setView() { return this; },
  on() { return this; },
  off() { return this; },
  hasLayer() { return false; },
  removeLayer() { return this; },
  getCenter() { return { lat: 0, lng: 0 }; },
  getZoom() { return 1; },
});

describe('permalink helpers', () => {
  it('formats and parses map view with visible layers', () => {
    const value = formatHashValue({
      zoom: 12,
      lat: 50.123456,
      lon: 4.654321,
      basemap: 'CartoDB Voyager',
      layers: ['geom', 'shape'],
    });
    expect(value).toBe('12/50.12346/4.65432/CartoDB Voyager/geom,shape');
    expect(parseHashValue(encodeURIComponent(value))).toEqual({
      zoom: 12,
      lat: 50.12346,
      lon: 4.65432,
      basemap: 'CartoDB Voyager',
      layers: ['geom', 'shape'],
    });
  });

  it('merges geo state without dropping other hash params', () => {
    const next = mergeGeoHashParam('#query=abc&geo=old&tab=1', '5/1.00000/2.00000/openStreetMap/geom');
    expect(next).toBe('#query=abc&tab=1&geo=5%2F1.00000%2F2.00000%2FopenStreetMap%2Fgeom');
  });

  it('returns null for invalid geo hash values', () => {
    expect(parseHashValue('bad')).toBeNull();
  });
});

describe('bindHashState restore signalling', () => {
  it('reports restoredView=true when a geo hash is present', () => {
    window.location.hash = '#geo=8/50.00000/4.00000/openStreetMap';
    const handle = bindHashState(makeMapMock(), { basemaps: {} });
    expect(handle.restoredView).toBe(true);
    handle.dispose();
    window.location.hash = '';
  });

  it('reports restoredView=false when no geo hash is present', () => {
    window.location.hash = '';
    const handle = bindHashState(makeMapMock(), { basemaps: {} });
    expect(handle.restoredView).toBe(false);
    handle.dispose();
  });
});
