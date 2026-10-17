import L from 'leaflet';
import { setIcon } from './icons.js';

export const DEFAULT_STYLE_STATE = {
  color: '#3388ff',
  opacity: 0.8,
  fillOpacity: 0.7,
  weight: 2,
  radius: 4,
};

const STORAGE_PREFIX = 'yasgui-geo-style:';

export const hashString = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const getStyleStorageKey = (yasr, options = {}) => {
  if (options.styleStorageKey) return options.styleStorageKey;
  const query = yasr?.yasqe?.getValue?.() || yasr?.yasqe?.value || '';
  const endpoint = yasr?.config?.requestConfig?.endpoint || '';
  return `${STORAGE_PREFIX}${hashString(`${endpoint}\n${query}`)}`;
};

const clamp = (value, min, max, fallback) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};

export const normalizeStyleState = (state = {}) => ({
  color: typeof state.color === 'string' && state.color ? state.color : DEFAULT_STYLE_STATE.color,
  opacity: clamp(state.opacity, 0, 1, DEFAULT_STYLE_STATE.opacity),
  fillOpacity: clamp(state.fillOpacity, 0, 1, DEFAULT_STYLE_STATE.fillOpacity),
  weight: clamp(state.weight, 0, 12, DEFAULT_STYLE_STATE.weight),
  radius: clamp(state.radius, 1, 30, DEFAULT_STYLE_STATE.radius),
});

export const loadStyleState = (key, storage = globalThis.localStorage) => {
  try {
    const raw = storage?.getItem?.(key);
    return normalizeStyleState(raw ? JSON.parse(raw) : DEFAULT_STYLE_STATE);
  } catch {
    return { ...DEFAULT_STYLE_STATE };
  }
};

export const saveStyleState = (key, state, storage = globalThis.localStorage) => {
  const normalized = normalizeStyleState(state);
  try {
    storage?.setItem?.(key, JSON.stringify(normalized));
  } catch {
    // localStorage can be unavailable in private modes; styling still works for the session.
  }
  return normalized;
};

export const resolveFeatureStyle = (feature, state, fallbackColor = DEFAULT_STYLE_STATE.color) => {
  const normalized = normalizeStyleState({ ...DEFAULT_STYLE_STATE, ...state, color: state?.color || fallbackColor });
  const color = feature?.properties?.wktColor?.value || normalized.color || fallbackColor;
  return {
    color,
    fillColor: color,
    weight: normalized.weight,
    radius: normalized.radius,
    opacity: normalized.opacity,
    fillOpacity: normalized.fillOpacity,
  };
};

/**
 * The style form: stroke colour, stroke and fill opacity, stroke thickness,
 * marker size and a reset button. Shared by the map control and the host
 * toolbar's view settings.
 * @param {Object} initialState
 * @param {(state: Object) => void} onChange - receives the normalized state
 * @param {Document} [doc]
 * @returns {HTMLElement}
 */
export const createStyleForm = (initialState, onChange, doc = document) => {
  let state = normalizeStyleState(initialState);
  const form = doc.createElement('div');
  form.className = 'yasgui-geo-style-form';

  const rangeInputs = {};
  const emit = () => onChange(normalizeStyleState(state));
  const row = (title, input) => {
    const label = doc.createElement('label');
    label.title = title;
    label.className = 'yasgui-geo-field';
    const span = doc.createElement('span');
    span.textContent = title;
    label.append(span, input);
    return label;
  };
  const range = (title, key, min, max, step) => {
    const input = doc.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(state[key]);
    input.oninput = () => { state = { ...state, [key]: Number(input.value) }; emit(); };
    rangeInputs[key] = input;
    return row(title, input);
  };
  const colorInput = doc.createElement('input');
  colorInput.type = 'color';
  colorInput.value = state.color;
  colorInput.oninput = () => { state = { ...state, color: colorInput.value }; emit(); };

  const resetBtn = doc.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'yasgui-geo-reset';
  resetBtn.textContent = 'Reset defaults';
  resetBtn.onclick = () => {
    state = { ...DEFAULT_STYLE_STATE };
    colorInput.value = state.color;
    for (const [key, input] of Object.entries(rangeInputs)) {
      input.value = String(state[key]);
    }
    emit();
  };

  form.append(
    row('Stroke colour', colorInput),
    range('Stroke opacity', 'opacity', 0, 1, 0.05),
    range('Fill opacity', 'fillOpacity', 0, 1, 0.05),
    range('Stroke thickness', 'weight', 0, 12, 1),
    range('Marker size', 'radius', 1, 30, 1),
    resetBtn,
  );
  return form;
};

/**
 * Map control with the style form behind a toggle button. Used when the host
 * has no plugin toolbar; with one, the form moves into View settings.
 * @param {L.Map} map
 * @param {Object} initialState
 * @param {(state: Object) => void} onChange
 * @returns {L.Control}
 */
export const addStyleControl = (map, initialState, onChange) => {
  const Control = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar yasgui-geo-style');

      // Toggle button (always visible)
      const toggle = document.createElement('a');
      toggle.href = '#';
      toggle.title = 'Style options';
      toggle.setAttribute('role', 'button');
      toggle.setAttribute('aria-label', 'Style options');
      toggle.setAttribute('aria-expanded', 'false');
      setIcon(toggle, 'palette');

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

      panel.append(createStyleForm(initialState, onChange));
      div.append(toggle, panel);
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    },
  });
  return new Control().addTo(map);
};
