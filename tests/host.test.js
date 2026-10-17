import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import L from 'leaflet';
import {
  DESCRIBE_SOURCE,
  getHostToolbar,
  hasHostDescribe,
  hasHostToolbar,
  toHostDirection,
  toPluginDirection,
} from '../src/host.js';
import { ICON_NAMES, icon, iconMarkup } from '../src/icons.js';

// leaflet-draw, leaflet.markercluster and leaflet.heat read the global L.
globalThis.L = L;
let GeoPlugin;
beforeAll(async () => {
  ({ default: GeoPlugin } = await import('../index.js'));
});

const WKT = 'http://www.opengis.net/ont/geosparql#wktLiteral';
// Emoji and the symbol glyphs the old controls used (⬛ ⬟ 〰 ◀ ▶ ⏮ ×). Not
// Extended_Pictographic as a whole, which also matches the © of tile attributions.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{3030}\u{23E9}-\u{23FA}\u{25B6}\u{25C0}\u{00D7}]/u;

const results = () => ({
  head: { vars: ['s', 'name', 'g'] },
  results: {
    bindings: [
      { s: { type: 'uri', value: 'http://example.org/a' }, name: { type: 'literal', value: 'A' }, g: { type: 'literal', datatype: WKT, value: 'POINT(4.4 50.8)' } },
      { s: { type: 'uri', value: 'http://example.org/b' }, name: { type: 'literal', value: 'B' }, g: { type: 'literal', datatype: WKT, value: 'POINT(4.7 50.9)' } },
    ],
  },
});

/** A yasr like today's published @matdata/yasgui: no host API. */
const legacyYasr = (geo = {}) => {
  const resultsEl = document.createElement('div');
  document.body.appendChild(resultsEl);
  return {
    config: { plugins: { geo: { permalink: false, ...geo } } },
    results: { json: results() },
    resultsEl,
    executeQuery: vi.fn(async () => ({ content: JSON.stringify({ results: { bindings: [] } }) })),
  };
};

/** A yasr with the MatGUI host API, version 1. */
const hostYasr = (geo = {}) => {
  const yasr = legacyYasr(geo);
  const toolbar = document.createElement('div');
  toolbar.className = 'yasr_pluginToolbar';
  document.body.insertBefore(toolbar, yasr.resultsEl);
  return Object.assign(yasr, {
    hostApi: { version: 1, describe: true, toolbar: true },
    describe: vi.fn(async () => {}),
    getPluginToolbar: vi.fn(() => toolbar),
    toolbar,
  });
};

const drawn = async (yasr) => {
  const plugin = new GeoPlugin(yasr);
  await plugin.draw();
  return plugin;
};

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  document.body.textContent = '';
});

describe('host API detection', () => {
  it('needs both the capability flag and the function', () => {
    expect(hasHostDescribe({ hostApi: { version: 1, describe: true }, describe() {} })).toBe(true);
    expect(hasHostDescribe({ hostApi: { version: 1, describe: true } })).toBe(false);
    expect(hasHostDescribe({ describe() {} })).toBe(false);
    expect(hasHostDescribe(undefined)).toBe(false);
    expect(hasHostToolbar({ hostApi: { toolbar: true }, getPluginToolbar() {} })).toBe(true);
    expect(hasHostToolbar({ hostApi: { toolbar: false }, getPluginToolbar() {} })).toBe(false);
    expect(hasHostToolbar({ hostApi: { toolbar: true } })).toBe(false);
  });

  it('returns null when the toolbar slot is missing or throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getHostToolbar({})).toBeNull();
    expect(getHostToolbar({ hostApi: { toolbar: true }, getPluginToolbar: () => { throw new Error('x'); } })).toBeNull();
    warn.mockRestore();
  });

  it('maps describe directions both ways', () => {
    expect(toHostDirection('subject')).toBe('outgoing');
    expect(toHostDirection(undefined)).toBe('outgoing');
    expect(toHostDirection('object')).toBe('incoming');
    expect(toHostDirection('incoming')).toBe('incoming');
    expect(toPluginDirection('incoming')).toBe('object');
    expect(toPluginDirection('outgoing')).toBe('subject');
    expect(toPluginDirection('object')).toBe('object');
  });
});

describe('icons', () => {
  it('are stroke icons in currentColor', () => {
    for (const name of ICON_NAMES) {
      const markup = iconMarkup(name);
      expect(markup).toContain('stroke="currentColor"');
      expect(markup).toContain('fill="none"');
      expect(markup).toContain('width="16"');
      expect(markup).not.toMatch(/fill="#/);
    }
  });

  it('builds a decorative SVG element', () => {
    const svg = icon('sliders-horizontal');
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(() => icon('nope')).toThrow(/unknown icon/);
  });
});

describe('fallback: host without the yasr host API', () => {
  it('keeps every setting as a map control, drawn with icons instead of emoji', async () => {
    const yasr = legacyYasr();
    await drawn(yasr);
    const el = yasr.resultsEl;
    for (const cls of ['yasgui-geo-label-toggle', 'yasgui-geo-style', 'yasgui-geo-simplify', 'yasgui-geo-heatmap-toggle', 'yasgui-geo-draw-toolbar', 'yasgui-geo-export']) {
      const control = el.querySelector(`.${cls}`);
      expect(control, cls).not.toBeNull();
      expect(control.querySelector('svg.yasgui-geo-icon'), cls).not.toBeNull();
    }
    expect(el.querySelector('.leaflet-control-zoom')).not.toBeNull();
    // Background maps stay in the layers control.
    expect(el.querySelectorAll('.leaflet-control-layers-base input').length).toBeGreaterThan(1);
    expect(EMOJI.test(el.textContent)).toBe(false);
  });

  it('describes in the plugin modal', async () => {
    const yasr = legacyYasr();
    const plugin = await drawn(yasr);
    await plugin.describe('http://example.org/a', 'object');
    expect(document.querySelector('.yasgui-geo-describe')).not.toBeNull();
    expect(document.querySelector('.yasgui-geo-describe-title').textContent).toContain('as object');
    expect(yasr.executeQuery).toHaveBeenCalledTimes(1);
    expect(yasr.executeQuery.mock.calls[0][0]).toContain('?s ?p <http://example.org/a>');
    expect(document.querySelector('.yasgui-geo-describe-close svg')).not.toBeNull();
  });

  it('uses the modal when hostApi is advertised but describe() is missing', async () => {
    const yasr = legacyYasr();
    yasr.hostApi = { version: 1, describe: true, toolbar: true };
    const plugin = await drawn(yasr);
    await plugin.describe('http://example.org/a', 'subject');
    expect(document.querySelector('.yasgui-geo-describe')).not.toBeNull();
    // No getPluginToolbar either: the settings stay on the map.
    expect(yasr.resultsEl.querySelector('.yasgui-geo-label-toggle')).not.toBeNull();
  });

  it('builds no plugin toolbar', async () => {
    const plugin = await drawn(legacyYasr());
    expect(plugin.toolbar).toBeUndefined();
    expect(document.querySelector('.yasr_toolbarButton')).toBeNull();
  });
});

describe('host with the yasr host API', () => {
  it('describes through yasr.describe and opens no modal', async () => {
    const yasr = hostYasr();
    const plugin = await drawn(yasr);
    await plugin.describe('http://example.org/a', 'object');
    await plugin.describe('http://example.org/b');
    expect(yasr.describe).toHaveBeenNthCalledWith(1, 'http://example.org/a', { direction: 'incoming', source: DESCRIBE_SOURCE });
    expect(yasr.describe).toHaveBeenNthCalledWith(2, 'http://example.org/b', { direction: 'outgoing', source: 'Map' });
    expect(document.querySelector('.yasgui-geo-describe')).toBeNull();
    expect(yasr.executeQuery).not.toHaveBeenCalled();
  });

  it('falls back to the modal when yasr.describe throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const yasr = hostYasr();
    yasr.describe = vi.fn(() => { throw new Error('not ready'); });
    const plugin = await drawn(yasr);
    await plugin.describe('http://example.org/a', 'subject');
    expect(document.querySelector('.yasgui-geo-describe')).not.toBeNull();
    warn.mockRestore();
  });

  it('moves the settings into the toolbar and keeps canvas controls on the map', async () => {
    const yasr = hostYasr();
    await drawn(yasr);
    const bar = yasr.toolbar;
    const map = yasr.resultsEl;
    const selects = [...bar.querySelectorAll('label.yasr_toolbarSelect')].map(l => l.querySelector('span').textContent);
    expect(selects).toEqual(['Background', 'Points']);
    const buttons = [...bar.querySelectorAll('.yasr_toolbarButton')].map(b => b.textContent || b.getAttribute('aria-label'));
    expect(buttons).toEqual(['Labels', 'Rectangle', 'Polygon', 'Clear spatial filter', 'Export', 'View settings']);
    expect(bar.querySelector('.yasr_toolbarGroup[aria-label="Spatial filter"]')).not.toBeNull();
    // View settings sits at the far right, after the spacer.
    const children = [...bar.children];
    expect(children.at(-2).className).toBe('yasr_toolbarSpacer');
    expect(children.at(-1).textContent).toContain('View settings');
    expect(EMOJI.test(bar.textContent)).toBe(false);

    for (const cls of ['yasgui-geo-label-toggle', 'yasgui-geo-style', 'yasgui-geo-simplify', 'yasgui-geo-heatmap-toggle', 'yasgui-geo-draw-toolbar', 'yasgui-geo-export']) {
      expect(map.querySelector(`.${cls}`), cls).toBeNull();
    }
    expect(map.querySelector('.leaflet-control-zoom')).not.toBeNull();
    expect(map.querySelector('.leaflet-control-layers')).not.toBeNull();
    expect(map.querySelectorAll('.leaflet-control-layers-base input').length).toBe(0);
    expect(map.querySelector('.yasgui-geo-coords')).not.toBeNull();
    expect(map.querySelector('a[title="Measure distance"] svg')).not.toBeNull();
  });

  it('remounts the toolbar after yasr empties it before a draw', async () => {
    const yasr = hostYasr();
    const plugin = await drawn(yasr);
    const count = yasr.toolbar.children.length;
    yasr.toolbar.textContent = '';
    await plugin.draw();
    expect(yasr.toolbar.children.length).toBe(count);
    // Built once: the same elements come back, with their state.
    await plugin.draw();
    expect(yasr.toolbar.children.length).toBe(count);
  });

  it('switches the background map from the toolbar', async () => {
    const yasr = hostYasr();
    const plugin = await drawn(yasr);
    const select = yasr.toolbar.querySelector('label.yasr_toolbarSelect select');
    expect(select.value).toBe('openStreetMap');
    const onChange = vi.fn();
    plugin.map.on('baselayerchange', onChange);
    select.value = 'None';
    select.dispatchEvent(new Event('change'));
    expect(plugin.map.hasLayer(plugin.basemaps.None)).toBe(true);
    expect(plugin.map.hasLayer(plugin.basemaps.openStreetMap)).toBe(false);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'None' }));
  });

  it('toggles labels and the point display mode', async () => {
    const yasr = hostYasr();
    const plugin = await drawn(yasr);
    // Only the state matters here; redrawing as a heatmap would need a
    // canvas, which jsdom lacks.
    plugin.updateMap = vi.fn();
    const labels = [...yasr.toolbar.querySelectorAll('.yasr_toolbarButton')].find(b => b.textContent === 'Labels');
    expect(labels.getAttribute('aria-pressed')).toBe('false');
    labels.click();
    expect(plugin._showLabels).toBe(true);
    expect(labels.getAttribute('aria-pressed')).toBe('true');

    const points = yasr.toolbar.querySelectorAll('label.yasr_toolbarSelect select')[1];
    expect(points.value).toBe('cluster');
    points.value = 'heatmap';
    points.dispatchEvent(new Event('change'));
    expect(plugin._displayMode).toBe('heatmap');
    expect(plugin.updateMap).toHaveBeenCalled();
  });

  it('opens View settings with the style and simplify settings, and closes on outside click', async () => {
    const yasr = hostYasr();
    await drawn(yasr);
    const btn = [...yasr.toolbar.querySelectorAll('.yasr_toolbarButton')].find(b => b.textContent === 'View settings');
    const panel = btn.parentElement.querySelector('.yasgui-geo-popover');
    expect(btn.querySelector('svg')).not.toBeNull();
    expect(panel.hidden).toBe(true);
    btn.click();
    expect(panel.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect([...panel.querySelectorAll('h3')].map(h => h.textContent)).toEqual(['Style', 'Simplify geometry']);
    expect(panel.querySelector('input[type="color"]')).not.toBeNull();
    document.body.click();
    expect(panel.hidden).toBe(true);
  });

  it('drives the spatial filter from the toolbar', async () => {
    const yasr = hostYasr();
    const plugin = await drawn(yasr);
    const rect = [...yasr.toolbar.querySelectorAll('.yasr_toolbarButton')].find(b => b.textContent === 'Rectangle');
    rect.click();
    expect(plugin.drawing.getMode()).toBe('rectangle');
    expect(rect.getAttribute('aria-pressed')).toBe('true');
    rect.click();
    expect(plugin.drawing.getMode()).toBeNull();
    expect(rect.getAttribute('aria-pressed')).toBe('false');
  });

  it('leaves out the toolbar parts whose options are off', async () => {
    const yasr = hostYasr({ heatmapControl: false, labelControl: false, drawing: false, exportControl: false, styleControl: false, simplifyControl: false });
    await drawn(yasr);
    const children = [...yasr.toolbar.children];
    expect(children).toHaveLength(1);
    expect(children[0].matches('label.yasr_toolbarSelect')).toBe(true);
    expect(children[0].querySelector('span').textContent).toBe('Background');
  });
});
