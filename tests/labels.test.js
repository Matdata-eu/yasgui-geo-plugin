import { describe, it, expect } from 'vitest';
import L from 'leaflet';
import { attachHoverHighlight, bindFeatureLabel, findLabel, highlightStyle } from '../src/labels.js';

const lit = (value) => ({ type: 'literal', value });

describe('findLabel', () => {
  it('prefers the conventional label bindings in order', () => {
    expect(findLabel({ name: lit('n'), label: lit('l'), wktLabel: lit('w') })).toBe('w');
    expect(findLabel({ name: lit('n'), label: lit('l') })).toBe('l');
    expect(findLabel({ title: lit('t') })).toBe('t');
  });

  it('falls back to variables ending in Label, Name or Title', () => {
    expect(findLabel({ s: { type: 'uri', value: 'http://x' }, stationLabel: lit('Brussels-South') })).toBe('Brussels-South');
    expect(findLabel({ lineName: lit('L50') })).toBe('L50');
  });

  it('ignores IRIs and empty values', () => {
    expect(findLabel({ label: { type: 'uri', value: 'http://x' }, name: lit('  ') })).toBeNull();
    expect(findLabel({})).toBeNull();
    expect(findLabel(undefined)).toBeNull();
  });
});

describe('highlightStyle', () => {
  it('thickens the outline and uses the highlight color', () => {
    const s = highlightStyle({ weight: 2, fillOpacity: 0.7 }, '#f00');
    expect(s.color).toBe('#f00');
    expect(s.weight).toBe(4);
    expect(s.opacity).toBe(1);
    expect(s.fillOpacity).toBeCloseTo(0.85);
    expect(highlightStyle({ weight: 6 }).weight).toBe(8);
  });
});

describe('attachHoverHighlight', () => {
  it('highlights on mouseover and restores the style on mouseout', () => {
    const layer = L.polygon([[0, 0], [1, 0], [1, 1]], { color: '#3388ff', weight: 2, opacity: 0.8, fillOpacity: 0.5 });
    attachHoverHighlight(layer, '#f0f');
    layer.fire('mouseover');
    expect(layer.options.color).toBe('#f0f');
    expect(layer.options.weight).toBe(4);
    layer.fire('mouseout');
    expect(layer.options).toMatchObject({ color: '#3388ff', weight: 2, opacity: 0.8, fillOpacity: 0.5 });
  });

  it('restores each part of a GeometryCollection to its own style', () => {
    let group;
    L.geoJson({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Point', coordinates: [10, 59] },
          { type: 'LineString', coordinates: [[10, 59], [10.1, 59.1]] },
        ],
      },
    }, {
      pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 4 }),
      style: () => ({ color: '#00f', weight: 3, opacity: 0.8, fillOpacity: 0.5 }),
      onEachFeature: (f, layer) => { group = layer; attachHoverHighlight(layer, '#f0f'); },
    });
    const parts = group.getLayers();
    expect(parts).toHaveLength(2);
    parts[1].fire('mouseover', {}, true);
    for (const p of parts) expect(p.options.color).toBe('#f0f');
    parts[1].fire('mouseout', {}, true);
    for (const p of parts) {
      expect(p.options).toMatchObject({ color: '#00f', weight: 3, opacity: 0.8, fillOpacity: 0.5 });
    }
  });

  it('restores the style when the mouse moves off the layer without a mouseout', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const map = L.map(el).setView([0, 0], 5);
    const layer = L.polygon([[0, 0], [1, 0], [1, 1]], { color: '#3388ff', weight: 2 }).addTo(map);
    attachHoverHighlight(layer, '#f0f');
    layer.fire('mouseover');
    layer.getElement().dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(layer.options.color).toBe('#f0f');
    map.getContainer().dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(layer.options).toMatchObject({ color: '#3388ff', weight: 2 });
    map.remove();
    el.remove();
  });

  it('closes the hover label along with the highlight', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const map = L.map(el).setView([0, 0], 5);
    const layer = L.polygon([[0, 0], [1, 0], [1, 1]]).addTo(map);
    bindFeatureLabel(layer, { label: lit('Area') }, false);
    attachHoverHighlight(layer, '#f0f');
    layer.fire('mouseover');
    layer.openTooltip([0.5, 0.5]);
    expect(layer.isTooltipOpen()).toBe(true);
    map.getContainer().dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(layer.isTooltipOpen()).toBe(false);
    map.remove();
    el.remove();
  });

  it('restores the style when the layer is removed while hovered', () => {
    const map = L.map(document.createElement('div')).setView([0, 0], 5);
    const layer = L.circleMarker([0, 0], { color: '#3388ff', weight: 2 }).addTo(map);
    attachHoverHighlight(layer, '#f0f');
    layer.fire('mouseover');
    map.removeLayer(layer);
    expect(layer.options).toMatchObject({ color: '#3388ff', weight: 2 });
  });
});

describe('bindFeatureLabel', () => {
  it('shows the label on hover by default, with ?wktTooltip taking precedence', () => {
    const a = L.polygon([[0, 0], [1, 0], [1, 1]]);
    bindFeatureLabel(a, { label: lit('Area') }, false);
    expect(a.getTooltip().getContent()).toBe('Area');
    expect(a.getTooltip().options.permanent).toBe(false);

    const b = L.polygon([[0, 0], [1, 0], [1, 1]]);
    bindFeatureLabel(b, { label: lit('Area'), wktTooltip: lit('Tip') }, false);
    expect(b.getTooltip().getContent()).toBe('Tip');
  });

  it('binds a permanent label when labels are switched on', () => {
    const a = L.circleMarker([0, 0], { radius: 5 });
    bindFeatureLabel(a, { label: lit('Station') }, true);
    expect(a.getTooltip().options.permanent).toBe(true);
    expect(a.getTooltip().options.direction).toBe('right');
  });

  it('binds nothing when the row has no label', () => {
    const a = L.polygon([[0, 0], [1, 0], [1, 1]]);
    bindFeatureLabel(a, { s: { type: 'uri', value: 'http://x' } }, true);
    expect(a.getTooltip()).toBeUndefined();
  });
});
