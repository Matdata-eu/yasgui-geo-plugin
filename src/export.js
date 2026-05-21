// Result-export helpers: GeoJSON, KML, CSV-with-WKT.

import { toPng } from 'html-to-image';

const escapeXml = (s) => String(s).replace(/[<>&'"]/g, c => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;',
}[c]));

const escapeCsv = (s) => {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

const toWKT = (geom) => {
  if (!geom) return '';
  const ring = (coords) => coords.map(([x, y]) => `${x} ${y}`).join(', ');
  switch (geom.type) {
    case 'Point': return `POINT(${geom.coordinates[0]} ${geom.coordinates[1]})`;
    case 'LineString': return `LINESTRING(${ring(geom.coordinates)})`;
    case 'Polygon': return `POLYGON(${geom.coordinates.map(r => `(${ring(r)})`).join(',')})`;
    case 'MultiPoint': return `MULTIPOINT(${geom.coordinates.map(c => `(${c[0]} ${c[1]})`).join(',')})`;
    case 'MultiLineString': return `MULTILINESTRING(${geom.coordinates.map(l => `(${ring(l)})`).join(',')})`;
    case 'MultiPolygon': return `MULTIPOLYGON(${geom.coordinates.map(p => `(${p.map(r => `(${ring(r)})`).join(',')})`).join(',')})`;
    default: return '';
  }
};

const flattenProps = (p) => {
  const out = {};
  for (const [k, v] of Object.entries(p || {})) {
    if (v && typeof v === 'object' && 'value' in v) out[k] = v.value;
    else out[k] = v;
  }
  return out;
};

export const toGeoJSON = (fc) => JSON.stringify(fc, null, 2);

export const copyGeoJSONToClipboard = async (fc, clipboard = navigator?.clipboard) => {
  if (!clipboard?.writeText) {
    throw new Error('Clipboard API is not available.');
  }
  await clipboard.writeText(toGeoJSON(fc));
};

export const toKML = (fc) => {
  const placemarks = (fc.features || []).map((f) => {
    const props = flattenProps(f.properties);
    const name = escapeXml(props.wktLabel || props.name || '');
    let body = '';
    const g = f.geometry;
    if (!g) return '';
    const coordStr = (c) => `${c[0]},${c[1]}${c[2] != null ? `,${c[2]}` : ''}`;
    if (g.type === 'Point') {
      body = `<Point><coordinates>${coordStr(g.coordinates)}</coordinates></Point>`;
    } else if (g.type === 'LineString') {
      body = `<LineString><coordinates>${g.coordinates.map(coordStr).join(' ')}</coordinates></LineString>`;
    } else if (g.type === 'Polygon') {
      const rings = g.coordinates.map((r, i) => {
        const tag = i === 0 ? 'outerBoundaryIs' : 'innerBoundaryIs';
        return `<${tag}><LinearRing><coordinates>${r.map(coordStr).join(' ')}</coordinates></LinearRing></${tag}>`;
      }).join('');
      body = `<Polygon>${rings}</Polygon>`;
    } else {
      return '';
    }
    return `<Placemark><name>${name}</name>${body}</Placemark>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
${placemarks}
</Document>
</kml>`;
};

export const toCSV = (fc) => {
  const features = fc.features || [];
  const propKeys = new Set();
  for (const f of features) for (const k of Object.keys(flattenProps(f.properties))) propKeys.add(k);
  const headers = [...propKeys, 'wkt'];
  const rows = features.map((f) => {
    const p = flattenProps(f.properties);
    const cells = [...propKeys].map(k => escapeCsv(p[k] ?? ''));
    cells.push(escapeCsv(toWKT(f.geometry)));
    return cells.join(',');
  });
  return [headers.map(escapeCsv).join(','), ...rows].join('\n');
};

const triggerDownload = (filename, content, mime) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const triggerDownloadUrl = (filename, url) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

export const downloadMapPNG = async (map, filename = 'map.png', renderer = toPng) => {
  const container = map?.getContainer?.();
  if (!container) throw new Error('Map container is not available.');
  const dataUrl = await renderer(container, {
    cacheBust: true,
    pixelRatio: 2,
    filter: node => !node.classList?.contains?.('leaflet-control-container'),
  });
  triggerDownloadUrl(filename, dataUrl);
  return dataUrl;
};

/**
 * Add a small export dropdown control to a Leaflet map. Calls getFeatureCollection()
 * on demand to retrieve the merged feature collection at click time.
 * @param {L.Map} map
 * @param {() => GeoJSON.FeatureCollection} getFeatureCollection
 */
export const addExportControl = (map, getFeatureCollection) => {
  const Control = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar yasgui-geo-export');
      div.style.position = 'relative';

      const btn = document.createElement('a');
      btn.href = '#';
      btn.title = 'Download map data';
      btn.textContent = '💾';
      btn.style.fontSize = '16px';
      btn.style.textAlign = 'center';
      btn.style.textDecoration = 'none';
      btn.style.lineHeight = '26px';
      btn.style.display = 'block';

      const menu = document.createElement('div');
      menu.style.position = 'absolute';
      menu.style.right = '0';
      menu.style.top = '100%';
      menu.style.background = 'var(--yasgui-bg-primary, white)';
      menu.style.color = 'var(--yasgui-text-primary, #333)';
      menu.style.border = '1px solid var(--yasgui-border-color, #ccc)';
      menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
      menu.style.display = 'none';
      menu.style.zIndex = '1000';
      menu.style.minWidth = '140px';
      menu.style.fontSize = '12px';

      let open = false;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        open = !open;
        menu.style.display = open ? 'block' : 'none';
      });

      const mk = (label, handler, title) => {
        const b = document.createElement('button');
        b.textContent = label;
        if (title) b.title = title;
        b.style.display = 'block';
        b.style.width = '100%';
        b.style.padding = '6px 12px';
        b.style.background = 'none';
        b.style.border = 'none';
        b.style.textAlign = 'left';
        b.style.cursor = 'pointer';
        b.style.whiteSpace = 'nowrap';
        b.style.color = 'inherit';
        b.onmouseover = () => { b.style.background = 'var(--yasgui-bg-secondary, #f0f0f0)'; };
        b.onmouseout = () => { b.style.background = 'none'; };
        b.onclick = async (e) => {
          e.stopPropagation();
          menu.style.display = 'none';
          open = false;
          try {
            await handler();
          } catch (error) {
            console.warn('Geo export action failed:', error);
          }
        };
        return b;
      };

      menu.append(
        mk('Copy GeoJSON', () => copyGeoJSONToClipboard(getFeatureCollection()), 'Copy GeoJSON to clipboard'),
        mk('Save as GeoJSON', () => triggerDownload('results.geojson', toGeoJSON(getFeatureCollection()), 'application/geo+json'), 'Download GeoJSON file'),
        mk('Save as PNG', () => downloadMapPNG(map), 'Download the current map as PNG'),
        mk('Save as KML', () => triggerDownload('results.kml', toKML(getFeatureCollection()), 'application/vnd.google-earth.kml+xml')),
        mk('Save as CSV', () => triggerDownload('results.csv', toCSV(getFeatureCollection()), 'text/csv')),
      );

      div.append(btn, menu);

      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!div.contains(e.target)) {
          menu.style.display = 'none';
          open = false;
        }
      });

      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    },
  });
  return new Control().addTo(map);
};
