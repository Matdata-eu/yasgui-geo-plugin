import { describe, it, expect, vi } from 'vitest';
import L from 'leaflet';
import {
  distanceToSegment, distanceToPath, isInsideRings, layerContainsPoint,
  featuresAt, describeFeature, renderPicker, withBackLink,
} from '../src/overlap.js';

const pt = (x, y) => ({ x, y });
const lit = (value) => ({ type: 'literal', value });
const iri = (value) => ({ type: 'uri', value });

// A map whose container points equal (lng, -lat): enough for hit tests
// without a rendered Leaflet map.
const fakeMap = (onMap = () => true) => ({
  latLngToContainerPoint: (ll) => {
    const { lat, lng } = L.latLng(ll);
    return L.point(lng, -lat);
  },
  hasLayer: onMap,
});

describe('pixel geometry', () => {
  it('measures the distance to a segment and a path', () => {
    expect(distanceToSegment(pt(5, 3), pt(0, 0), pt(10, 0))).toBe(3);
    expect(distanceToSegment(pt(-4, 3), pt(0, 0), pt(10, 0))).toBe(5);
    expect(distanceToSegment(pt(3, 4), pt(0, 0), pt(0, 0))).toBe(5);
    expect(distanceToPath(pt(10, 5), [pt(0, 0), pt(10, 0), pt(10, 10)])).toBe(0);
    expect(distanceToPath(pt(0, 5), [pt(0, 0), pt(10, 0), pt(10, 10)])).toBe(5);
    expect(distanceToPath(pt(0, 5), [pt(0, 0), pt(10, 0), pt(10, 10)], true)).toBeCloseTo(Math.SQRT2 * 2.5);
  });

  it('tests polygon insides with holes', () => {
    const outer = [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)];
    const hole = [pt(4, 4), pt(6, 4), pt(6, 6), pt(4, 6)];
    expect(isInsideRings(pt(2, 2), [outer])).toBe(true);
    expect(isInsideRings(pt(12, 2), [outer])).toBe(false);
    expect(isInsideRings(pt(5, 5), [outer, hole])).toBe(false);
    expect(isInsideRings(pt(2, 5), [outer, hole])).toBe(true);
  });
});

describe('layerContainsPoint', () => {
  const map = fakeMap();
  it('hits circle markers within radius plus tolerance', () => {
    const m = L.circleMarker([0, 0], { radius: 5, weight: 2 });
    expect(layerContainsPoint(map, m, L.point(9, 0), 3)).toBe(true);
    expect(layerContainsPoint(map, m, L.point(10, 0), 3)).toBe(false);
  });

  it('hits lines near their segments only', () => {
    const line = L.polyline([[0, 0], [0, 100]], { weight: 2 });
    expect(layerContainsPoint(map, line, L.point(50, 3), 2)).toBe(true);
    expect(layerContainsPoint(map, line, L.point(50, 6), 2)).toBe(false);
  });

  it('hits filled polygons inside, unfilled ones on the edge only', () => {
    const latlngs = [[0, 0], [0, 100], [-100, 100], [-100, 0]];
    expect(layerContainsPoint(map, L.polygon(latlngs, { weight: 2 }), L.point(50, 50), 2)).toBe(true);
    expect(layerContainsPoint(map, L.polygon(latlngs, { weight: 2, fill: false }), L.point(50, 50), 2)).toBe(false);
    expect(layerContainsPoint(map, L.polygon(latlngs, { weight: 2, fill: false }), L.point(50, 1), 2)).toBe(true);
  });

  it('handles multipolygons', () => {
    const multi = L.polygon([
      [[[0, 0], [0, 10], [-10, 10], [-10, 0]]],
      [[[0, 50], [0, 60], [-10, 60], [-10, 50]]],
    ], { weight: 1 });
    expect(layerContainsPoint(map, multi, L.point(55, 5), 0)).toBe(true);
    expect(layerContainsPoint(map, multi, L.point(30, 5), 0)).toBe(false);
  });
});

describe('featuresAt', () => {
  const build = (features) => L.geoJson({ type: 'FeatureCollection', features }, {
    pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 4 }),
  });
  const point = (name, lng, lat) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: { name: lit(name) },
  });

  it('lists every feature under the point, clicked first, then top down', () => {
    const geo = build([point('a', 0, 0), point('b', 1, 0), point('c', 50, 0), point('d', 0, 1)]);
    const groups = new Map([['geom', L.featureGroup([geo])]]);
    const layers = geo.getLayers();
    const hits = featuresAt(fakeMap(), groups, L.latLng(0, 0), { clicked: layers[1] });
    expect(hits.map(h => h.layer.feature.properties.name.value)).toEqual(['b', 'd', 'a']);
    expect(hits.every(h => h.column === 'geom')).toBe(true);
  });

  it('skips layers that are not on the map (hidden columns, clustered markers)', () => {
    const geo = build([point('a', 0, 0), point('b', 0, 0)]);
    const hidden = geo.getLayers()[1];
    const groups = new Map([['geom', L.featureGroup([geo])]]);
    const hits = featuresAt(fakeMap(l => l !== hidden), groups, L.latLng(0, 0));
    expect(hits).toHaveLength(1);
  });
});

describe('describeFeature', () => {
  it('uses the tooltip or label, else the IRI local name, else a number', () => {
    expect(describeFeature({ s: iri('http://x/a'), wktTooltip: lit('Tip'), name: lit('N') }).title).toBe('Tip');
    expect(describeFeature({ s: iri('http://x/a'), name: lit('N') }).title).toBe('N');
    expect(describeFeature({ s: iri('http://x/ns#Station') }).title).toBe('Station');
    expect(describeFeature({ s: iri('http://x/stations/') }).title).toBe('stations');
    expect(describeFeature({}, { index: 2 }).title).toBe('Feature 3');
  });

  it('names the column and geometry type', () => {
    expect(describeFeature({}, { column: 'wkt', geometryType: 'LineString' }).subtitle).toBe('?wkt · Line');
  });
});

describe('renderPicker', () => {
  const hit = (props, color = '#f00') => {
    const layer = L.circleMarker([0, 0], { color, weight: 2 });
    layer.feature = { type: 'Feature', geometry: { type: 'Point' }, properties: props };
    return { layer, column: 'geom' };
  };

  it('lists the features and calls onPick', () => {
    const hits = [hit({ name: lit('One') }), hit({ name: lit('Two') })];
    const onPick = vi.fn();
    const el = renderPicker(hits, { onPick });
    expect(el.querySelector('.yasgui-geo-picker-header').textContent).toBe('2 features here');
    const buttons = el.querySelectorAll('button');
    expect([...buttons].map(b => b.querySelector('.yasgui-geo-picker-title').textContent)).toEqual(['One', 'Two']);
    buttons[1].click();
    expect(onPick).toHaveBeenCalledWith(hits[1]);
  });

  it('describes the row on Ctrl+click', () => {
    const hits = [hit({ s: iri('http://x/a') }), hit({ s: iri('http://x/b') })];
    const onPick = vi.fn();
    const onDescribe = vi.fn();
    const el = renderPicker(hits, { onPick, onDescribe });
    el.querySelectorAll('button')[1].dispatchEvent(new MouseEvent('click', { ctrlKey: true, shiftKey: true, bubbles: true }));
    expect(onDescribe).toHaveBeenCalledWith('http://x/b', 'object');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('highlights a row\'s feature on hover and restores it after', () => {
    const hits = [hit({}), hit({})];
    const el = renderPicker(hits, { onPick: () => {}, highlightColor: '#0f0' });
    const btn = el.querySelector('button');
    btn.dispatchEvent(new MouseEvent('mouseenter'));
    expect(hits[0].layer.options.color).toBe('#0f0');
    btn.dispatchEvent(new MouseEvent('mouseleave'));
    expect(hits[0].layer.options.color).toBe('#f00');
  });

  it('renders values as text, not HTML', () => {
    const el = renderPicker([hit({ name: lit('<img src=x onerror=alert(1)>') }), hit({})], { onPick: () => {} });
    expect(el.querySelector('img')).toBeNull();
  });
});

describe('withBackLink', () => {
  it('adds a back button before the content', () => {
    const onBack = vi.fn();
    const content = document.createElement('table');
    const el = withBackLink(content, 3, onBack);
    expect(el.firstChild.textContent).toContain('All 3 features here');
    expect(el.lastChild).toBe(content);
    el.firstChild.click();
    expect(onBack).toHaveBeenCalled();
  });
});
