// Safe popup rendering for SPARQL bindings.
// All values are inserted via textContent or createElement to prevent XSS
// from hostile endpoints. IRIs, images, and long text are handled specially.

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i;
const URL_RE = /^https?:\/\//i;
const MAX_VALUE_CHARS = 240;
// Geometry literals are already drawn on the map, so only a short preview is
// shown by default.
const MAX_GEOMETRY_CHARS = 60;

// Leaflet popup options: content wider than maxWidth wraps.
export const POPUP_OPTIONS = { maxWidth: 420, minWidth: 160 };
// Content taller than this scrolls. Applied on our own wrapper rather than via
// Leaflet's maxHeight, which is only evaluated when the popup opens and so
// would not apply after a value is expanded with "show more".
const MAX_POPUP_HEIGHT = '320px';

// Let long unbroken tokens (IRIs, WKT coordinate lists) wrap anywhere instead
// of stretching the popup.
const wrapAnywhere = (el) => {
  el.style.overflowWrap = 'anywhere';
  el.style.wordBreak = 'break-word';
};

const isIRI = (binding) => binding && (binding.type === 'uri' || binding.type === 'iri');

const createToggle = (doc, label, ariaLabel, onClick) => {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.setAttribute('aria-label', ariaLabel);
  btn.style.background = 'none';
  btn.style.border = 'none';
  btn.style.color = '#06c';
  btn.style.cursor = 'pointer';
  btn.style.padding = '0';
  btn.style.font = 'inherit';
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    onClick();
  });
  return btn;
};

// Render `value` truncated to `limit` characters with a toggle to expand and
// collapse it again.
const renderCollapsible = (span, value, limit, doc) => {
  const showShort = () => {
    span.textContent = '';
    span.appendChild(doc.createTextNode(value.slice(0, limit) + '… '));
    span.appendChild(createToggle(doc, '(show more)', 'Show full value', showFull));
  };
  const showFull = () => {
    span.textContent = '';
    span.appendChild(doc.createTextNode(value + ' '));
    span.appendChild(createToggle(doc, '(show less)', 'Show shortened value', showShort));
  };
  showShort();
};

const createValueNode = (binding, doc, { geometryDatatypes }) => {
  const value = binding?.value ?? '';
  if (isIRI(binding) || URL_RE.test(value)) {
    if (IMAGE_EXT.test(value)) {
      const img = doc.createElement('img');
      img.src = value;
      img.alt = '';
      img.loading = 'lazy';
      img.style.maxWidth = '180px';
      img.style.maxHeight = '120px';
      img.style.display = 'block';
      return img;
    }
    const a = doc.createElement('a');
    a.href = value;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = value;
    wrapAnywhere(a);
    return a;
  }
  const span = doc.createElement('span');
  wrapAnywhere(span);
  const limit = geometryDatatypes.has(binding?.datatype) ? MAX_GEOMETRY_CHARS : MAX_VALUE_CHARS;
  if (value.length > limit) {
    renderCollapsible(span, value, limit, doc);
  } else {
    span.textContent = value;
  }
  return span;
};

/**
 * Render a SPARQL binding row as a safe DOM table for use in a Leaflet popup.
 * The table is wrapped in a scrollable container so long rows stay inside
 * the popup.
 * @param {Object} properties - SPARQL bindings { var: { value, type, datatype } }
 * @param {Object} [opts]
 * @param {string[]} [opts.skip] - Variable names to omit (e.g. 'wktLabel', 'wktTooltip')
 * @param {string[]} [opts.geometryDatatypes] - Datatype IRIs of geometry literals, which are shortened more aggressively
 * @param {Document} [opts.doc] - Document to use (defaults to global document)
 * @returns {HTMLElement} the scroll container holding the table
 */
export const renderPopup = (properties, opts = {}) => {
  const doc = opts.doc || document;
  const skip = new Set(opts.skip || []);
  const geometryDatatypes = new Set(opts.geometryDatatypes || []);
  const table = doc.createElement('table');
  table.className = 'yasgui-geo-popup';
  table.setAttribute('role', 'presentation');
  table.tabIndex = 0;
  table.setAttribute('aria-label', 'Feature properties');
  table.style.borderCollapse = 'collapse';
  table.style.fontSize = '12px';
  table.style.width = '100%';
  for (const key of Object.keys(properties)) {
    if (skip.has(key)) continue;
    const binding = properties[key];
    if (!binding) continue;
    const tr = doc.createElement('tr');
    const th = doc.createElement('th');
    th.textContent = key;
    th.style.textAlign = 'left';
    th.style.verticalAlign = 'top';
    th.style.paddingRight = '6px';
    th.style.whiteSpace = 'nowrap';
    const td = doc.createElement('td');
    wrapAnywhere(td);
    td.appendChild(createValueNode(binding, doc, { geometryDatatypes }));
    tr.appendChild(th);
    tr.appendChild(td);
    table.appendChild(tr);
  }
  const container = doc.createElement('div');
  container.className = 'yasgui-geo-popup-scroll';
  container.style.maxHeight = MAX_POPUP_HEIGHT;
  container.style.overflowY = 'auto';
  container.appendChild(table);
  return container;
};
