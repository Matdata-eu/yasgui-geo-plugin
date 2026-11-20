// Picking one of several overlapping features.
//
// Leaflet only delivers a click to the topmost feature under the mouse, so a
// feature drawn under another one (a station under a line, two identical
// points, a point inside a polygon) can't be reached. On a click we look for
// every visible feature at that spot; when there is more than one, a popup
// lists them and the user picks the one to open.

import L from 'leaflet';
import { findLabel, highlightStyle, DEFAULT_HIGHLIGHT_COLOR } from './labels.js';
import { findEntityIri, isDescribeClick, describeDirection } from './describe.js';

/** Extra distance, in pixels, around a feature that still counts as a hit. */
export const DEFAULT_PICK_TOLERANCE = 4;

// ---------------------------------------------------------------------------
// Geometry in screen pixels ({x, y} points). Kept free of Leaflet so it can
// be tested on its own.

/** Distance from point p to the segment a-b. */
export const distanceToSegment = (p, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + t * dx - p.x;
  const y = a.y + t * dy - p.y;
  return Math.sqrt(x * x + y * y);
};

/** Smallest distance from p to a polyline (open, or closed for a ring). */
export const distanceToPath = (p, points, closed = false) => {
  let min = Infinity;
  const n = points.length;
  if (n === 1) return Math.hypot(p.x - points[0].x, p.y - points[0].y);
  for (let i = 0; i < n - 1; i++) min = Math.min(min, distanceToSegment(p, points[i], points[i + 1]));
  if (closed && n > 2) min = Math.min(min, distanceToSegment(p, points[n - 1], points[0]));
  return min;
};

/**
 * Whether p lies inside a polygon given as rings (outer ring and holes),
 * with the even-odd rule, so a point in a hole is outside.
 */
export const isInsideRings = (p, rings) => {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if ((a.y > p.y) !== (b.y > p.y)
        && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
  }
  return inside;
};

// ---------------------------------------------------------------------------
// Leaflet layers

// The vector paths of a feature layer: the layer itself, or the leaves of a
// group (a GeometryCollection becomes an L.FeatureGroup).
const leavesOf = (layer) => {
  if (typeof layer.eachLayer === 'function') {
    const leaves = [];
    layer.eachLayer(child => leaves.push(...leavesOf(child)));
    return leaves;
  }
  return [layer];
};

// Polygon latlngs as a list of polygons, each a list of rings.
const polygonsOf = (latlngs) => {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return [];
  if (L.LineUtil.isFlat(latlngs)) return [[latlngs]];
  if (L.LineUtil.isFlat(latlngs[0])) return [latlngs];
  return latlngs.flatMap(polygonsOf);
};

// Polyline latlngs as a list of lines.
const linesOf = (latlngs) => {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return [];
  if (L.LineUtil.isFlat(latlngs)) return [latlngs];
  return latlngs.flatMap(linesOf);
};

/**
 * Whether one leaf layer (circle marker, marker, polyline or polygon) is
 * drawn at the container point p.
 * @param {L.Map} map
 * @param {L.Layer} layer
 * @param {L.Point} p - container point of the click
 * @param {number} tolerance - extra pixels around the feature
 * @returns {boolean}
 */
export const layerContainsPoint = (map, layer, p, tolerance = DEFAULT_PICK_TOLERANCE) => {
  const toPx = (latlng) => map.latLngToContainerPoint(latlng);
  const halfWeight = (layer.options?.stroke === false ? 0 : (layer.options?.weight ?? 0)) / 2;
  if (typeof layer.getLatLng === 'function') {
    const c = toPx(layer.getLatLng());
    // Circle markers have a pixel radius; markers are treated as a small disc.
    const radius = typeof layer.getRadius === 'function' && !(layer instanceof L.Circle)
      ? layer.getRadius()
      : 8;
    return Math.hypot(p.x - c.x, p.y - c.y) <= radius + halfWeight + tolerance;
  }
  if (typeof layer.getLatLngs !== 'function') return false;
  // Cheap rejection on the pixel bounding box first.
  const bounds = layer.getBounds?.();
  if (bounds?.isValid?.()) {
    const pad = halfWeight + tolerance;
    const nw = toPx(bounds.getNorthWest());
    const se = toPx(bounds.getSouthEast());
    if (p.x < Math.min(nw.x, se.x) - pad || p.x > Math.max(nw.x, se.x) + pad
      || p.y < Math.min(nw.y, se.y) - pad || p.y > Math.max(nw.y, se.y) + pad) return false;
  }
  const latlngs = layer.getLatLngs();
  if (layer instanceof L.Polygon) {
    const filled = layer.options?.fill !== false;
    for (const rings of polygonsOf(latlngs)) {
      const px = rings.map(ring => ring.map(toPx));
      if (filled && isInsideRings(p, px)) return true;
      if (px.some(ring => distanceToPath(p, ring, true) <= halfWeight + tolerance)) return true;
    }
    return false;
  }
  return linesOf(latlngs).some(line => distanceToPath(p, line.map(toPx)) <= halfWeight + tolerance);
};

/**
 * Every visible feature at a latlng, the clicked one first and the others
 * from the top of the map down.
 * @param {L.Map} map
 * @param {Iterable<[string, L.Layer]>} groups - geometry column name → its layer group
 * @param {L.LatLng} latlng
 * @param {Object} [opts]
 * @param {L.Layer} [opts.clicked] - the layer that received the click
 * @param {number} [opts.tolerance]
 * @returns {{ layer: L.Layer, column: string }[]}
 */
export const featuresAt = (map, groups, latlng, opts = {}) => {
  const tolerance = opts.tolerance ?? DEFAULT_PICK_TOLERANCE;
  const p = map.latLngToContainerPoint(latlng);
  const hits = [];
  const seen = new Set();
  const visit = (layer, column) => {
    if (layer.feature) {
      if (seen.has(layer) || !map.hasLayer(layer)) return;
      seen.add(layer);
      if (leavesOf(layer).some(leaf => layerContainsPoint(map, leaf, p, tolerance))) {
        hits.push({ layer, column });
      }
      return;
    }
    // Groups, GeoJSON layers and marker clusters (whose eachLayer also lists
    // clustered markers, which hasLayer then leaves out).
    if (typeof layer.eachLayer === 'function') layer.eachLayer(child => visit(child, column));
  };
  for (const [column, group] of groups) {
    if (map.hasLayer(group)) visit(group, column);
  }
  // Later layers are drawn on top: list them first.
  hits.reverse();
  if (opts.clicked) {
    const i = hits.findIndex(h => h.layer === opts.clicked);
    if (i > 0) hits.unshift(...hits.splice(i, 1));
  }
  return hits;
};

// ---------------------------------------------------------------------------
// Picker popup

const localName = (iri) => {
  const m = /[^/#:]+[/#]?$/.exec(iri);
  return m ? m[0].replace(/[/#]$/, '') : iri;
};

const GEOMETRY_NAMES = {
  Point: 'Point', MultiPoint: 'Points', LineString: 'Line', MultiLineString: 'Lines',
  Polygon: 'Polygon', MultiPolygon: 'Polygons', GeometryCollection: 'Geometries',
};

/**
 * Title, subtitle and IRI shown for a feature in the picker.
 * @param {Object} properties - SPARQL bindings of the row
 * @param {Object} [opts]
 * @param {string} [opts.column] - geometry column name
 * @param {string} [opts.geometryType] - GeoJSON geometry type
 * @param {number} [opts.index] - position in the list, for a fallback title
 */
export const describeFeature = (properties, opts = {}) => {
  const iri = findEntityIri(properties);
  const label = properties?.wktTooltip?.value || findLabel(properties);
  const title = label || (iri ? localName(iri) : `Feature ${(opts.index ?? 0) + 1}`);
  const parts = [];
  if (opts.column) parts.push(`?${opts.column}`);
  if (opts.geometryType) parts.push(GEOMETRY_NAMES[opts.geometryType] || opts.geometryType);
  return { title, subtitle: parts.join(' · '), iri };
};

const colorOf = (layer) => {
  if (layer.pickerColor) return layer.pickerColor;
  const leaf = leavesOf(layer).find(l => l.options);
  return leaf?.options?.color || leaf?.options?.fillColor || '#3388ff';
};

// Highlight a feature while its row in the picker is hovered or focused.
const previewHighlight = (layer, color) => {
  const saved = leavesOf(layer)
    .filter(l => typeof l.setStyle === 'function')
    .map(l => [l, { color: l.options.color, weight: l.options.weight, opacity: l.options.opacity, fillOpacity: l.options.fillOpacity }]);
  for (const [l, style] of saved) l.setStyle(highlightStyle(style, color));
  return () => { for (const [l, style] of saved) l.setStyle(style); };
};

/**
 * Build the picker list.
 * @param {{ layer: L.Layer, column: string }[]} hits
 * @param {Object} handlers
 * @param {(hit: Object) => void} handlers.onPick - a feature was chosen
 * @param {(iri: string, direction: string) => void} [handlers.onDescribe] - Ctrl/Cmd+click on a row
 * @param {string|null} [handlers.highlightColor] - preview highlight color, null for none
 * @param {Document} [handlers.doc]
 * @returns {HTMLElement}
 */
export const renderPicker = (hits, handlers) => {
  const doc = handlers.doc || document;
  const root = doc.createElement('div');
  root.className = 'yasgui-geo-picker';
  const header = doc.createElement('div');
  header.className = 'yasgui-geo-picker-header';
  header.textContent = `${hits.length} features here`;
  root.appendChild(header);
  const list = doc.createElement('ul');
  list.className = 'yasgui-geo-picker-list';
  list.setAttribute('aria-label', 'Features at this location');
  hits.forEach((hit, index) => {
    const props = hit.layer.feature?.properties || {};
    const info = describeFeature(props, {
      column: hit.column,
      geometryType: hit.layer.feature?.geometry?.type,
      index,
    });
    const li = doc.createElement('li');
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'yasgui-geo-picker-item';
    if (info.iri) btn.title = info.iri;
    const swatch = doc.createElement('span');
    swatch.className = 'yasgui-geo-picker-swatch';
    swatch.style.background = colorOf(hit.layer);
    swatch.setAttribute('aria-hidden', 'true');
    const text = doc.createElement('span');
    text.className = 'yasgui-geo-picker-text';
    const title = doc.createElement('span');
    title.className = 'yasgui-geo-picker-title';
    title.textContent = info.title;
    text.appendChild(title);
    if (info.subtitle) {
      const sub = doc.createElement('span');
      sub.className = 'yasgui-geo-picker-subtitle';
      sub.textContent = info.subtitle;
      text.appendChild(sub);
    }
    btn.append(swatch, text);
    let restore = null;
    const unhighlight = () => { restore?.(); restore = null; };
    if (handlers.highlightColor) {
      const highlight = () => { if (!restore) restore = previewHighlight(hit.layer, handlers.highlightColor); };
      btn.addEventListener('mouseenter', highlight);
      btn.addEventListener('focus', highlight);
      btn.addEventListener('mouseleave', unhighlight);
      btn.addEventListener('blur', unhighlight);
    }
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      unhighlight();
      if (isDescribeClick(ev) && info.iri && handlers.onDescribe) {
        handlers.onDescribe(info.iri, describeDirection(ev));
        return;
      }
      handlers.onPick(hit);
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
  root.appendChild(list);
  return root;
};

/**
 * Wrap a feature's popup content with a link back to the picker.
 * @param {Node|string} content - the feature's own popup content
 * @param {number} count - number of features in the picker
 * @param {() => void} onBack
 * @param {Document} [doc]
 * @returns {HTMLElement}
 */
export const withBackLink = (content, count, onBack, doc = document) => {
  const root = doc.createElement('div');
  root.className = 'yasgui-geo-picked';
  const back = doc.createElement('button');
  back.type = 'button';
  back.className = 'yasgui-geo-picker-back';
  back.textContent = `← All ${count} features here`;
  back.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    onBack();
  });
  root.appendChild(back);
  if (typeof content === 'string') {
    const span = doc.createElement('span');
    span.textContent = content;
    root.appendChild(span);
  } else if (content) {
    root.appendChild(content);
  }
  return root;
};

/**
 * Open the picker at a latlng. Picking a row opens that feature's own popup
 * (with a link back to the list) at the same spot.
 * @param {L.Map} map
 * @param {L.LatLng} latlng
 * @param {{ layer: L.Layer, column: string }[]} hits
 * @param {Object} opts
 * @param {Object} opts.popupOptions - Leaflet popup options
 * @param {(iri: string, direction: string) => void} [opts.onDescribe]
 * @param {string|null} [opts.highlightColor]
 * @returns {L.Popup}
 */
export const openPicker = (map, latlng, hits, opts) => {
  const highlightColor = opts.highlightColor === undefined ? DEFAULT_HIGHLIGHT_COLOR : opts.highlightColor;
  const showList = () => {
    const content = renderPicker(hits, {
      onPick: showFeature,
      onDescribe: opts.onDescribe,
      highlightColor,
    });
    return L.popup(opts.popupOptions).setLatLng(latlng).setContent(content).openOn(map);
  };
  const showFeature = (hit) => {
    const content = hit.layer.getPopup?.()?.getContent?.();
    L.popup(opts.popupOptions)
      .setLatLng(latlng)
      .setContent(withBackLink(content, hits.length, showList))
      .openOn(map);
  };
  return showList();
};
