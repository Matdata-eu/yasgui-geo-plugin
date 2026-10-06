// Hover highlighting and feature labels.
//
// - Hovering a feature outlines its full extent in a contrasting color and
//   brings it to the front, so overlapping features can be told apart.
// - Hovering shows the feature's label (or ?wktTooltip) as a tooltip.
// - A map control toggles permanent labels on every labelled feature.

import L from 'leaflet';

/** Default outline color for a hovered feature. */
export const DEFAULT_HIGHLIGHT_COLOR = '#ff1493';

// Binding names tried first, in order, when looking for a feature's label.
const LABEL_NAMES = ['wktLabel', 'label', 'name', 'title'];
const LABEL_SUFFIX = /(label|name|title)$/i;

const isLiteral = (binding) => binding && binding.type !== 'uri' && binding.type !== 'iri'
  && binding.type !== 'bnode' && typeof binding.value === 'string' && binding.value.trim() !== '';

/**
 * The label of a feature row: `?wktLabel`, `?label`, `?name` or `?title`,
 * else the first literal binding whose name ends in Label, Name or Title
 * (e.g. `?stationLabel`).
 * @param {Object} properties - SPARQL bindings of the row
 * @returns {string|null}
 */
export const findLabel = (properties) => {
  if (!properties) return null;
  for (const name of LABEL_NAMES) {
    if (isLiteral(properties[name])) return properties[name].value;
  }
  for (const [name, binding] of Object.entries(properties)) {
    if (LABEL_SUFFIX.test(name) && isLiteral(binding)) return binding.value;
  }
  return null;
};

/**
 * Style applied to a hovered feature, derived from its current style.
 * @param {{ weight?: number, fillOpacity?: number }} base
 * @param {string} [color]
 * @returns {Object}
 */
export const highlightStyle = (base = {}, color = DEFAULT_HIGHLIGHT_COLOR) => ({
  color,
  weight: Math.max((base.weight ?? 2) + 2, 4),
  opacity: 1,
  fillOpacity: Math.min((base.fillOpacity ?? 0.2) + 0.15, 0.9),
});

const STYLE_KEYS = ['color', 'weight', 'opacity', 'fillOpacity'];

/**
 * Highlight a vector layer while the mouse is over it.
 * @param {L.Path} layer
 * @param {string} [color]
 */
export const attachHoverHighlight = (layer, color = DEFAULT_HIGHLIGHT_COLOR) => {
  if (typeof layer.setStyle !== 'function') return;
  let saved = null;
  layer.on('mouseover', () => {
    if (!saved) saved = Object.fromEntries(STYLE_KEYS.map(k => [k, layer.options[k]]));
    layer.setStyle(highlightStyle(saved, color));
    if (typeof layer.bringToFront === 'function') layer.bringToFront();
  });
  layer.on('mouseout', () => {
    if (!saved) return;
    layer.setStyle(saved);
    saved = null;
  });
};

/**
 * Bind the hover tooltip or the permanent label of a feature.
 * With permanent labels on, labelled features show their label at all times;
 * otherwise the label (or `?wktTooltip`, which takes precedence) shows on hover.
 * @param {L.Layer} layer
 * @param {Object} properties - SPARQL bindings of the row
 * @param {boolean} permanent - whether permanent labels are switched on
 */
export const bindFeatureLabel = (layer, properties, permanent) => {
  const label = findLabel(properties);
  if (permanent && label) {
    // Points get their label beside the marker; lines and polygons centered.
    const isPoint = typeof layer.getLatLng === 'function';
    layer.bindTooltip(label, {
      permanent: true,
      direction: isPoint ? 'right' : 'center',
      offset: isPoint ? [(layer.options?.radius ?? 4) + 2, 0] : [0, 0],
      className: 'yasgui-geo-label',
    });
    return;
  }
  const text = properties?.wktTooltip?.value || label;
  if (text) layer.bindTooltip(text, { sticky: true, className: 'yasgui-geo-hover-label' });
};

/**
 * Map control toggling permanent labels.
 * @param {L.Map} map
 * @param {boolean} initial
 * @param {(on: boolean) => void} onChange
 * @returns {L.Control}
 */
export const addLabelControl = (map, initial, onChange) => {
  let on = initial;
  const LabelToggle = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: () => {
      const div = L.DomUtil.create('div', 'leaflet-bar yasgui-geo-label-toggle');
      const btn = document.createElement('a');
      btn.href = '#';
      btn.setAttribute('role', 'button');
      btn.textContent = '🏷️';
      btn.style.fontSize = '16px';
      btn.style.textAlign = 'center';
      btn.style.textDecoration = 'none';
      btn.style.lineHeight = '26px';
      btn.style.display = 'block';
      const sync = () => {
        btn.title = on ? 'Hide labels' : 'Show labels';
        btn.setAttribute('aria-label', btn.title);
        btn.setAttribute('aria-pressed', String(on));
        btn.style.backgroundColor = on ? '#d6e9ff' : '';
      };
      sync();
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        on = !on;
        sync();
        onChange(on);
      });
      div.append(btn);
      L.DomEvent.disableClickPropagation(div);
      return div;
    },
  });
  return new LabelToggle().addTo(map);
};
