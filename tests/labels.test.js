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
