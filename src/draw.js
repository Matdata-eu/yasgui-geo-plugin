// Spatial filter drawing: overlays leaflet-draw on the map, listens for
// drawn polygons/rectangles and shows a copyable GeoSPARQL snippet.

import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import L from 'leaflet';
import { polygonToWKT } from './draw-helpers.js';

const rectangleToLatLngs = (bounds) => [
  bounds.getSouthWest(),
  bounds.getSouthEast(),
  bounds.getNorthEast(),
  bounds.getNorthWest(),
];

/**
 * Enable spatial-filter drawing on the given map.
 * Adds a minimal 3-button toolbar (rectangle, polygon, delete).
 * Right-click finishes an in-progress polygon.
 *
 * @param {L.Map} map
 * @param {{ onWKT?: (wkt: string) => void, crs?: string|null }} [opts]
 */
export const enableDrawing = (map, { onWKT, crs } = {}) => {
  const drawnItems = new L.FeatureGroup().addTo(map);
  let activeHandler = null;
  let polyHandler = null;

  const deactivateAll = () => {
    if (activeHandler) {
      try { activeHandler.disable(); } catch { /* ignore */ }
      activeHandler = null;
    }
    polyHandler = null;
  };

  // --- 3-button custom toolbar ---
  const Toolbar = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar yasgui-geo-draw-toolbar');
      const allBtns = [];

      const mkBtn = (icon, title, onClick) => {
        const a = document.createElement('a');
        a.href = '#';
        a.title = title;
        a.textContent = icon;
        a.style.fontSize = '16px';
        a.style.textAlign = 'center';
        a.style.textDecoration = 'none';
        a.style.lineHeight = '26px';
        a.style.display = 'block';
        a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(a); });
        allBtns.push(a);
        return a;
      };

      const clearActive = () => allBtns.forEach(b => { b.style.background = ''; });

      const rectBtn = mkBtn('⬛', 'Draw rectangle filter', (btn) => {
        if (activeHandler) { deactivateAll(); clearActive(); return; }
        clearActive();
        const handler = new L.Draw.Rectangle(map, { showArea: false, shapeOptions: { color: '#3388ff', weight: 2 } });
        activeHandler = handler;
        btn.style.background = 'rgba(51,136,255,0.15)';
        // Delay enable() so the button's mouseup doesn't trigger an immediate rectangle finish
        setTimeout(() => handler.enable(), 50);
      });

      const polyBtn = mkBtn('⬟', 'Draw polygon filter – right-click to finish', (btn) => {
        if (activeHandler) { deactivateAll(); clearActive(); return; }
        clearActive();
        const handler = new L.Draw.Polygon(map, {
          allowIntersection: false,
          showArea: false,
          shapeOptions: { color: '#3388ff', weight: 2 },
        });
        activeHandler = handler;
        polyHandler = handler;
        btn.style.background = 'rgba(51,136,255,0.15)';
        handler.enable();
      });

      mkBtn('🗑', 'Delete drawn filter', () => {
        deactivateAll();
        clearActive();
        drawnItems.clearLayers();
        panel.getContainer().style.display = 'none';
      });

      div.append(rectBtn, polyBtn, ...allBtns.slice(2));
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    },
  });
  new Toolbar().addTo(map);

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
    div.style.background = 'white';
    div.style.padding = '6px 8px';
    div.style.font = '12px monospace';
    div.style.maxWidth = '360px';
    div.style.display = 'none';
    div.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  panel.addTo(map);

  const showSnippet = (wkt) => {
    const div = panel.getContainer();
    div.style.display = 'block';
    div.replaceChildren();
    const title = document.createElement('div');
    title.textContent = 'GeoSPARQL filter:';
    title.style.fontWeight = 'bold';
    const code = document.createElement('textarea');
    code.readOnly = true;
    code.style.width = '100%';
    code.style.height = '70px';
    code.value = `FILTER(geof:sfWithin(?geom, "${wkt}"^^geo:wktLiteral))`;
    const copy = document.createElement('button');
    copy.textContent = 'Copy';
    copy.onclick = () => navigator.clipboard?.writeText(code.value);
    div.append(title, code, copy);
    onWKT?.(wkt);
  };

  map.on(L.Draw.Event.CREATED, (e) => {
    activeHandler = null;
    polyHandler = null;
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
  });
};
