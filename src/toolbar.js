// Plugin toolbar for hosts that offer a toolbar slot (yasr.getPluginToolbar,
// see host.js). The map's settings move here: background map, point display,
// labels, spatial filter, export and, at the far right, View settings (style
// and simplification). Controls that act on the map canvas itself (zoom,
// overlay layers, measure, coordinates, time slider) stay on the map.
//
// The elements are built once per map and re-appended on every draw, because
// yasr empties the slot before each plugin draw(). They only use the host's
// shared classes (.yasr_toolbarButton, .yasr_toolbarSelect, .yasr_toolbarGroup,
// .yasr_toolbarSpacer) plus a few plugin classes for the popovers.

import { icon } from './icons.js';
import { createStyleForm } from './style.js';
import { createSimplifyField } from './simplify.js';
import { createExportMenu } from './export.js';

/** Point display modes, in the order the toolbar select lists them. */
export const DISPLAY_MODE_LABELS = Object.freeze({
  cluster: 'Clustered',
  all: 'All points',
  heatmap: 'Heatmap',
});

const toolbarButton = (doc, { iconName, text, title, iconOnly = false }) => {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'yasr_toolbarButton';
  if (iconName) btn.appendChild(icon(iconName, { doc }));
  if (text && !iconOnly) {
    const span = doc.createElement('span');
    span.textContent = text;
    btn.appendChild(span);
  }
  if (title) btn.title = title;
  if (iconOnly) btn.setAttribute('aria-label', text);
  return btn;
};

const toolbarSelect = (doc, labelText, options, onChange) => {
  const label = doc.createElement('label');
  label.className = 'yasr_toolbarSelect';
  const span = doc.createElement('span');
  span.textContent = labelText;
  const select = doc.createElement('select');
  for (const [value, text] of options) {
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
  }
  select.addEventListener('change', () => onChange(select.value));
  label.append(span, select);
  return { label, select };
};

const setPressed = (btn, on) => {
  btn.setAttribute('aria-pressed', String(!!on));
  btn.classList.toggle('is-active', !!on);
};

/**
 * Build the toolbar items. Each part is optional: pass null to leave it out.
 *
 * @param {Object} ctx
 * @param {{ names: string[], getCurrent: () => string, select: (name: string) => void }|null} [ctx.basemaps]
 * @param {{ get: () => string, set: (mode: string) => void }|null} [ctx.displayMode]
 * @param {{ get: () => boolean, set: (on: boolean) => void }|null} [ctx.labels]
 * @param {ReturnType<import('./draw.js').enableDrawing>|null} [ctx.drawing]
 * @param {{ map: Object, getFeatureCollection: () => Object }|null} [ctx.exportMenu]
 * @param {{ initial: Object, onChange: (state: Object) => void }|null} [ctx.style]
 * @param {{ initial: number, options: Object, onChange: (tolerance: number) => void }|null} [ctx.simplify]
 * @param {Document} [doc]
 * @returns {{ items: HTMLElement[], mount: (bar: HTMLElement) => void, sync: () => void, closePopovers: () => void, destroy: () => void }}
 */
export const buildToolbar = (ctx, doc = document) => {
  const items = [];
  const syncers = [];
  const popovers = [];

  const popover = (button, panel, align, haspopup = 'dialog') => {
    const anchor = doc.createElement('span');
    anchor.className = 'yasgui-geo-tb-anchor';
    panel.classList.add('yasgui-geo-popover', `yasgui-geo-popover-${align}`);
    panel.hidden = true;
    button.setAttribute('aria-haspopup', haspopup);
    button.setAttribute('aria-expanded', 'false');
    const setOpen = (open) => {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      button.classList.toggle('is-active', open);
    };
    button.addEventListener('click', () => {
      const open = panel.hidden;
      for (const p of popovers) p.setOpen(false);
      setOpen(open);
    });
    anchor.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !panel.hidden) {
        ev.stopPropagation();
        setOpen(false);
        button.focus();
      }
    });
    anchor.append(button, panel);
    const entry = { anchor, setOpen };
    popovers.push(entry);
    return entry;
  };

  if (ctx.basemaps && ctx.basemaps.names.length > 1) {
    const { names, getCurrent, select: choose } = ctx.basemaps;
    const { label, select } = toolbarSelect(doc, 'Background', names.map(n => [n, n]), choose);
    label.title = 'Background map';
    syncers.push(() => { select.value = getCurrent(); });
    items.push(label);
  }

  if (ctx.displayMode) {
    const { label, select } = toolbarSelect(
      doc,
      'Points',
      Object.entries(DISPLAY_MODE_LABELS),
      (mode) => ctx.displayMode.set(mode),
    );
    label.title = 'How points are drawn';
    syncers.push(() => { select.value = ctx.displayMode.get(); });
    items.push(label);
  }

  if (ctx.labels) {
    const btn = toolbarButton(doc, { iconName: 'tag', text: 'Labels', title: 'Show feature labels on the map' });
    btn.addEventListener('click', () => {
      ctx.labels.set(!ctx.labels.get());
      setPressed(btn, ctx.labels.get());
    });
    syncers.push(() => setPressed(btn, ctx.labels.get()));
    items.push(btn);
  }

  if (ctx.drawing) {
    const drawing = ctx.drawing;
    const group = doc.createElement('span');
    group.className = 'yasr_toolbarGroup yasgui-geo-tb-draw';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Spatial filter');
    const rect = toolbarButton(doc, { iconName: 'square', text: 'Rectangle', title: 'Draw a rectangle filter' });
    const poly = toolbarButton(doc, { iconName: 'pentagon', text: 'Polygon', title: 'Draw a polygon filter (right-click to finish)' });
    const clear = toolbarButton(doc, { iconName: 'trash-2', text: 'Clear spatial filter', title: 'Clear spatial filter', iconOnly: true });
    rect.addEventListener('click', () => drawing.toggleRectangle());
    poly.addEventListener('click', () => drawing.togglePolygon());
    clear.addEventListener('click', () => drawing.clear());
    const syncDraw = (mode) => {
      setPressed(rect, mode === 'rectangle');
      setPressed(poly, mode === 'polygon');
    };
    drawing.onModeChange(syncDraw);
    syncers.push(() => syncDraw(drawing.getMode()));
    group.append(rect, poly, clear);
    items.push(group);
  }

  if (ctx.exportMenu) {
    const btn = toolbarButton(doc, { iconName: 'download', text: 'Export', title: 'Export the map data' });
    btn.appendChild(icon('chevron-down', { doc, size: 14 }));
    let entry;
    const menu = createExportMenu(ctx.exportMenu.map, ctx.exportMenu.getFeatureCollection, () => entry.setOpen(false), doc);
    entry = popover(btn, menu, 'start', 'menu');
    items.push(entry.anchor);
  }

  if (ctx.style || ctx.simplify) {
    const spacer = doc.createElement('span');
    spacer.className = 'yasr_toolbarSpacer';
    items.push(spacer);

    const btn = toolbarButton(doc, { iconName: 'sliders-horizontal', text: 'View settings', title: 'View settings' });
    const panel = doc.createElement('div');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'View settings');
    const section = (title, content) => {
      const wrap = doc.createElement('section');
      wrap.className = 'yasgui-geo-popover-section';
      const heading = doc.createElement('h3');
      heading.textContent = title;
      wrap.append(heading, content);
      return wrap;
    };
    if (ctx.style) panel.append(section('Style', createStyleForm(ctx.style.initial, ctx.style.onChange, doc)));
    if (ctx.simplify) {
      panel.append(section('Simplify geometry', createSimplifyField(
        ctx.simplify.initial, ctx.simplify.options, ctx.simplify.onChange, doc,
      )));
    }
    items.push(popover(btn, panel, 'end').anchor);
  }

  const closePopovers = () => { for (const p of popovers) p.setOpen(false); };
  const onDocClick = (ev) => {
    if (!popovers.some(p => p.anchor.contains(ev.target))) closePopovers();
  };
  doc.addEventListener('click', onDocClick);

  const sync = () => { for (const fn of syncers) fn(); };

  return {
    items,
    sync,
    closePopovers,
    /**
     * Put the items into the host's toolbar slot (again). yasr empties the
     * slot before every draw(), so this runs on each draw.
     * @param {HTMLElement} bar
     */
    mount(bar) {
      if (!bar) return;
      bar.append(...items);
      sync();
    },
    destroy() {
      doc.removeEventListener('click', onDocClick);
      for (const item of items) item.remove();
    },
  };
};
