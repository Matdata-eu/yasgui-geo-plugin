// Geometry simplification helper using @turf/simplify (Ramer-Douglas-Peucker).
// Skips non-line/polygon geometries.

import simplify from '@turf/simplify';
import L from 'leaflet';
import { setIcon } from './icons.js';

export const normalizeSimplifyTolerance = (value, max = 0.05) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(Math.max(num, 0), max);
};

/**
 * Simplify all line/polygon features of a GeoJSON FeatureCollection in place
 * (returns a new collection). Tolerance is in degrees of latitude/longitude.
 * @param {GeoJSON.FeatureCollection} fc
 * @param {number} tolerance
 * @returns {GeoJSON.FeatureCollection}
 */
export const simplifyFeatureCollection = (fc, tolerance) => {
  const normalizedTolerance = normalizeSimplifyTolerance(tolerance, Number.POSITIVE_INFINITY);
  if (!fc || !Array.isArray(fc.features) || normalizedTolerance <= 0) return fc;
  const features = fc.features.map((f) => {
    const t = f.geometry?.type;
    if (t === 'LineString' || t === 'MultiLineString'
      || t === 'Polygon' || t === 'MultiPolygon') {
      try {
        return simplify(f, { tolerance: normalizedTolerance, highQuality: false, mutate: false });
      } catch {
        return f;
      }
    }
    return f;
  });
  return { ...fc, features };
};

/**
 * The simplification tolerance slider with its live readout. Shared by the
 * map control and the host toolbar's view settings.
 * @param {number} initialTolerance
 * @param {{ max?: number, step?: number }} options
 * @param {(tolerance: number) => void} onChange
 * @param {Document} [doc]
 * @returns {HTMLLabelElement}
 */
export const createSimplifyField = (initialTolerance, options, onChange, doc = document) => {
  const max = Number(options?.max) || 0.05;
  const step = Number(options?.step) || 0.0001;
  const label = doc.createElement('label');
  label.title = 'Simplification tolerance';
  label.className = 'yasgui-geo-field yasgui-geo-simplify-field';
  const text = doc.createElement('span');
  const input = doc.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = String(max);
  input.step = String(step);
  input.value = String(normalizeSimplifyTolerance(initialTolerance, max));
  const updateText = () => { text.textContent = `Simplify ${Number(input.value).toFixed(4)}`; };
  input.oninput = () => {
    updateText();
    onChange(normalizeSimplifyTolerance(input.value, max));
  };
  updateText();
  label.append(text, input);
  return label;
};

/**
 * Map control with the simplification slider behind a toggle button. Used
 * when the host has no plugin toolbar; with one, the slider moves into View
 * settings.
 */
export const addSimplifyControl = (map, initialTolerance, options, onChange) => {
  const Control = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar yasgui-geo-simplify');

      // Toggle button (always visible)
      const toggle = document.createElement('a');
      toggle.href = '#';
      toggle.title = 'Simplification tolerance';
      toggle.setAttribute('role', 'button');
      toggle.setAttribute('aria-label', 'Simplification tolerance');
      toggle.setAttribute('aria-expanded', 'false');
      setIcon(toggle, 'spline');

      // Collapsible panel (hidden by default)
      const panel = document.createElement('div');
      panel.className = 'yasgui-geo-control-panel';
      panel.style.display = 'none';

      let panelOpen = false;
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        panelOpen = !panelOpen;
        panel.style.display = panelOpen ? 'block' : 'none';
        toggle.setAttribute('aria-expanded', String(panelOpen));
      });

      panel.append(createSimplifyField(initialTolerance, options, onChange));
      div.append(toggle, panel);
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    },
  });
  return new Control().addTo(map);
};
