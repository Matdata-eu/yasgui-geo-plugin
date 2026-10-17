// Spatial filter drawing: overlays leaflet-draw on the map, listens for
// drawn polygons/rectangles and shows a copyable GeoSPARQL snippet.

import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import L from 'leaflet';
import { polygonToWKT } from './draw-helpers.js';
import { setIcon } from './icons.js';

const rectangleToLatLngs = (bounds) => [
  bounds.getSouthWest(),
  bounds.getSouthEast(),
  bounds.getNorthEast(),
  bounds.getNorthWest(),
];

/**
 * Enable spatial-filter drawing on the given map.
 * Adds a minimal 3-button map toolbar (rectangle, polygon, delete) unless
 * `toolbar: false`, in which case the caller drives drawing through the
 * returned handle (the host plugin toolbar does this).
 * Right-click finishes an in-progress polygon.
 *
 * @param {L.Map} map
 * @param {{ onWKT?: (wkt: string) => void, crs?: string|null, toolbar?: boolean }} [opts]
 * @returns {{
 *   toggleRectangle: () => void,
 *   togglePolygon: () => void,
 *   clear: () => void,
 *   getMode: () => ('rectangle'|'polygon'|null),
 *   onModeChange: (listener: (mode: 'rectangle'|'polygon'|null) => void) => () => void,
 * }}
 */
export const enableDrawing = (map, { onWKT, crs, toolbar = true } = {}) => {
  const drawnItems = new L.FeatureGroup().addTo(map);
  let activeHandler = null;
  let polyHandler = null;
  let mode = null;
  const listeners = new Set();

  const setMode = (next) => {
    mode = next;
    for (const listener of listeners) listener(mode);
  };

  const deactivateAll = () => {
    if (activeHandler) {
      try { activeHandler.disable(); } catch { /* ignore */ }
      activeHandler = null;
    }
    polyHandler = null;
    setMode(null);
  };

  const toggleRectangle = () => {
    if (activeHandler) { deactivateAll(); return; }
    const handler = new L.Draw.Rectangle(map, { showArea: false, shapeOptions: { color: '#3388ff', weight: 2 } });
    activeHandler = handler;
    setMode('rectangle');
    // Delay enable() so the button's mouseup doesn't trigger an immediate rectangle finish
    setTimeout(() => { if (activeHandler === handler) handler.enable(); }, 50);
  };

  const togglePolygon = () => {
    if (activeHandler) { deactivateAll(); return; }
    const handler = new L.Draw.Polygon(map, {
      allowIntersection: false,
      showArea: false,
      shapeOptions: { color: '#3388ff', weight: 2 },
    });
    activeHandler = handler;
    polyHandler = handler;
    setMode('polygon');
    handler.enable();
  };

  const clear = () => {
    deactivateAll();
    drawnItems.clearLayers();
    const container = panel.getContainer?.();
    if (container) container.style.display = 'none';
  };

  // --- 3-button map toolbar (when the host has no plugin toolbar) ---
  const Toolbar = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar yasgui-geo-draw-toolbar');

      const mkBtn = (iconName, title, onClick) => {
        const a = document.createElement('a');
        a.href = '#';
        a.title = title;
        a.setAttribute('role', 'button');
        a.setAttribute('aria-label', title);
        setIcon(a, iconName);
        a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
        return a;
      };

      const rectBtn = mkBtn('square', 'Draw rectangle filter', toggleRectangle);
      const polyBtn = mkBtn('pentagon', 'Draw polygon filter (right-click to finish)', togglePolygon);
      const delBtn = mkBtn('trash-2', 'Delete drawn filter', clear);
      const sync = (current) => {
        for (const [btn, m] of [[rectBtn, 'rectangle'], [polyBtn, 'polygon']]) {
          btn.classList.toggle('is-active', current === m);
          btn.setAttribute('aria-pressed', String(current === m));
        }
      };
      listeners.add(sync);
      sync(mode);

      div.append(rectBtn, polyBtn, delBtn);
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    },
  });
  if (toolbar) new Toolbar().addTo(map);

  // Right-click finishes the active polygon drawing
  map.on('contextmenu', () => {
    if (polyHandler) {
      try { polyHandler._finishShape(); } catch { /* ignore */ }
    }
  });

  // --- Output panel ---
  const panel = L.control({ position: 'bottomleft' });
  panel.onAdd = () => {
    const div = L.DomUtil.create('div', 'yasgui-geo-draw-panel');
    div.style.display = 'none';
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  panel.addTo(map);

  const showSnippet = (wkt) => {
    const div = panel.getContainer();
    div.style.display = 'block';
    div.replaceChildren();
    const title = document.createElement('div');
    title.textContent = 'GeoSPARQL filter';
    title.className = 'yasgui-geo-draw-panel-title';
    const code = document.createElement('textarea');
    code.readOnly = true;
    code.style.width = '100%';
    code.style.height = '70px';
    code.value = `FILTER(geof:sfWithin(?geom, "${wkt}"^^geo:wktLiteral))`;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.onclick = () => navigator.clipboard?.writeText(code.value);
    div.append(title, code, copy);
    onWKT?.(wkt);
  };

  map.on(L.Draw.Event.CREATED, (e) => {
    activeHandler = null;
    polyHandler = null;
    setMode(null);
    drawnItems.clearLayers();
    drawnItems.addLayer(e.layer);
    const latlngs = e.layerType === 'rectangle'
      ? rectangleToLatLngs(e.layer.getBounds())
      : e.layer.getLatLngs()[0];
    showSnippet(polygonToWKT(latlngs, crs));
  });

  map.on(L.Draw.Event.DRAWSTOP, () => {
    activeHandler = null;
    polyHandler = null;
    setMode(null);
  });

  return {
    toggleRectangle,
    togglePolygon,
    clear,
    getMode: () => mode,
    onModeChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
